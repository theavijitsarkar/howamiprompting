// Local history: ~/.howamiprompting/reports/*.json — lets you track your score over time.
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './util.js';

const dir = () => { const d = path.join(dataDir(), 'reports'); fs.mkdirSync(d, { recursive: true }); return d; };

export function saveReport(bundle) {
  const file = path.join(dir(), bundle.generatedAt.replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(file, JSON.stringify(bundle));
  return file;
}

export function listReports() {
  return fs.readdirSync(dir()).filter(f => f.endsWith('.json')).sort().map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(dir(), f), 'utf8')); } catch { return null; }
  }).filter(Boolean);
}

export function history() {
  return listReports().map(r => ({ date: r.generatedAt, overall: r.scores?.overall, scores: r.scores, prompts: r.stats?.totals?.prompts, ai: !!r.ai }));
}

export const lastReport = () => listReports().pop() || null;
