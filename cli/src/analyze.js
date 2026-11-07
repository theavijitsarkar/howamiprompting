// Deep analysis with the developer's own AI agent. Map (chunks) → reduce (synthesis).
import { askJSON } from './agents.js';
import { PERSONAS } from './stats.js';

export const DIMENSIONS = {
  clarity: 'Clarity — is the ask unambiguous? One clear goal, plain words, no guessing needed.',
  context: 'Context — does the AI get what it needs: relevant files, current vs expected behaviour, why, error output with explanation.',
  specificity: 'Specificity — constraints, acceptance criteria, examples, scope limits ("only touch X", "keep the API the same").',
  structure: 'Structure — one task at a time or clearly numbered steps; important info first; not a wall of text.',
  efficiency: 'Efficiency — gets results without long correction loops, repeated asks, frustration or "still not working" spirals.',
  english: 'English — grammar, tense, sentence boundaries, punctuation, spelling. Judge the prose only, never code.',
};
const WEIGHTS = { clarity: 0.2, context: 0.22, specificity: 0.18, structure: 0.12, efficiency: 0.13, english: 0.15 };
export const overallFrom = s => Math.round(Object.entries(WEIGHTS).reduce((a, [k, w]) => a + w * (Number(s[k]) || 0), 0));

const COACH = `You are the world's best coach for developers who prompt AI coding agents (Claude Code, Codex, Cursor, Copilot, Gemini CLI). You are also an expert English writing coach for non-native speakers. You are specific, honest, funny when it fits, never generic. Every claim must point at the developer's real prompts. You only judge HOW they prompt and their written English — never their code.`;

/** Pick a representative sample: spread across tools and time, skip trivial one-word acks (we already count those). */
export function sample(prompts, max = 180) {
  const useful = prompts.filter(p => p.words >= 3 || p.logLines || p.codeLines);
  if (useful.length <= max) return useful;
  const byTool = new Map();
  for (const p of useful) { if (!byTool.has(p.tool)) byTool.set(p.tool, []); byTool.get(p.tool).push(p); }
  const out = [];
  const tools = [...byTool.values()];
  const base = Math.floor(max / tools.length);
  let spare = max - base * tools.length;
  // proportional with a floor so small tools are represented
  const total = useful.length;
  const quota = tools.map(arr => Math.max(Math.min(arr.length, 8), Math.round(max * arr.length / total)));
  let sum = quota.reduce((a, b) => a + b, 0);
  while (sum > max) { const i = quota.indexOf(Math.max(...quota)); quota[i]--; sum--; }
  tools.forEach((arr, ti) => {
    const k = Math.min(arr.length, quota[ti] + (spare-- > 0 ? 0 : 0));
    // 60% recent half, 40% older half, evenly spaced within each
    const recent = arr.slice(Math.floor(arr.length / 2)), older = arr.slice(0, Math.floor(arr.length / 2));
    const kr = Math.min(recent.length, Math.ceil(k * 0.6)), ko = Math.min(older.length, k - kr);
    for (const [src, kk] of [[older, ko], [recent, kr]]) for (let i = 0; i < kk; i++) out.push(src[Math.floor(i * src.length / kk)]);
  });
  return out.sort((a, b) => a.id - b.id);
}

function fmt(p) {
  const ctx = p.context ? `\n   ↳ (AI had just said: "${p.context.slice(-160).replace(/\s+/g, ' ')}")` : '';
  return `[${p.id}] (${p.tool}${p.project ? ', ' + p.project : ''}) ${p.text.slice(0, 700).replace(/\n{2,}/g, '\n')}${ctx}`;
}

