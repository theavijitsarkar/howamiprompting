// Generic importer for files passed with --include (exports from any chat tool, markdown, JSON, JSONL, plain text)
const SKIP = ['<command-', '<local-command', '<environment_context', '<user_instructions', '<system-reminder', 'Caveat:', '[Request interrupted', '# AGENTS.md'];
const keep = t => typeof t === 'string' && t.trim().length > 3 && !SKIP.some(p => t.trim().startsWith(p));
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x && (x.type === 'text' || x.type === 'input_text' || (!x.type && typeof x.text === 'string'))).map(x => x.text).join('\n') : (c && typeof c.text === 'string' ? c.text : '');

function walk(node, out, d = 0) {
  if (!node || d > 14 || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach(n => walk(n, out, d + 1));
  const role = String(node.role || node.author?.role || node.sender || '').toLowerCase();
  if (['user', 'human'].includes(role) || ['user', 'human', 'user_message'].includes(String(node.type || '').toLowerCase())) {
    const t = textOf(node.content ?? node.text ?? node.message ?? node.content?.parts?.join?.('\n'));
    if (keep(t)) { out.push(t); return; }
  }
  for (const k in node) if (node[k] && typeof node[k] === 'object') walk(node[k], out, d + 1);
}

export function parseAny(raw, filename = '') {
  raw = raw.replace(/^﻿/, '').trim();
  const out = [];
  const first = raw.split(/\r?\n/, 1)[0];
  if (/\.jsonl$/i.test(filename) || (first.startsWith('{') && raw.includes('\n{'))) {
    for (const l of raw.split(/\r?\n/)) { try { walk(JSON.parse(l), out); } catch {} }
    if (out.length) return out;
  }
  if (/\.json$/i.test(filename) || raw.startsWith('{') || raw.startsWith('[')) {
    try { walk(JSON.parse(raw), out); if (out.length) return out; } catch {}
  }
  const USER = /^\s*(?:#{1,6}\s*)?(?:_?\*\*_?\s*)?(user|you|human|me|prompt)\b[^\n]{0,30}$/i;
  const BOT = /^\s*(?:#{1,6}\s*)?(?:_?\*\*_?\s*)?(assistant|cursor|claude|ai|model|gemini|agent|codex|copilot|bot|chatgpt|cascade)\b[^\n]{0,30}$/i;
  let mode = null, buf = [], saw = false;
  const flush = () => { if (mode === 'user' && keep(buf.join('\n'))) out.push(buf.join('\n').trim()); buf = []; };
  for (const line of raw.split(/\r?\n/)) {
    const inl = line.match(/^\s*(user|you|human|me)\s*:\s*(.+)$/i);
    if (inl) { flush(); saw = true; mode = 'user'; buf.push(inl[2]); continue; }
    if (USER.test(line)) { flush(); saw = true; mode = 'user'; continue; }
    if (BOT.test(line) || /^\s*(assistant|ai|claude)\s*:/i.test(line)) { flush(); saw = true; mode = 'bot'; continue; }
    if (mode === 'user') buf.push(line);
  }
  flush();
  if (!saw) (/\n\s*\n/.test(raw) ? raw.split(/\n\s*\n/) : raw.split(/\r?\n/)).forEach(p => keep(p) && out.push(p.trim()));
  return out;
}
