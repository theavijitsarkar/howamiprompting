import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const HOME = os.homedir();
export const PLATFORM = process.platform;

/** Per-OS application-support directory for VS Code–family apps. */
export function appSupport() {
  if (PLATFORM === 'darwin') return path.join(HOME, 'Library', 'Application Support');
  if (PLATFORM === 'win32') return process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
  return process.env.XDG_CONFIG_HOME || path.join(HOME, '.config');
}

export const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };
export const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

export async function readText(p, max = 200 * 1024 * 1024) {
  try {
    const st = await fsp.stat(p);
    if (st.size > max) return null;
    return await fsp.readFile(p, 'utf8');
  } catch { return null; }
}

export async function readJson(p) {
  const t = await readText(p);
  if (t == null) return null;
  try { return JSON.parse(t); } catch { return null; }
}

/** Iterate JSONL lines lazily-ish (file is read whole; sessions are rarely huge). */
export async function* jsonl(p) {
  const t = await readText(p);
  if (!t) return;
  for (const line of t.split(/\r?\n/)) {
    if (!line || line[0] !== '{') continue;
    try { yield JSON.parse(line); } catch { /* skip */ }
  }
}

/** Recursive file finder with depth + count limits. */
export async function find(root, test, { depth = 6, limit = 20000, skipDirs = SKIP } = {}) {
  const out = [];
  async function walk(dir, d) {
    if (out.length >= limit || d > depth) return;
    let ents;
    try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= limit) return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (skipDirs.has(e.name)) continue;
        await walk(p, d + 1);
      } else if (e.isFile() && test(p, e.name)) out.push(p);
    }
  }
  await walk(root, 0);
  return out;
}
export const SKIP = new Set(['node_modules', '.git', 'Library', '.Trash', 'vendor', '.cache', 'dist', 'build', '.next', '.venv', 'venv', '__pycache__', 'Pods', 'DerivedData', '.npm', '.cargo', '.rustup', 'go', '.gradle', '.m2', 'Applications', 'Music', 'Movies', 'Pictures', 'Photos Library.photoslibrary', '.docker', 'AppData', 'snap']);

export function which(cmd) {
  const r = spawnSync(PLATFORM === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return (r.stdout || '').split(/\r?\n/)[0].trim() || null;
}

export function toISO(t) {
  if (t == null || t === '') return null;
  if (typeof t === 'number') return new Date(t < 1e12 ? t * 1000 : t).toISOString();
  const d = new Date(t);
  return isNaN(d) ? null : d.toISOString();
}

export function projectName(p) {
  if (!p) return null;
  return path.basename(String(p).replace(/[\\/]+$/, '')) || null;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function dataDir() {
  const d = process.env.HOWAMIPROMPTING_HOME || path.join(HOME, '.howamiprompting');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
