import path from 'node:path';
import * as claude from './claude.js';
import * as codex from './codex.js';
import * as gemini from './gemini.js';
import * as vscode from './vscode.js';
import { continueDev, opencode, projectFiles } from './others.js';
import { readText } from '../util.js';
import { parseAny } from './generic.js';

export const SOURCES = [
  { name: 'Claude Code', run: () => claude.collect() },
  { name: 'Codex', run: () => codex.collect() },
  { name: 'Gemini CLI', run: () => gemini.collect() },
  { name: 'Cursor · Copilot · Windsurf · Cline · Roo · Kilo', run: () => vscode.collect() },
  { name: 'Continue', run: () => continueDev() },
  { name: 'OpenCode', run: () => opencode() },
  { name: 'Aider · SpecStory', run: o => projectFiles(o.roots || []) },
];

/** Collect raw prompt records from every source. onProgress(sourceName, count|error). */
export async function collectAll(opts = {}, onProgress = () => {}) {
  const all = [];
  for (const s of SOURCES) {
    try {
      const recs = await s.run(opts);
      all.push(...recs);
      onProgress(s.name, recs.length);
    } catch (e) {
      onProgress(s.name, -1, e);
    }
  }
  for (const f of opts.include || []) {
    const t = await readText(path.resolve(f));
    if (t == null) { onProgress('file ' + f, -1, new Error('unreadable')); continue; }
    const recs = parseAny(t, f).map(text => ({ tool: 'Imported', session: path.basename(f), project: null, ts: null, text, context: '' }));
    all.push(...recs);
    onProgress(path.basename(f), recs.length);
  }
  return all;
}
