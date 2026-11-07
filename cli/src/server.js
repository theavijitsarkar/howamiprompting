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
