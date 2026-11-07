// VS Code–family editors: Cursor (Chat/Composer/Agent), VS Code Copilot Chat, Windsurf, Antigravity, Trae, Kiro, VSCodium…
// plus Cline / Roo Code / Kilo Code task histories stored in each editor's globalStorage.
import fs from 'node:fs';
import path from 'node:path';
import { appSupport, find, isDir, readJson, projectName, exists } from '../util.js';
import { query } from '../sqlite.js';

export const id = 'vscode-family';
export const name = 'Editors';

const APPS = ['Cursor', 'Code', 'Code - Insiders', 'VSCodium', 'Windsurf', 'Windsurf - Next', 'Antigravity', 'Trae', 'Kiro', 'Void', 'Positron'];
const AGENT_EXT = { 'saoudrizwan.claude-dev': 'Cline', 'rooveterinaryinc.roo-cline': 'Roo Code', 'kilocode.kilo-code': 'Kilo Code' };

function workspaceProject(wsDir) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(wsDir, 'workspace.json'), 'utf8'));
    return projectName(decodeURIComponent(String(j.folder || j.workspace || '').replace(/^file:\/\//, '')));
  } catch { return null; }
}
const parse = s => { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return null; } };

export async function collect(log = () => {}) {
  const out = [];
  for (const app of APPS) {
    const user = path.join(appSupport(), app, 'User');
    if (!isDir(user)) continue;
    const tool = app === 'Code' || app === 'Code - Insiders' ? 'Copilot Chat' : app;

    // 1) Copilot-style chat sessions (JSON files per workspace)
    const ws = path.join(user, 'workspaceStorage');
    if (isDir(ws)) {
      for (const d of fs.readdirSync(ws)) {
        const wsDir = path.join(ws, d);
        const project = workspaceProject(wsDir);
        const cs = path.join(wsDir, 'chatSessions');
        if (isDir(cs)) {
          for (const f of fs.readdirSync(cs).filter(f => f.endsWith('.json'))) {
            const j = await readJson(path.join(cs, f));
            let last = '';
            for (const r of j?.requests || []) {
              const text = r.message?.text || (r.message?.parts || []).map(p => p.text || '').join('');
              if (text) out.push({ tool, session: j.sessionId || f, project, ts: r.timestamp || j.creationDate, text, context: last.slice(-400) });
              last = (r.response || []).map(x => typeof x?.value === 'string' ? x.value : (x?.value?.value || '')).join('');
            }
          }
        }
        // 2) Cursor legacy prompt list in per-workspace state.vscdb
        const db = path.join(wsDir, 'state.vscdb');
        if (app === 'Cursor' && exists(db)) {
          const rows = await query(db, "SELECT value FROM ItemTable WHERE key = 'aiService.prompts'");
          for (const row of rows || []) for (const p of parse(row.value) || []) {
            if (p?.text) out.push({ tool, session: 'ws-' + d, project, ts: null, text: p.text, context: '' });
          }
        }
      }
    }

    // 3) Cursor Composer / Agent bubbles (global state.vscdb, table cursorDiskKV)
    const gdb = path.join(user, 'globalStorage', 'state.vscdb');
    if (exists(gdb) && (app === 'Cursor' || app === 'Windsurf' || app === 'Antigravity' || app === 'Trae')) {
      const comps = await query(gdb, "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'");
      if (comps) {
        const bubbles = await query(gdb, "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'") || [];
        const byComposer = new Map();
        for (const b of bubbles) {
          const [, cid, bid] = b.key.split(':');
          const v = parse(b.value);
          if (!v) continue;
          if (!byComposer.has(cid)) byComposer.set(cid, new Map());
          byComposer.get(cid).set(bid, v);
        }
        for (const c of comps) {
          const cd = parse(c.value);
          if (!cd) continue;
          const cid = c.key.split(':')[1];
          const ts = cd.createdAt || null;
          let seq = [];
          if (Array.isArray(cd.conversation) && cd.conversation.length) seq = cd.conversation; // older inline format
          else if (Array.isArray(cd.fullConversationHeadersOnly)) seq = cd.fullConversationHeadersOnly.map(h => byComposer.get(cid)?.get(h.bubbleId) || { type: h.type });
          let last = '';
          for (const m of seq) {
            const t = m.text || '';
            if (m.type === 1 && t) out.push({ tool, session: cid, project: projectName(cd.context?.folderSelections?.[0]?.relativePath) || null, ts: m.createdAt || ts, text: t, context: last.slice(-400) });
            else if (m.type === 2 && t) last = t;
          }
        }
      }
    }

    // 4) Cline / Roo / Kilo task histories
    for (const [ext, agent] of Object.entries(AGENT_EXT)) {
      const tasks = path.join(user, 'globalStorage', ext, 'tasks');
      if (!isDir(tasks)) continue;
      const files = await find(tasks, (p, n) => n === 'api_conversation_history.json', { depth: 2 });
      for (const f of files) {
        const j = await readJson(f);
        const taskId = path.basename(path.dirname(f));
        let last = '';
        for (const m of Array.isArray(j) ? j : []) {
          const parts = typeof m.content === 'string' ? [m.content] : (m.content || []).filter(p => p.type === 'text').map(p => p.text);
          const raw = parts.join('\n');
          if (m.role === 'assistant') { if (raw) last = raw; continue; }
          if (m.role !== 'user') continue;
          const bits = [...raw.matchAll(/<(task|feedback|user_message|answer)>([\s\S]*?)<\/\1>/g)].map(x => x[2].trim());
          const text = bits.join('\n').trim();
          if (text) out.push({ tool: agent, session: taskId, project: null, ts: Number(taskId) || null, text, context: last.slice(-400) });
        }
      }
    }
  }
  return out;
}
