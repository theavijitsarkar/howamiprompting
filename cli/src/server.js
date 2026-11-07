// Tiny local web server for the report UI. Binds to 127.0.0.1 only and requires a per-run token.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateTest, gradeTest, publicTest } from './practice.js';
import { history } from './store.js';

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };
const LEADERBOARD = process.env.HOWAMIPROMPTING_API || 'https://howamiprompting.com/api';

export function startServer({ bundle, prompts, agent, model, port = 0 }) {
  const token = crypto.randomBytes(16).toString('hex');
  const tests = new Map();

  const send = (res, code, body, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const body = req => new Promise((ok, bad) => { let b = ''; req.on('data', d => { b += d; if (b.length > 2e6) req.destroy(); }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(e); } }); });

  const server = http.createServer(async (req, res) => {
    try {
      const host = (req.headers.host || '').split(':')[0];
      if (!['127.0.0.1', 'localhost'].includes(host)) return send(res, 403, { error: 'forbidden' }); // DNS-rebinding guard
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/')) {
        if (req.headers['x-hap-token'] !== token) return send(res, 401, { error: 'bad token — reopen the link printed in your terminal' });
        if (url.pathname === '/api/report') return send(res, 200, { ...bundle, history: history() });
        if (url.pathname === '/api/prompts') {
          const q = (url.searchParams.get('q') || '').toLowerCase(), tool = url.searchParams.get('tool'), flag = url.searchParams.get('flag');
          const off = +url.searchParams.get('offset') || 0;
          let list = prompts;
          if (tool) list = list.filter(p => p.tool === tool);
          if (q) list = list.filter(p => p.text.toLowerCase().includes(q));
          if (flag === 'short') list = list.filter(p => p.words <= 4);
          if (flag === 'long') list = list.filter(p => p.words >= 80);
          if (flag === 'paste') list = list.filter(p => p.logLines || p.codeLines);
          const page = [...list].reverse().slice(off, off + 50).map(({ id, tool, project, ts, text, words }) => ({ id, tool, project, ts, text, words }));
          return send(res, 200, { total: list.length, items: page });
        }
        if (url.pathname === '/api/practice/new' && req.method === 'POST') {
          const worst = bundle.ai?.makeovers?.[Math.floor(Math.random() * (bundle.ai.makeovers.length || 1))]?.original || bundle.stats?.examples?.vague?.[0] || null;
          const t = await generateTest({ agent, model, report: bundle.ai, stats: bundle.stats, worstPrompt: worst });
          const id = crypto.randomBytes(6).toString('hex');
          tests.set(id, t);
          return send(res, 200, { id, ...publicTest(t) });
        }
        if (url.pathname === '/api/practice/submit' && req.method === 'POST') {
          const b = await body(req);
          const t = tests.get(b.id);
          if (!t) return send(res, 404, { error: 'test expired — start a new one' });
          return send(res, 200, await gradeTest({ agent, model, test: t, answers: b.answers || {} }));
        }
        if (url.pathname === '/api/card' && req.method === 'POST') {
          // Upload ONLY the rendered share-card PNG (scores, no prompts) to get a public link with a preview image.
          const b = await body(req);
          const png = String(b.png || '');
          if (!png.startsWith('data:image/png;base64,') || png.length > 2.5e6) return send(res, 400, { error: 'Bad image' });
          const payload = { png, overall: bundle.scores.overall, persona: bundle.stats.persona.name, emoji: bundle.stats.persona.emoji, version: bundle.version };
          const r = await fetch(LEADERBOARD + '/card.php', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
          const j = await r.json().catch(() => ({ error: 'Share service unavailable' }));
          return send(res, r.ok ? 200 : 502, r.ok ? j : { error: j.error || 'Share service unavailable' });
        }
        if (url.pathname === '/api/publish' && req.method === 'POST') {
          const b = await body(req);
          const s = bundle.stats, sc = bundle.scores;
          const payload = {
            handle: String(b.handle || '').slice(0, 40), github: String(b.github || '').slice(0, 40), country: String(b.country || '').slice(0, 2),
            overall: sc.overall, scores: sc, persona: s.persona.name, level: bundle.ai?.level || null, ai: !!bundle.ai,
            prompts: s.totals.prompts, tools: s.tools.map(t => t.name), median_words: s.length.median, version: bundle.version,
          };
          const r = await fetch(LEADERBOARD + '/publish.php', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
          const j = await r.json().catch(() => ({ error: 'Leaderboard unavailable' }));
          return send(res, r.ok ? 200 : 502, r.ok ? j : { error: j.error || 'Leaderboard unavailable' });
        }
        return send(res, 404, { error: 'not found' });
      }
      let p = url.pathname === '/' ? '/index.html' : url.pathname;
      const file = path.join(UI, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
      if (!file.startsWith(UI) || !fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain');
      return send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const p = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${p}/#t=${token}`, port: p, token });
    });
  });
}
