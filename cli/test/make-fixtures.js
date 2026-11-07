// Builds a fake $HOME with chat histories from every supported tool. Usage: node test/make-fixtures.js /tmp/fakehome
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const H = path.resolve(process.argv[2] || '/tmp/hap-fakehome');
fs.rmSync(H, { recursive: true, force: true });
const w = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

const P = [
  'fix the login its not working',
  'ok',
  'continue',
  'yes do it',
  'why is the build failing again???',
  'still not working. same error',
  'can you add a export button in leads page and also make the filter work and also fix the date picker',
  'The checkout page shows a blank screen after payment. Expected: redirect to /orders/:id with a success toast. Currently the API returns 200 but the response body is null. Only change the frontend handler in checkout.tsx — do not touch the API.',
  'i have did the changes in login page but still same issue is coming',
  'wtf did you delete my migration file',
  'please refactor the user service to use dependency injection, keep the public interface the same and add unit tests for the 3 public methods',
  'make it look better',
  'thanks!',
  'no, not like that. revert',
  'Error: Cannot read properties of undefined (reading \'map\')\n    at Leads.tsx:42:18\n    at renderWithHooks (react-dom.development.js:14985:18)\n    at mountIndeterminateComponent (react-dom.development.js:17811:13)\nfix',
  'the response coming null from server and page showing blank',
  'Can able to add pagination to the orders table? 20 rows per page, server side.',
  'Use pnpm, not npm. Always use TypeScript strict mode.',
  'use pnpm not npm',
  'Use pnpm, not npm.',
  'dont add comments to the code',
  'Don\'t add comments to the code.',
  'Write a migration that adds a nullable `archived_at` timestamp to the projects table, backfill nothing, and add an index on (user_id, archived_at). Postgres 15.',
  'why because the token is expire',
  'its more better now but the hero image not loading in mobile',
  'go ahead',
  'Explain how the webhook retry logic works in payments/worker.ts and list any race conditions you see.',
  'make the dashboard ui like the other one we did but better and fast, use same colors, charts not coming properly fix that also',
  'please add dark mode toggle in settings page',
  'seriously?? i told you not to change the api',
  'lgtm',
  'Add rate limiting to /api/login: 5 attempts per 15 minutes per IP, return 429 with a Retry-After header. Use the existing redis client in lib/redis.ts.',
  'u r breaking everything',
  'here is my api key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789 use it',
  'write tests',
  'The CSV export times out for accounts with more than 50k leads. Stream the rows instead of building the whole file in memory, and keep the same column order.',
];
const base = Date.parse('2026-08-01T10:00:00Z');
let k = 0;
const ts = () => new Date(base + (k++) * 3.7 * 3600 * 1000 + (k % 5) * 600000).toISOString();

