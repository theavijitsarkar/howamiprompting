import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { collectAll } from './collect/index.js';
import { clean } from './clean.js';
import { computeStats } from './stats.js';
import { detectAgents, AGENTS, SETUP, checkAgent, explainError } from './agents.js';
import { analyze } from './analyze.js';
import { startServer } from './server.js';
import { saveReport, lastReport, listReports, resetHistory } from './store.js';

const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => s => tty ? `\x1b[${code}m${s}\x1b[0m` : String(s);
const C = { b: c('1'), dim: c('2'), pink: c('38;5;205'), yellow: c('38;5;220'), mint: c('38;5;49'), blue: c('38;5;69'), red: c('31'), gray: c('90') };

const HELP = `
${C.b('howamiprompting')} — Spotify Wrapped for your AI coding prompts

${C.b('Usage')}
  npx howamiprompting [options]

${C.b('Options')}
  --agent <id>        AI to use for the deep analysis: claude | codex | gemini | anthropic | openrouter | openai | ollama
  --model <name>      Model override for that agent (e.g. haiku, sonnet, gpt-5-mini)
  --sample <n>        Prompts sent for deep analysis (default 180)
  --since <days>      Only look at the last N days
  --include <file>    Also import a chat export (repeatable)
  --roots <dir>       Extra folder to search for Aider / SpecStory histories (repeatable)
  --last              Re-open your last report without rescanning
  --fresh             Delete your saved history, then run a brand-new analysis
  --reset             Delete your saved history (~/.howamiprompting) and exit
  --json <file>       Also write the report as JSON
  --port <n>          Port for the local report (default: random)
  --no-open           Don't open the browser
  -y, --yes           Don't ask questions (use the first available agent)
  -v, --version       Print version

${C.b('Needs an AI')}
  The analysis is done by an AI you already have: Claude Code, Codex CLI, Gemini CLI,
  an Anthropic / OpenAI / OpenRouter API key, or Ollama. If none works, the CLI helps you set one up.

${C.b('Privacy')}
  Your history is read locally. ~180 sampled prompts (secrets redacted) go through
  YOUR OWN agent or key — never to us.
`;

function parseArgs(argv) {
  const o = { include: [], roots: [], open: true, sample: 180, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--agent') o.agent = next();
    else if (a === '--model') o.model = next();
    else if (a === '--no-ai') o.noAi = true;
    else if (a === '--reset') o.reset = true;
    else if (a === '--fresh') o.fresh = true;
    else if (a === '--sample') o.sample = Math.max(20, Math.min(1000, +next() || 180));
    else if (a === '--since') o.since = +next() || undefined;
    else if (a === '--include') o.include.push(next());
    else if (a === '--roots') o.roots.push(next());
    else if (a === '--last') o.last = true;
    else if (a === '--json') o.json = next();
    else if (a === '--port') o.port = +next() || 0;
    else if (a === '--no-open') o.open = false;
    else if (a === '-y' || a === '--yes') o.yes = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a === '-v' || a === '--version') o.version = true;
  }
  return o;
}

function spinner(text) {
  if (!tty) { process.stdout.write('  ' + text + '\n'); return { update() {}, stop(t) { if (t) console.log('  ' + t); } }; }
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0, cur = text;
  const t0 = Date.now();
  const id = setInterval(() => { process.stdout.write(`\r\x1b[K  ${C.pink(frames[i++ % frames.length])} ${cur} ${C.gray(Math.round((Date.now() - t0) / 1000) + 's')}`); }, 90);
  return {
    update(t) { cur = t; },
    stop(final) { clearInterval(id); process.stdout.write('\r\x1b[K'); if (final) console.log('  ' + final); },
  };
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}


function askHidden(q) {
  return new Promise(res => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let shown = false;
    rl._writeToOutput = str => { if (!shown) { rl.output.write(str); shown = true; } else rl.output.write(str.includes('\n') ? '\n' : '*'); };
    rl.question(q, a => { rl.close(); res(a.trim()); });
  });
}

function runInteractive(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status === 0;
}

const isTTY = () => process.stdin.isTTY && process.stdout.isTTY;

