import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { which } from './util.js';

let nodeSqlite;
async function loadNodeSqlite() {
  if (nodeSqlite !== undefined) return nodeSqlite;
  const orig = process.emitWarning;
  process.emitWarning = (w, ...a) => { if (String(w).includes('SQLite')) return; return orig.call(process, w, ...a); };
  try { nodeSqlite = await import('node:sqlite'); } catch { nodeSqlite = null; }
  process.emitWarning = orig;
  return nodeSqlite;
}

/** Copy the DB (+WAL) to a temp dir so we never lock or modify the user's live app DB. */
function snapshot(dbPath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hap-'));
  const dst = path.join(dir, 'db.sqlite');
  fs.copyFileSync(dbPath, dst);
  for (const ext of ['-wal', '-shm']) if (fs.existsSync(dbPath + ext)) fs.copyFileSync(dbPath + ext, dst + ext);
  return { dst, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** Run a read-only query. Returns rows (array of objects) or null if SQLite is unavailable. */
export async function query(dbPath, sql) {
  let snap;
  try { snap = snapshot(dbPath); } catch { return null; }
  try {
    const mod = await loadNodeSqlite();
    if (mod?.DatabaseSync) {
      const db = new mod.DatabaseSync(snap.dst, { readOnly: true });
      try { return db.prepare(sql).all(); } finally { db.close(); }
    }
    if (which('sqlite3')) {
      const r = spawnSync('sqlite3', ['-readonly', '-json', snap.dst, sql], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
      if (r.status !== 0) return null;
      return r.stdout.trim() ? JSON.parse(r.stdout) : [];
    }
    return null;
  } catch {
    return null;
  } finally {
    snap.cleanup();
  }
}

export async function sqliteAvailable() {
  return !!((await loadNodeSqlite())?.DatabaseSync || which('sqlite3'));
}
