import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { collectAll } from './collect/index.js';
import { clean } from './clean.js';
import { computeStats } from './stats.js';
import { detectAgents, AGENTS } from './agents.js';
import { analyze, overallFrom } from './analyze.js';
import { startServer } from './server.js';
import { saveReport, lastReport } from './store.js';

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
  --no-ai             Local stats only — nothing leaves your machine
  --sample <n>        Prompts sent for deep analysis (default 180)
  --since <days>      Only look at the last N days
  --include <file>    Also import a chat export (repeatable)
  --roots <dir>       Extra folder to search for Aider / SpecStory histories (repeatable)
  --last              Re-open your last report without rescanning
  --json <file>       Also write the report as JSON
  --port <n>          Port for the local report (default: random)
  --no-open           Don't open the browser
  -y, --yes           Don't ask questions (use the first available agent)
  -v, --version       Print version

${C.b('Privacy')}
  Everything is read locally. Only with an AI agent are ~180 sampled prompts (secrets redacted)
  sent — through YOUR OWN Claude Code / Codex / Gemini / API key, never to us.
`;

function parseArgs(argv) {
  const o = { include: [], roots: [], ai: true, open: true, sample: 180, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--agent') o.agent = next();
    else if (a === '--model') o.model = next();
    else if (a === '--no-ai') o.ai = false;
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

  let bundle, prompts = [];
  if (o.last) {
    bundle = lastReport();
    if (!bundle) { console.log(C.red('  No saved report yet — run without --last first.')); process.exit(1); }
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
    console.log(`     You are ${C.b(C.yellow(stats.persona.emoji + ' ' + stats.persona.name))}\n`);

    // 2. Agent
    let agent = null;
    if (o.ai) {
      console.log(C.b('  2. Deep analysis with your own AI'));
      const agents = await detectAgents();
      if (o.agent) {
        agent = agents.find(a => a.id === o.agent) || (AGENTS[o.agent] ? { id: o.agent, label: AGENTS[o.agent].label, privacy: AGENTS[o.agent].privacy } : null);
        if (!agent) console.log(C.yellow(`     Unknown agent "${o.agent}".`));
      } else if (!agents.length) {
        console.log(C.gray('     No AI agent found (Claude Code, Codex, Gemini CLI, an API key or Ollama).'));
        console.log(C.gray('     Showing local stats only. Install one and re-run for scores, makeovers & coaching.\n'));
      } else if (agents.length === 1 || o.yes || !process.stdin.isTTY) {
        agent = agents[0];
      } else {
        agents.forEach((a, i) => console.log(`     ${C.b(i + 1)}. ${a.label} ${C.gray('— ' + a.detail)}`));
        const ans = await ask(`     Which one? ${C.gray('[1]')} `);
        agent = agents[(parseInt(ans, 10) || 1) - 1] || agents[0];
      }
      if (agent && !o.yes && process.stdin.isTTY) {
        const n = Math.min(o.sample, prompts.filter(p => p.words >= 3).length);
        console.log(`     ${C.gray('About')} ${C.b(n)} ${C.gray('sampled prompts (secrets redacted) will be sent to')} ${C.b(agent.privacy)}.`);
        console.log(C.gray(`     It usually takes 1–4 minutes and uses a little of your ${agent.label} quota.`));
        const ans = (await ask(`     Continue? ${C.gray('[Y/n]')} `)).toLowerCase();
        if (ans === 'n' || ans === 'no') agent = null;
      }
    }

    let ai = null, aiError = null;
    if (agent) {
      const sp2 = spinner(`Asking ${agent.label} to read your prompts…`);
      try {
        ai = await analyze(prompts, stats, {
          agent: agent.id, model: o.model, sampleSize: o.sample, concurrency: AGENTS[agent.id].kind === 'cli' ? 2 : 3,
          onStep: (label) => sp2.update(`${agent.label}: ${label}…`),
        });
        sp2.stop(`${C.mint('✔')} Analysed ${ai.sampled} prompts with ${agent.label}`);
      } catch (e) {
        aiError = e.message;
        sp2.stop(`${C.yellow('!')} ${agent.label} analysis failed: ${C.gray(e.message.slice(0, 160))} — showing local stats.`);
      }
    }

    const scores = ai ? ai.scores : { ...stats.heuristic, overall: overallFrom(stats.heuristic) };
    bundle = {
      version: VERSION, generatedAt: new Date().toISOString(),
      agent: agent ? { id: agent.id, label: agent.label } : null, aiError,
      sources: found.filter(f => f.n > 0).map(f => ({ name: f.name, count: f.n })),
      scores, stats, ai,
    };
    saveReport(bundle);
    if (o.json) { fs.writeFileSync(path.resolve(o.json), JSON.stringify(bundle, null, 2)); console.log(C.gray(`     Saved ${o.json}`)); }

    console.log(`\n  ${C.b('Your prompting score:')} ${C.b(C.pink(scores.overall))}${C.gray('/100')}  ${ai?.level ? C.gray('(' + ai.level + ')') : ''}`);
    for (const k of ['clarity', 'context', 'specificity', 'structure', 'efficiency', 'english']) console.log(`     ${k.padEnd(12)} ${bar(scores[k])} ${scores[k]}`);
    if (ai?.headline) console.log(`\n     ${C.yellow('“' + ai.headline + '”')}`);
  }

  // 3. Report UI
  const agentId = bundle.agent?.id || null;
  const { url } = await startServer({ bundle, prompts, agent: agentId, model: o.model, port: o.port || 0 });
  console.log(`\n  ${C.b('3. Your report is live:')} ${C.blue(url)}`);
  console.log(C.gray('     Practice games, prompt makeovers and your share card are in there.'));
  console.log(C.gray('     Press Ctrl+C to quit.  ⭐ Like it? github.com/theavijitsarkar/howamiprompting\n'));
  if (o.open) openBrowser(url);
}