function printGuide() {
  console.log(`\n  ${C.b('howamiprompting needs an AI to analyse your prompts.')} ${C.gray('It uses YOUR agent — nothing is sent to us.')}`);
  console.log(`  Set up any ONE of these, then run ${C.b('npx howamiprompting')} again:\n`);
  console.log(`   ${C.b('Gemini CLI')}  ${C.gray('(free with a Google account)')}   ${C.mint(SETUP.gemini.install)}  →  run ${C.b('gemini')} once to log in`);
  console.log(`   ${C.b('Claude Code')} ${C.gray('(Claude Pro/Max or Console)')}   ${C.mint(SETUP.claude.install)}  →  run ${C.b('claude')} once to log in`);
  console.log(`   ${C.b('Codex CLI')}   ${C.gray('(ChatGPT Plus/Pro)')}            ${C.mint(SETUP.codex.install)}  →  ${C.b('codex login')}`);
  console.log(`   ${C.b('API key')}     export ANTHROPIC_API_KEY=…  or  OPENAI_API_KEY=…  or  OPENROUTER_API_KEY=…`);
  console.log(`   ${C.b('Ollama')}      ${C.gray('(local & free)')} install from https://ollama.com, then ${C.mint('ollama pull qwen2.5:14b')}\n`);
}

/** Find an agent that actually answers. If none does, walk the user through setting one up. */
async function getWorkingAgent(o) {
  const skip = new Set();
  let asked = false;
  for (;;) {
    let agents = (await detectAgents()).filter(a => !skip.has(a.id));
    if (o.agent) {
      const want = agents.filter(a => a.id === o.agent);
      if (!want.length) console.log(C.yellow(`     --agent ${o.agent} is not available on this machine.`));
      agents = want;
    } else if (agents.length > 1 && isTTY() && !o.yes && !asked) {
      asked = true;
      agents.forEach((a, i) => console.log(`     ${C.b(i + 1)}. ${a.label} ${C.gray('— ' + a.detail)}`));
      const n = parseInt(await ask(`     Which one should analyse your prompts? ${C.gray('[1]')} `), 10) || 1;
      const pick = agents[n - 1] || agents[0];
      agents = [pick, ...agents.filter(a => a !== pick)];
    }
    const failed = [];
    for (const a of agents) {
      const sp = spinner(`Checking ${a.label}…`);
      const r = await checkAgent(a.id, o.model);
      if (r.ok) { sp.stop(`${C.mint('✔')} ${a.label} is ready`); return a; }
      sp.stop(`${C.red('✗')} ${r.reason}`);
      failed.push({ ...a, ...r });
    }
    if (!failed.length) console.log(`     ${C.red('✗')} No AI agent found on this machine (Claude Code, Codex CLI, Gemini CLI, an API key or Ollama).`);
    if (!isTTY()) { printGuide(); return null; }

    console.log(`\n  ${C.b('Let\'s get you an AI to do the analysis.')} ${C.gray('It runs on your own account — nothing goes to us.')}`);
    const installed = id => !!AGENTS[id].detect();
    const opts = [
      ['1', 'gemini', `Gemini CLI  ${C.gray('— free with a Google account (easiest)')}`],
      ['2', 'claude', `Claude Code ${C.gray('— needs Claude Pro/Max or an Anthropic Console account')}`],
      ['3', 'codex', `Codex CLI   ${C.gray('— needs ChatGPT Plus/Pro or an OpenAI key')}`],
      ['4', 'key', `Paste an API key ${C.gray('(Anthropic, OpenAI or OpenRouter) for this run')}`],
      ['5', 'ollama', `Ollama ${C.gray('— free & fully local (needs a decent machine)')}`],
      ['r', 'retry', 'I fixed it — check again'],
      ['q', 'quit', 'Quit'],
    ];
    for (const [k, id, label] of opts) {
      const tag = SETUP[id] ? (installed(id) ? C.gray(' [installed]') : C.gray(' [not installed]')) : '';
      console.log(`     ${C.b(k)}) ${label}${tag}`);
    }
    const ans = (await ask(`     Choose ${C.gray('[1]')} `)).toLowerCase() || '1';
    const choice = (opts.find(x => x[0] === ans) || opts[0])[1];
    if (choice === 'quit') { printGuide(); return null; }
    if (choice === 'retry') continue;
    if (choice === 'ollama') {
      console.log(`\n     1. Install Ollama from ${C.blue('https://ollama.com/download')} and open it.`);
      console.log(`     2. In a new terminal run: ${C.mint('ollama pull qwen2.5:14b')} ${C.gray('(or llama3.1:8b on smaller machines)')}`);
      await ask(`     Press Enter when it's done… `);
      continue;
    }
    if (choice === 'key') {
      const prov = (await ask(`     Which provider? ${C.b('a')})nthropic  ${C.b('o')})penAI  ${C.b('r')})OpenRouter ${C.gray('[a]')} `)).toLowerCase() || 'a';
      const v = prov.startsWith('o') ? 'OPENAI_API_KEY' : prov.startsWith('r') ? 'OPENROUTER_API_KEY' : 'ANTHROPIC_API_KEY';
      const key = await askHidden(`     Paste your ${v} (hidden, used for this run only): `);
      if (key) { process.env[v] = key; o.agent = { ANTHROPIC_API_KEY: 'anthropic', OPENAI_API_KEY: 'openai', OPENROUTER_API_KEY: 'openrouter' }[v]; skip.clear(); console.log(C.gray(`     Tip: add  export ${v}=…  to your shell profile to skip this next time.`)); }
      continue;
    }
    // CLI agents: install if missing, then log in
    const S = SETUP[choice];
    if (!installed(choice)) {
      const yes = (await ask(`     Install ${S.name} now with  ${C.mint(S.install)} ? ${C.gray('[Y/n]')} `)).toLowerCase();
      if (yes === 'n' || yes === 'no') { console.log(C.gray(`     OK — run  ${S.install}  yourself, then choose "r".`)); continue; }
      const [cmd, ...args] = S.install.split(' ');
      if (!runInteractive(cmd, args)) {
        console.log(C.yellow(`     Install failed. If it's a permissions error, try:  sudo ${S.install}`));
        continue;
      }
    }
    console.log(`\n     Now log in to ${S.name}: we'll open it here — ${C.b(S.loginHint)}. ${C.gray('(' + S.needs + ')')}`);
    await ask(`     Press Enter to open ${S.name}… `);
    runInteractive(S.login[0], S.login.slice(1));
    o.agent = choice;
    skip.clear();
    console.log('');
  }
}

