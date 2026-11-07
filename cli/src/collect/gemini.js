// Google Gemini CLI — ~/.gemini/tmp/<project-hash>/{logs.json, chats/*.json}
import path from 'node:path';
import { HOME, find, isDir, readJson } from '../util.js';

export const id = 'gemini-cli';
export const name = 'Gemini CLI';

export async function collect() {
  const root = path.join(HOME, '.gemini', 'tmp');
  if (!isDir(root)) return [];
  const out = [];
  const seen = new Set();
  const push = (r) => { const k = r.session + '|' + r.text.slice(0, 120); if (!seen.has(k)) { seen.add(k); out.push(r); } };
  const files = await find(root, p => p.endsWith('.json'), { depth: 3 });
  for (const f of files) {
    const j = await readJson(f);
    if (!j) continue;
    const project = path.basename(path.dirname(f)) === 'chats' ? path.basename(path.dirname(path.dirname(f))).slice(0, 8) : path.basename(path.dirname(f)).slice(0, 8);
    if (Array.isArray(j)) { // logs.json
      for (const m of j) if (m && m.type === 'user' && typeof m.message === 'string') push({ tool: name, session: m.sessionId || f, project: 'gemini-' + project, ts: m.timestamp, text: m.message, context: '' });
    } else if (Array.isArray(j.messages)) { // chats/session-*.json
      let last = '';
      for (const m of j.messages) {
        const t = typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map(x => x.text || '').join('\n') : (m.parts || []).map(x => x.text || '').join('\n');
        if (m.type === 'user' || m.role === 'user') { if (t) push({ tool: name, session: j.sessionId || f, project: 'gemini-' + project, ts: m.timestamp || j.startTime, text: t, context: last.slice(-400) }); }
        else if (t) last = t;
      }
    }
  }
  return out;
}
