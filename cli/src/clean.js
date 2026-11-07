// Turn raw records into clean, privacy-safe prompt objects.
import { toISO } from './util.js';

const NOISE = [/^<command-(name|message|args)>/, /^<local-command/, /^Caveat: The messages below/, /^This session is being continued/, /^<system-reminder>/, /^\s*<(environment_context|user_instructions)/];

const SECRET_PATTERNS = [
  [/\b(sk-(?:ant-|or-|proj-)?[A-Za-z0-9_\-]{16,})/g, '[REDACTED_KEY]'],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,})/g, '[REDACTED_TOKEN]'],
  [/\b(xox[abpr]-[A-Za-z0-9-]{10,})/g, '[REDACTED_TOKEN]'],
  [/\b(AKIA[0-9A-Z]{16})\b/g, '[REDACTED_AWS]'],
  [/\b(AIza[0-9A-Za-z_\-]{30,})/g, '[REDACTED_KEY]'],
  [/\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, '[REDACTED_JWT]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]'],
  [/((?:password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*)(["']?)[^\s"']{4,}\2/gi, '$1[REDACTED]'],
  [/\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s]+/gi, '$1://[REDACTED]'],
];
export function redact(s) { for (const [re, rep] of SECRET_PATTERNS) s = s.replace(re, rep); return s; }

const LOG_LINE = /^\s*(at\s+\S+.*\(|at\s+\S+:\d+|File ".*", line \d+|Traceback|\w*(Error|Exception)\b[:\s]|\[\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}|(ERROR|WARN|INFO|DEBUG)\b|npm (ERR|error)|\s*\^+\s*$|\s+\d+\s*\|)/;
const CODE_LINE = /[{};=<>]\s*$|^\s*(import|export|const|let|var|function|def|class|return|if|for|while|public|private|#include|SELECT|INSERT|UPDATE|<\/?\w+[^>]*>)\b/;

/** Separate the human's prose from pasted code / logs. */
export function split(text) {
  let codeLines = 0, logLines = 0;
  let t = text.replace(/```[\s\S]*?(```|$)/g, m => { const n = m.split('\n').length - 2; codeLines += Math.max(1, n); return `\n[pasted code: ${Math.max(1, n)} lines]\n`; });
  const lines = t.split(/\r?\n/);
  const keep = [];
  let run = [], runKind = null;
  const flushRun = () => {
    if (!run.length) return;
    if (run.length >= 3) { keep.push(`[pasted ${runKind}: ${run.length} lines]`); if (runKind === 'log') logLines += run.length; else codeLines += run.length; }
    else keep.push(...run.map(r => r.l));
    run = []; runKind = null;
  };
  for (const l of lines) {
    const kind = LOG_LINE.test(l) ? 'log' : (CODE_LINE.test(l) && !/[.?!]$/.test(l.trim()) && l.split(' ').length < 14) ? 'code' : null;
    if (kind) { if (runKind && runKind !== kind && run.length < 3) runKind = kind; runKind = runKind || kind; run.push({ l }); }
    else { flushRun(); keep.push(l); }
  }
  flushRun();
  t = keep.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const prose = t.replace(/\[pasted (code|log): \d+ lines\]/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/(?:~|\.{1,2})?\/[\w./-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { text: t, prose, codeLines, logLines };
}

export function clean(records, { since } = {}) {
  const out = [];
  const seen = new Set();
  const sinceMs = since ? Date.now() - since * 86400000 : 0;
  let interrupts = 0;
  for (const r of records) {
    if (r.kind === 'interrupt') { interrupts++; continue; }
    let raw = String(r.text || '').replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').replace(/\[Image #?\d*\]|\[image\]/gi, '[image]').trim();
    if (!raw || NOISE.some(re => re.test(raw))) continue;
    const ts = toISO(r.ts);
    if (sinceMs && ts && Date.parse(ts) < sinceMs) continue;
    const key = (r.session || '') + '|' + raw.slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    raw = redact(raw);
    const s = split(raw);
    if (!s.prose && !s.codeLines && !s.logLines) continue;
    let text = s.text;
    if (text.length > 2500) text = text.slice(0, 2000) + ` …[+${text.length - 2000} chars]`;
    out.push({
      id: out.length, tool: r.tool, project: r.project || null, session: String(r.session || ''), ts,
      text, prose: s.prose.slice(0, 2000), words: (s.prose.match(/[A-Za-z0-9']+/g) || []).length,
      codeLines: s.codeLines, logLines: s.logLines, images: (raw.match(/\[image\]/g) || []).length,
      context: r.context ? redact(split(String(r.context)).prose).slice(-300) : '',
    });
  }
  out.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
  out.forEach((p, i) => p.id = i);
  return { prompts: out, interrupts };
}