export function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch {}
}

const bar = (v, w = 20) => { const n = Math.round(v / 100 * w); return C.mint('█'.repeat(n)) + C.gray('░'.repeat(w - n)); };

export async function main(argv) {
  const o = parseArgs(argv);
  if (o.help) return console.log(HELP);
  if (o.version) return console.log(VERSION);

  console.log(`\n  ${C.b(C.pink('how am i prompting?'))} ${C.gray('v' + VERSION)}\n  ${C.gray('Spotify Wrapped for your AI coding prompts')}\n`);

  if (o.noAi) console.log(C.yellow('  --no-ai is no longer supported: the analysis is AI-only. It uses your own agent — nothing is sent to us.\n'));
  if (o.reset || o.fresh) {
    const n = listReports().length;
    let go = o.yes || !isTTY();
    if (!go) go = !/^n/i.test(await ask(`  Delete your saved history (${n} report${n === 1 ? '' : 's'} in ~/.howamiprompting)? ${C.gray('[Y/n]')} `));
    if (go) { resetHistory(); console.log(`  ${C.mint('✔')} History cleared — you're starting fresh.\n`); }
    if (o.reset) {
      console.log(C.gray('  To remove the npm cache too:  npm cache clean --force   (or  npm uninstall -g howamiprompting  if installed globally)\n'));
      return;
    }
  }

  let bundle, prompts = [];
  if (o.last) {
    bundle = lastReport();
    if (!bundle || !bundle.ai) { console.log(C.red('  No saved AI report yet — run  npx howamiprompting  first.')); process.exit(1); }
    console.log(C.gray(`  Re-opening your report from ${new Date(bundle.generatedAt).toLocaleString()}\n`));
  } else {
    // 1. Scan
    console.log(C.b('  1. Finding your prompts') + C.gray('  (read-only, nothing leaves your machine)'));
    const sp = spinner('Scanning…');
    const found = [];
    const raw = await collectAll({ include: o.include, roots: o.roots }, (name, n, err) => {
      sp.update(`Scanning… ${name}`);
      found.push({ name, n, err: err?.message });
    });
    sp.stop();
    for (const f of found) console.log(`     ${f.n > 0 ? C.mint('✔') : C.gray('·')} ${f.name.padEnd(48)} ${f.n > 0 ? C.b(f.n.toLocaleString()) : C.gray(f.n < 0 ? 'error' : 'none')}`);
    const cl = clean(raw, { since: o.since });
    prompts = cl.prompts;
    if (!prompts.length) {
      console.log(C.yellow('\n  No prompts found. Supported: Claude Code, Codex, Gemini CLI, Cursor, VS Code Copilot, Windsurf, Cline, Roo, Kilo, Continue, OpenCode, Aider, SpecStory.'));
      console.log(C.gray('  Have an export file? Run: npx howamiprompting --include path/to/chat.md\n'));
      process.exit(1);
    }
    const stats = computeStats(prompts, { interrupts: cl.interrupts });
    const t = stats.totals;
    console.log(`\n     ${C.b(t.prompts.toLocaleString())} prompts · ${C.b(t.sessions.toLocaleString())} sessions · ${C.b(t.projects)} projects · ${C.b(t.tools)} tools`);
    const prev = listReports().filter(r => r.ai);
    if (prev.length) console.log(C.gray(`     ${prev.length} earlier run${prev.length > 1 ? 's' : ''} saved (last score ${prev[prev.length - 1].scores?.overall}). Start over with --fresh.`));
    console.log('');

    // 2. Agent (required — the analysis is AI-only)
    console.log(C.b('  2. Connecting to your AI'));
    let agent = await getWorkingAgent(o);
    if (!agent) process.exit(1);
    if (!o.yes && isTTY()) {
      const n = Math.min(o.sample, prompts.filter(p => p.words >= 3).length);
      console.log(`     ${C.gray('About')} ${C.b(n)} ${C.gray('sampled prompts (secrets redacted) will be sent to')} ${C.b(agent.privacy)}.`);
      console.log(C.gray(`     It usually takes 1–4 minutes and uses a little of your ${agent.label} quota.`));
      const ans = (await ask(`     Continue? ${C.gray('[Y/n]')} `)).toLowerCase();
      if (ans === 'n' || ans === 'no') { console.log(C.gray('\n  No problem — nothing was sent. Bye!\n')); process.exit(0); }
    }

    // 3. Analyse (retry / switch agent on failure — never a fake report)
    console.log(C.b('\n  3. Analysing your prompts'));
    let ai = null;
    while (!ai) {
      const sp2 = spinner(`Asking ${agent.label} to read your prompts…`);
      try {
        ai = await analyze(prompts, stats, {
          agent: agent.id, model: o.model, sampleSize: o.sample, concurrency: AGENTS[agent.id].kind === 'cli' ? 2 : 3,
          onStep: (label) => sp2.update(`${agent.label}: ${label}…`),
        });
        sp2.stop(`${C.mint('✔')} Analysed ${ai.sampled} prompts with ${agent.label}`);
      } catch (e) {
        sp2.stop(`${C.red('✗')} ${explainError(agent.id, e.message)}`);
        console.log(C.gray(`     Details: ${e.message.slice(0, 220)}`));
        if (!isTTY()) { printGuide(); process.exit(1); }
        const a = (await ask(`     ${C.b('r')})etry  ${C.b('s')})witch / set up another AI  ${C.b('q')})uit ${C.gray('[r]')} `)).toLowerCase() || 'r';
        if (a.startsWith('q')) { printGuide(); process.exit(1); }
        if (a.startsWith('s')) { o.agent = undefined; agent = await getWorkingAgent(o); if (!agent) process.exit(1); }
      }
    }

    stats.persona = { name: ai.persona.name, emoji: ai.persona.emoji || '🤖', blurb: ai.persona.blurb || '', badges: stats.badges };
    const scores = ai.scores;
    bundle = {
      version: VERSION, generatedAt: new Date().toISOString(),
      agent: { id: agent.id, label: agent.label },
      sources: found.filter(f => f.n > 0).map(f => ({ name: f.name, count: f.n })),
      scores, stats, ai,
    };
    saveReport(bundle);
    if (o.json) { fs.writeFileSync(path.resolve(o.json), JSON.stringify(bundle, null, 2)); console.log(C.gray(`     Saved ${o.json}`)); }

    console.log(`\n  ${C.b('Your prompting score:')} ${C.b(C.pink(scores.overall))}${C.gray('/100')}  ${ai.level ? C.gray('(' + ai.level + ')') : ''}  ${C.yellow(stats.persona.emoji + ' ' + stats.persona.name)}`);
    for (const k of ['clarity', 'context', 'specificity', 'structure', 'efficiency', 'english']) console.log(`     ${k.padEnd(12)} ${bar(scores[k])} ${scores[k]}`);
    if (ai.headline) console.log(`\n     ${C.yellow('“' + ai.headline + '”')}`);
  }

  // 3. Report UI
  const agentId = bundle.agent?.id || null;
  const { url } = await startServer({ bundle, prompts, agent: agentId, model: o.model, port: o.port || 0 });
  console.log(`\n  ${C.b('4. Your report is live:')} ${C.blue(url)}`);
  console.log(C.gray('     Practice games, prompt makeovers and your share card are in there.'));
  console.log(C.gray('     Press Ctrl+C to quit.  ⭐ Like it? github.com/theavijitsarkar/howamiprompting\n'));
  if (o.open) openBrowser(url);
}
