// OpenAI Codex CLI — ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
import path from 'node:path';
import { HOME, find, isDir, jsonl, projectName } from '../util.js';

export const id = 'codex';
export const name = 'Codex';

const textOf = c => typeof c === 'string' ? c
  : Array.isArray(c) ? c.filter(p => p && /text/.test(p.type || 'text') && typeof p.text === 'string').map(p => p.text).join('\n') : '';

export async function collect() {
  const root = path.join(process.env.CODEX_HOME || path.join(HOME, '.codex'), 'sessions');
  if (!isDir(root)) return [];
  const out = [];
  const files = await find(root, p => /\.jsonl$/.test(p), { depth: 5 });
  for (const f of files) {
    let session = path.basename(f, '.jsonl'), cwd = null, lastAssistant = '';
    const seen = new Set();
    for await (const o of jsonl(f)) {
      const p = o.payload || o;
      if (o.type === 'session_meta') { session = p.id || session; cwd = p.cwd || cwd; continue; }
      if (p.type === 'turn_context' || o.type === 'turn_context') { cwd = p.cwd || cwd; continue; }
      let text = null;
      if (p.type === 'message' && p.role === 'assistant') { const t = textOf(p.content); if (t) lastAssistant = t; continue; }
      if (p.type === 'message' && p.role === 'user') text = textOf(p.content);
      else if (o.type === 'event_msg' && p.type === 'user_message') text = p.message;
      if (!text) continue;
      if (/^\s*<(environment_context|user_instructions|permissions|turn_aborted)/.test(text) || /^# AGENTS\.md/.test(text)) continue;
      const key = text.trim();
      if (seen.has(key)) continue; // response_item + event_msg duplicates
      seen.add(key);
      out.push({ tool: name, session, project: projectName(cwd), ts: o.timestamp || null, text, context: lastAssistant.slice(-400) });
    }
  }
  return out;
}