function chunkPrompt(chunk) {
  return `${COACH}

TASK: analyze_prompt_batch
Below are ${chunk.length} prompts one developer typed to AI coding assistants. Each starts with [id] and the tool. Pasted code/logs were replaced by markers like [pasted log: 40 lines]. Secrets were redacted.

Score each dimension 0-100 for THIS batch (60 = average developer, 80 = strong, 90+ = exceptional):
${Object.entries(DIMENSIONS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

PROMPTS:
${chunk.map(fmt).join('\n')}

Return ONE JSON object, no prose:
{
 "scores": {"clarity":0,"context":0,"specificity":0,"structure":0,"efficiency":0,"english":0},
 "strengths": [{"point":"what they do well","id":123,"quote":"exact short quote"}],
 "issues": [{"issue":"short label","category":"clarity|context|specificity|structure|efficiency|english","severity":"high|medium|low","ids":[1,2],"quote":"exact short quote (max 25 words)","why":"why this costs them","rewrite":"how that prompt should have been written"}],
 "english_errors": [{"quote":"exact words","fix":"corrected","rule":"short rule"}],
 "worst_ids": [ids of the 3 most improvable MEANINGFUL prompts — not one-word acks],
 "best_ids": [ids of the 2 best prompts],
 "notes": "2 sentences on this developer's style"
}
Limits: strengths 2-4, issues 3-6, english_errors up to 8 (empty if their English is clean).`;
}

function synthPrompt(stats, batches, sampleById) {
  const avg = {};
  for (const k of Object.keys(DIMENSIONS)) {
    const v = batches.map(b => Number(b.scores?.[k])).filter(n => !isNaN(n));
    avg[k] = v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  }
  const worst = [...new Set(batches.flatMap(b => b.worst_ids || []))].map(id => sampleById.get(Number(id))).filter(Boolean).slice(0, 6);
  const best = [...new Set(batches.flatMap(b => b.best_ids || []))].map(id => sampleById.get(Number(id))).filter(Boolean).slice(0, 3);
  const s = stats;
  const facts = {
    prompts: s.totals.prompts, sessions: s.totals.sessions, tools: s.tools.map(t => `${t.name} (${t.count})`).join(', '),
    median_words: s.length.median, avg_words: s.length.avg,
    one_word_acks_pct: s.habits.confirmPct, vague_pct: s.habits.vaguePct, frustration_pct: s.habits.frustrationPct,
    pushback_pct: s.habits.pushbackPct, gives_context_pct: s.habits.contextPct, paste_error_without_explanation_pct: s.habits.pastePrayPct,
    multi_ask_pct: s.habits.multiAskPct, please_pct: s.habits.pleasePct, swears: s.habits.swears, interrupts: s.totals.interrupts,
    lowercase_start_pct: s.english.lowerStartPct, no_final_punctuation_pct: s.english.noEndPunctPct, run_on_pct: s.english.runOnPct,
    night_owl_pct: s.time.nightPct, weekend_pct: s.time.weekendPct,
    detected_english_patterns: s.english.patterns.slice(0, 6).map(p => `${p.label} ×${p.count}`).join(', '),
  };
  return `${COACH}

TASK: synthesize_report
You analysed a developer's prompts in ${batches.length} batches. Merge everything into ONE final report. Be concrete, quote their real words, keep it encouraging but honest.

BATCH SCORES (average): ${JSON.stringify(avg)}
BATCH FINDINGS:
${batches.map((b, i) => `--- batch ${i + 1}\nnotes: ${b.notes || ''}\nstrengths: ${JSON.stringify(b.strengths || [])}\nissues: ${JSON.stringify(b.issues || [])}\nenglish_errors: ${JSON.stringify(b.english_errors || [])}`).join('\n')}

MEASURED FACTS FROM ALL ${s.totals.prompts} PROMPTS: ${JSON.stringify(facts)}

INSTRUCTIONS THEY REPEAT ACROSS SESSIONS (candidates for a rules file): ${JSON.stringify(s.repeated.map(r => r.text + ` (${r.sessions} sessions)`))}

THEIR MOST IMPROVABLE PROMPTS:
${worst.map(fmt).join('\n')}

THEIR BEST PROMPTS:
${best.map(fmt).join('\n')}

Return ONE JSON object:
{
 "headline": "a punchy 5-10 word verdict, second person",
 "summary": "3-4 sentences, second person, specific",
 "scores": {"clarity":0,"context":0,"specificity":0,"structure":0,"efficiency":0,"english":0},
 "level": "Beginner|Developing|Proficient|Advanced|Expert",
 "strengths": [{"title":"...","detail":"1-2 sentences","example":"exact quote"}],
 "weaknesses": [{"title":"...","category":"clarity|context|specificity|structure|efficiency|english","detail":"why it hurts their results","example":"exact quote","better":"the same prompt rewritten well","impact":"high|medium|low"}],
 "makeovers": [{"id":123,"original":"their prompt verbatim (may shorten)","rewritten":"an excellent version of the same request","why":["3 short reasons"]}],
 "english": {"score":0,"cefr":"A2|B1|B2|C1|C2","summary":"2 sentences","errors":[{"quote":"exact words","fix":"corrected","rule":"short rule","frequency":"often|sometimes|once"}],"tips":["3 specific tips"]},
 "habits": [{"start":"a habit to start","stop":"the habit it replaces"}],
 "rules_file": ["5-10 one-line rules they keep repeating or should set once in CLAUDE.md / AGENTS.md / .cursorrules"],
 "template": "a personal fill-in-the-blanks prompt template tailored to their weaknesses (use \\n for new lines)",
 "plan": ["7 short daily drills, one per day"],
 "fun_facts": ["3 witty, true observations from the facts"],
 "persona": {"name":"The …","emoji":"one emoji","blurb":"1-2 sentences, second person, why this fits them"},
 "persona_note": "one witty line about them as that persona"
}
Persona: pick the best fit from these archetypes (or invent a better one in the same style): ${PERSONAS.map(p => `${p.emoji} ${p.name} — ${p.blurb}`).join(' | ')}\nCounts: strengths 3, weaknesses 4-5, makeovers 3 (only from the 'most improvable' list), english.errors up to 8, habits 4-5.`;
}