// Claude Code
for (let s = 0; s < 4; s++) {
  const lines = [];
  for (let i = 0; i < 14; i++) {
    const t = P[(s * 9 + i) % P.length];
    lines.push(JSON.stringify({ type: 'user', sessionId: 'cc' + s, cwd: '/Users/dev/code/crm-app', timestamp: ts(), uuid: `u${s}${i}`, message: { role: 'user', content: i % 3 ? t : [{ type: 'text', text: t }] } }));
    lines.push(JSON.stringify({ type: 'assistant', sessionId: 'cc' + s, message: { role: 'assistant', content: [{ type: 'text', text: 'I updated the handler and ran the tests. Want me to also update the docs?' }] } }));
    if (i === 5) lines.push(JSON.stringify({ type: 'user', sessionId: 'cc' + s, timestamp: ts(), message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } }));
    if (i === 7) lines.push(JSON.stringify({ type: 'user', sessionId: 'cc' + s, timestamp: ts(), message: { role: 'user', content: '[Request interrupted by user]' } }));
  }
  lines.push(JSON.stringify({ type: 'user', isSidechain: true, sessionId: 'cc' + s, message: { role: 'user', content: 'SUBAGENT PROMPT should be ignored' } }));
  lines.push(JSON.stringify({ type: 'user', isMeta: true, sessionId: 'cc' + s, message: { role: 'user', content: 'Caveat: meta' } }));
  w(path.join(H, '.claude/projects/-Users-dev-code-crm-app', `cc${s}.jsonl`), lines.join('\n'));
}
// Codex
for (let s = 0; s < 2; s++) {
  const lines = [JSON.stringify({ type: 'session_meta', payload: { id: 'cx' + s, cwd: '/Users/dev/code/api-server' } })];
  lines.push(JSON.stringify({ type: 'response_item', timestamp: ts(), payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>cwd</environment_context>' }] } }));
  for (let i = 0; i < 10; i++) {
    const t = P[(s * 13 + i + 3) % P.length];
    const T = ts();
    lines.push(JSON.stringify({ type: 'response_item', timestamp: T, payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: t }] } }));
    lines.push(JSON.stringify({ type: 'event_msg', timestamp: T, payload: { type: 'user_message', message: t } }));
    lines.push(JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done. I changed 2 files.' }] } }));
  }
  w(path.join(H, `.codex/sessions/2026/09/0${s + 1}/rollout-cx${s}.jsonl`), lines.join('\n'));
}
// Gemini CLI
w(path.join(H, '.gemini/tmp/abcdef123456/logs.json'), JSON.stringify(P.slice(0, 8).map((t, i) => ({ sessionId: 'gm1', messageId: i, type: 'user', message: t, timestamp: ts() }))));
// Copilot chat (VS Code) — Linux path ~/.config/Code
const vs = path.join(H, '.config/Code/User/workspaceStorage/ws1');
w(path.join(vs, 'workspace.json'), JSON.stringify({ folder: 'file:///home/dev/code/mobile-app' }));
w(path.join(vs, 'chatSessions/s1.json'), JSON.stringify({ sessionId: 'cp1', creationDate: Date.now(), requests: P.slice(10, 18).map((t, i) => ({ message: { text: t }, timestamp: Date.parse(ts()), response: [{ value: 'Here is the change.' }] })) }));
// Cursor composer (sqlite)
const cdb = path.join(H, '.config/Cursor/User/globalStorage/state.vscdb');
fs.mkdirSync(path.dirname(cdb), { recursive: true });
const db = new DatabaseSync(cdb);
db.exec('CREATE TABLE cursorDiskKV (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)');
const ins = db.prepare('INSERT INTO cursorDiskKV VALUES (?, ?)');
const headers = [];
P.slice(18, 28).forEach((t, i) => {
  headers.push({ bubbleId: 'u' + i, type: 1 }, { bubbleId: 'a' + i, type: 2 });
  ins.run(`bubbleId:comp1:u${i}`, JSON.stringify({ type: 1, text: t, createdAt: ts() }));
  ins.run(`bubbleId:comp1:a${i}`, JSON.stringify({ type: 2, text: 'Applied the edit to 3 files.' }));
});
ins.run('composerData:comp1', JSON.stringify({ composerId: 'comp1', createdAt: Date.parse(ts()), fullConversationHeadersOnly: headers }));
db.close();
// Cline
w(path.join(H, '.config/Code/User/globalStorage/saoudrizwan.claude-dev/tasks/1725000000000/api_conversation_history.json'), JSON.stringify([
  { role: 'user', content: [{ type: 'text', text: '<task>\nadd a search box in the header that filters products as you type\n</task>' }, { type: 'text', text: '<environment_details>lots of stuff</environment_details>' }] },
  { role: 'assistant', content: [{ type: 'text', text: 'I will add it.' }] },
  { role: 'user', content: [{ type: 'text', text: '[attempt_completion] Result:\n<feedback>\nits not filtering when i type capital letters\n</feedback>' }] },
]));
// Continue
w(path.join(H, '.continue/sessions/c1.json'), JSON.stringify({ sessionId: 'ct1', workspaceDirectory: '/home/dev/code/landing', dateCreated: ts(), history: [{ message: { role: 'user', content: 'center the div vertically on mobile' } }, { message: { role: 'assistant', content: 'Use flex.' } }] }));
// Aider + SpecStory inside a project
w(path.join(H, 'code/landing/.aider.chat.history.md'), '# aider chat started at 2026-09-10 10:00:00\n\n#### add a contact form with name email and message\n\nSure...\n\n#### also validate the email\n\nDone.\n');
w(path.join(H, 'code/landing/.specstory/history/2026-09-11_chat.md'), '_**User**_\n\nmake the navbar sticky and add shadow on scroll\n\n---\n\n_**Assistant**_\n\nHere you go.\n\n---\n\n_**User**_\n\nshadow is too dark make it subtle\n\n---\n');
console.log('fixtures written to', H);
