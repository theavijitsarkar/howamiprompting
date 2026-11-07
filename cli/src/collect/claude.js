// Claude Code — ~/.claude/projects/<project>/<session>.jsonl
import path from 'node:path';
import { HOME, find, isDir, jsonl, projectName } from '../util.js';

export const id = 'claude-code';
export const name = 'Claude Code';

function roots() {
  return [process.env.CLAUDE_CONFIG_DIR, path.join(HOME, '.claude'), path.join(HOME, '.config', 'claude')]
    .filter(Boolean).map(r => path.join(r, 'projects')).filter(isDir);
}

const textOf = c => typeof c === 'string' ? c
  : Array.isArray(c) ? c.filter(p => p && p.type === 'text').map(p => p.text).join('\n') : '';

export async function collect() {
  const out = [];
  const seen = new Set();
  for (const root of roots()) {
    const files = await find(root, p => p.endsWith('.jsonl'), { depth: 3 });
    for (const f of files) {
      let lastAssistant = '';
      for await (const o of jsonl(f)) {
        if (o.isSidechain) continue; // sub-agent traffic, not written by the human
        const msg = o.message;
        if (o.type === 'assistant' && msg) { const t = textOf(msg.content); if (t) lastAssistant = t; continue; }
        if (o.type !== 'user' || !msg || msg.role !== 'user' || o.isMeta || o.isCompactSummary) continue;
        if (Array.isArray(msg.content) && msg.content.every(p => p.type === 'tool_result')) continue;
        const text = textOf(msg.content);
        if (!text) continue;
        const key = (o.sessionId || f) + '|' + (o.uuid || text.slice(0, 80));
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          tool: name, session: o.sessionId || path.basename(f, '.jsonl'),
          project: projectName(o.cwd) || path.basename(path.dirname(f)).replace(/^-/, '').split('-').pop(),
          ts: o.timestamp || null, text, context: lastAssistant.slice(-400),
          kind: /^\[Request interrupted/.test(text) ? 'interrupt' : undefined,
        });
      }
    }
  }
  return out;
}