/**
 * Run the full analysis. onStep(label, i, total) for progress.
 */
const avgOf = (bs, k) => { const v = bs.map(b => Number(b.scores?.[k])).filter(n => !isNaN(n)); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0; };

export async function analyze(prompts, stats, { agent, model, sampleSize = 180, batchSize = 60, concurrency = 2, onStep = () => {} } = {}) {
  const smp = sample(prompts, sampleSize);
  const byId = new Map(smp.map(p => [p.id, p]));
  const chunks = [];
  for (let i = 0; i < smp.length; i += batchSize) chunks.push(smp.slice(i, i + batchSize));
  if (!chunks.length) throw new Error('No prompts to analyse');
  const total = chunks.length + 1;
  let done = 0;
  const batches = new Array(chunks.length);
  const errors = [];
  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const i = next++;
      try {
        batches[i] = await askJSON(agent, chunkPrompt(chunks[i]), { model, validate: j => { if (!j.scores) throw new Error('missing scores'); } });
      } catch (e) { errors.push(e.message); batches[i] = null; }
      onStep(`Read batch ${++done} of ${chunks.length}`, done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  const ok = batches.filter(Boolean);
  if (!ok.length) throw new Error('Every batch failed: ' + errors[0]);

  onStep('Writing your report', done, total);
  const report = await askJSON(agent, synthPrompt(stats, ok, byId), {
    model, validate: j => { if (!j.scores || !j.headline || !j.persona?.name) throw new Error('incomplete report'); },
  });
  for (const k of Object.keys(DIMENSIONS)) report.scores[k] = Math.max(0, Math.min(100, Math.round(Number(report.scores[k]) || avgOf(ok, k))));
  report.scores.overall = overallFrom(report.scores);
  report.sampled = smp.length;
  report.batchErrors = errors.length;
  onStep('Done', total, total);
  return report;
}
