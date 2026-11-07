// Use whatever AI the developer already has: Claude Code, Codex, Gemini CLI, an API key, or Ollama.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { which } from './util.js';

const CLI_TIMEOUT = 6 * 60 * 1000;

function run(cmd, args, input, { cwd, timeout = CLI_TIMEOUT } = {}) {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') args = args.map(a => /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a); // shell:true on Windows
    const p = spawn(cmd, args, { cwd, env: { ...process.env, NO_COLOR: '1', CI: '1' }, stdio: ['pipe', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    let out = '', err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} timed out`)); }, timeout);
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('error', e => { clearTimeout(t); reject(e); });
    p.on('close', code => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${(err || out).slice(-400)}`)); });
    p.stdin.on('error', () => {}); // agent may exit before reading stdin (EPIPE)
    p.stdin.end(input);
  });
}

const sandbox = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hap-agent-'));

async function postJSON(url, headers, body, timeout = 180000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || j.error || `HTTP ${r.status}`);
    return j;
  } finally { clearTimeout(t); }
}

export const AGENTS = {
  claude: {
    label: 'Claude Code', kind: 'cli', privacy: 'Anthropic (via your Claude Code login)',
    detect: () => which('claude'),
    async ask(prompt, o = {}) {
      const dir = sandbox();
      try {
        const args = ['-p', '--output-format', 'json'];
        if (o.model) args.push('--model', o.model);
        const raw = await run('claude', args, prompt, { cwd: dir });
        try { const j = JSON.parse(raw); if (j.is_error) throw new Error(j.result || 'Claude Code error'); return j.result ?? raw; } catch (e) { if (/Claude Code error/.test(e.message)) throw e; return raw; }
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    },
  },
  codex: {
    label: 'Codex CLI', kind: 'cli', privacy: 'OpenAI (via your Codex login)',
    detect: () => which('codex'),
    async ask(prompt, o = {}) {
      const dir = sandbox();
      const outFile = path.join(dir, 'last.txt');
      try {
        const args = ['exec', '--skip-git-repo-check', '-s', 'read-only', '--color', 'never', '--output-last-message', outFile];
        if (o.model) args.push('-m', o.model);
        args.push('-');
        const raw = await run('codex', args, prompt, { cwd: dir });
        return fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : raw;
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    },
  },
  gemini: {
    label: 'Gemini CLI', kind: 'cli', privacy: 'Google (via your Gemini CLI login)',
    detect: () => which('gemini'),
    async ask(prompt, o = {}) {
      const dir = sandbox();
      try {
        const args = ['-p', 'Follow the instructions in the input above. Reply with the JSON only.'];
        if (o.model) args.push('-m', o.model);
        return await run('gemini', args, prompt, { cwd: dir });
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    },
  },
  anthropic: {
    label: 'Anthropic API', kind: 'api', privacy: 'Anthropic (your ANTHROPIC_API_KEY)',
    detect: () => process.env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY' : null,
    async ask(prompt, o = {}) {
      const j = await postJSON('https://api.anthropic.com/v1/messages', { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        { model: o.model || 'claude-haiku-4-5', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] });
      return (j.content || []).map(c => c.text || '').join('');
    },
  },
  openai: {
    label: 'OpenAI API', kind: 'api', privacy: 'OpenAI (your OPENAI_API_KEY)',
    detect: () => process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY' : null,
    async ask(prompt, o = {}) {
      const j = await postJSON('https://api.openai.com/v1/chat/completions', { authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
        { model: o.model || 'gpt-4.1-mini', response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] });
      return j.choices?.[0]?.message?.content || '';
    },
  },
  openrouter: {
    label: 'OpenRouter API', kind: 'api', privacy: 'OpenRouter (your OPENROUTER_API_KEY)',
    detect: () => process.env.OPENROUTER_API_KEY ? 'OPENROUTER_API_KEY' : null,
    async ask(prompt, o = {}) {
      const j = await postJSON('https://openrouter.ai/api/v1/chat/completions', { authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY, 'X-Title': 'howamiprompting' },
        { model: o.model || 'anthropic/claude-haiku-4.5', messages: [{ role: 'user', content: prompt }] });
      return j.choices?.[0]?.message?.content || '';
    },
  },
  ollama: {
    label: 'Ollama (local)', kind: 'local', privacy: 'nobody — runs on this machine',
    _model: null,
    async detectAsync() {
      try {
        const r = await fetch((process.env.OLLAMA_HOST || 'http://127.0.0.1:11434') + '/api/tags', { signal: AbortSignal.timeout(1500) });
        const j = await r.json();
        const names = (j.models || []).map(m => m.name);
        const pref = ['qwen3', 'qwen2.5', 'llama3.3', 'llama3.1', 'gemma3', 'mistral-small', 'mistral', 'phi4'];
        this._model = names.find(n => pref.some(p => n.startsWith(p))) || names[0] || null;
        return this._model ? 'model ' + this._model : null;
      } catch { return null; }
    },
    async ask(prompt, o = {}) {
      const j = await postJSON((process.env.OLLAMA_HOST || 'http://127.0.0.1:11434') + '/api/generate', {},
        { model: o.model || this._model, prompt, format: 'json', stream: false, options: { num_ctx: 32768, temperature: 0.3 } }, 15 * 60 * 1000);
      return j.response || '';
    },
  },
};

export const ORDER = ['claude', 'codex', 'gemini', 'anthropic', 'openrouter', 'openai', 'ollama'];

export async function detectAgents() {
  const found = [];
  for (const id of ORDER) {
    const a = AGENTS[id];
    const d = a.detectAsync ? await a.detectAsync() : a.detect();
    if (d) found.push({ id, label: a.label, detail: d, privacy: a.privacy, kind: a.kind });
  }
  return found;
}

export function extractJSON(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try { return JSON.parse(t); } catch {}
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch {} }
  throw new Error('The agent did not return valid JSON');
}

/** Ask the agent and parse JSON, retrying once. */
export async function askJSON(agentId, prompt, { model, validate = () => {} } = {}) {
  const a = AGENTS[agentId];
  let last;
  for (let i = 0; i < 2; i++) {
    try {
      const txt = await a.ask(prompt + (i ? '\n\nIMPORTANT: your previous reply was not valid JSON. Reply with ONE JSON object and nothing else.' : ''), { model });
      const j = extractJSON(txt);
      validate(j);
      return j;
    } catch (e) { last = e; }
  }
  throw last;
}
