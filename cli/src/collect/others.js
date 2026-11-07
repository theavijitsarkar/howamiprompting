// Continue.dev, OpenCode, Aider and SpecStory (Cursor history saved inside projects)
import fs from 'node:fs';
import path from 'node:path';
import { HOME, find, isDir, readJson, readText, projectName } from '../util.js';

export async function continueDev() {
  const dir = path.join(HOME, '.continue', 'sessions');
  if (!isDir(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'sessions.json')) {
    const j = await readJson(path.join(dir, f));
    let last = '';
    for (const h of j?.history || []) {
      const m = h.message || h;
      const t = typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map(p => p.text || '').join('\n') : '';
      if (m.role === 'user' && t) out.push({ tool: 'Continue', session: j.sessionId || f, project: projectName(j.workspaceDirectory), ts: j.dateCreated || null, text: t, context: last.slice(-400) });
      else if (t) last = t;
    }
  }
  return out;
}

export async function opencode() {
  const base = path.join(process.env.XDG_DATA_HOME || path.join(HOME, '.local', 'share'), 'opencode', 'storage');
  const msgDir = path.join(base, 'message'), partDir = path.join(base, 'part');
  if (!isDir(msgDir) || !isDir(partDir)) return [];
  const out = [];
  const files = await find(msgDir, p => p.endsWith('.json'), { depth: 2 });
  const msgs = [];
  for (const f of files) { const m = await readJson(f); if (m?.id) msgs.push(m); }
  msgs.sort((a, b) => (a.time?.created || 0) - (b.time?.created || 0));
  const last = new Map();
  for (const m of msgs) {
    const pd = path.join(partDir, m.id);
    if (!isDir(pd)) continue;
    let text = '';
    for (const pf of fs.readdirSync(pd)) { const p = await readJson(path.join(pd, pf)); if (p?.type === 'text' && !p.synthetic) text += (text ? '\n' : '') + (p.text || ''); }
    if (!text) continue;
    if (m.role === 'user') out.push({ tool: 'OpenCode', session: m.sessionID, project: projectName(m.path?.cwd || m.path?.root), ts: m.time?.created, text, context: (last.get(m.sessionID) || '').slice(-400) });
    else last.set(m.sessionID, text);
  }
  return out;
}

/** Aider + SpecStory files live inside projects, so we search likely code folders (bounded). */
export async function projectFiles(extraRoots = []) {
  const roots = [...new Set([...extraRoots, ...['code', 'Code', 'projects', 'Projects', 'dev', 'Developer', 'src', 'work', 'repos', 'git', 'GitHub', 'Sites', 'workspace', 'Documents', 'Desktop'].map(d => path.join(HOME, d)), HOME])].filter(isDir);
  const out = [];
  const seen = new Set();
  for (const r of roots) {
    const files = await find(r, (p, n) => n === '.aider.chat.history.md' || (/\.md$/.test(n) && p.includes(path.join('.specstory', 'history'))), { depth: r === HOME ? 3 : 5, limit: 3000, skipDirs: new Set([...SKIP_NO_DOT]) });
    for (const f of files) {
      if (seen.has(f)) continue; seen.add(f);
      const t = await readText(f, 50 * 1024 * 1024);
      if (!t) continue;
      if (f.endsWith('.aider.chat.history.md')) {
        const project = projectName(path.dirname(f));
        let session = 0, cur = [];
        const flush = () => { if (cur.length) out.push({ tool: 'Aider', session: project + '-' + session, project, ts: null, text: cur.join('\n'), context: '' }); cur = []; };
        for (const line of t.split(/\r?\n/)) {
          if (line.startsWith('# aider chat started at')) { flush(); session++; continue; }
          if (line.startsWith('#### ')) cur.push(line.slice(5)); else flush();
        }
        flush();
      } else {
        const project = projectName(path.dirname(path.dirname(path.dirname(f))));
        const parts = t.split(/^_\*\*(User|Assistant)\*\*_\s*$/m);
        let last = '';
        for (let i = 1; i < parts.length; i += 2) {
          const body = (parts[i + 1] || '').replace(/^\s*---\s*$/gm, '').trim();
          if (parts[i] === 'User' && body) out.push({ tool: 'Cursor (SpecStory)', session: path.basename(f), project, ts: null, text: body, context: last.slice(-400) });
          else last = body;
        }
      }
    }
  }
  return out;
}
const SKIP_NO_DOT = ['node_modules', '.git', 'Library', '.Trash', 'vendor', 'dist', 'build', '.next', '.venv', 'venv', '__pycache__', 'Pods', 'DerivedData', '.npm', '.cargo', '.rustup', 'go', '.gradle', '.m2', 'Applications', 'Music', 'Movies', 'Pictures', '.docker', 'AppData', 'snap', '.cache', '.local', '.vscode', '.cursor', 'Downloads'];
