// Practice mode: 4 timed mini-games generated from YOUR weaknesses and graded by your own agent.
import { askJSON, explainError } from './agents.js';

const COACH = 'You are a sharp, kind English-and-prompting coach for software developers (many are non-native English speakers). You design short, fresh exercises and grade honestly. Never reuse textbook examples.';

export async function generateTest({ agent, model, report, stats, worstPrompt }) {
  const weak = (report?.weaknesses || []).map(w => `- ${w.title}: "${w.example || ''}"`).join('\n');
  const eng = (report?.english?.errors || []).slice(0, 6).map(e => `- "${e.quote}" → "${e.fix}" (${e.rule})`).join('\n')
    || (stats?.english?.patterns || []).slice(0, 5).map(p => `- ${p.label}: "${p.example || ''}"`).join('\n');
  const projects = (stats?.projects || []).slice(0, 4).map(p => p.name).join(', ');
  if (!agent) throw new Error('Practice needs your AI agent — run npx howamiprompting again to connect one.');
  {
    try {
      const t = await askJSON(agent, `${COACH}

TASK: generate_practice
Seed: ${Math.random().toString(36).slice(2, 8)}
Their projects: ${projects || 'web apps'}
Their prompting weaknesses:
${weak || '- (unknown)'}
Their English mistakes:
${eng || '- (none detected)'}
${worstPrompt ? `One of their real messy prompts (for level 4): "${worstPrompt}"` : ''}

Return ONE JSON object:
{
 "passage": {"text":"Level 1: a 4-5 sentence bug/incident report (65-95 words) from a world like theirs, with a clear cause → effect → consequence chain and one concrete number. Shown 45s then hidden.","questions":["what happened?","why?"],"model_answer":"ideal 2-3 sentences","key_facts":["3-4 facts"],"targets":"which weakness"},
 "fixit": [{"broken":"NEW 12-24 word sentence in broken developer English that reproduces THEIR error patterns","reference":"clean rewrite","focus":"2-4 word hint","targets":"which weakness"}, x3],
 "diagram": {"title":"a rule/flow from their world","audience":"who to explain it to","boxes":[{"icon":"emoji","label":"max 6 words"}, x3],"model_answer":"one paragraph, exactly 3 sentences, with linking words","targets":"short"},
 "rewrite": {"original":"${worstPrompt ? 'their real prompt verbatim' : 'an invented messy prompt in their style'}","context":"what that prompt was trying to achieve","model_answer":"an excellent prompt: goal, context, constraints, acceptance criteria","targets":"short"}
}`, { model, validate: j => { if (!j.passage?.text || (j.fixit || []).length < 3 || (j.diagram?.boxes || []).length < 3) throw new Error('bad test'); } });
      t.fixit = t.fixit.slice(0, 3); t.diagram.boxes = t.diagram.boxes.slice(0, 3);
      if (worstPrompt) t.rewrite.original = worstPrompt;
      t.source = agent;
      return t;
    } catch (e) { throw new Error(explainError(agent, e.message)); }
  }
}

export function publicTest(t) {
  return {
    source: t.source,
    passage: { text: t.passage.text, questions: t.passage.questions, targets: t.passage.targets || '' },
    fixit: t.fixit.map(f => ({ broken: f.broken, focus: f.focus || '', targets: f.targets || '' })),
    diagram: { title: t.diagram.title, audience: t.diagram.audience || 'an end user', boxes: t.diagram.boxes, targets: t.diagram.targets || '' },
    rewrite: { original: t.rewrite.original, context: t.rewrite.context || '', targets: t.rewrite.targets || '' },
  };
}

export async function gradeTest({ agent, model, test, answers }) {
  if (!agent) throw new Error('Grading needs your AI agent.');
  {
    try {
      const r = await askJSON(agent, `${COACH}

TASK: grade_practice
Grade this timed written-English test (no paste, no spell-check). Empty answer = 0. Copying the passage verbatim loses comprehension marks. A "fix" that keeps the original errors scores low. Quote their exact words. 60 = B1, 75 = B2, 88+ = C1.

${JSON.stringify({
  level1: { passage: test.passage.text, questions: test.passage.questions, key_facts: test.passage.key_facts, model: test.passage.model_answer, answer: answers.passage },
  level2: test.fixit.map((f, i) => ({ broken: f.broken, model: f.reference, answer: answers.fixit?.[i] || '' })),
  level3: { flow: test.diagram.boxes.map(b => b.label), audience: test.diagram.audience, rule: 'one paragraph, exactly 3 sentences', model: test.diagram.model_answer, answer: answers.diagram },
  level4: { original_prompt: test.rewrite.original, model: test.rewrite.model_answer, answer: answers.rewrite },
}, null, 1)}

Return ONE JSON object:
{"criteria":{"sentence_boundaries":{"score":0,"comment":""},"grammar_tense":{"score":0,"comment":""},"comprehension":{"score":0,"comment":""},"clarity":{"score":0,"comment":""}},
 "levels":{"passage":{"score":0,"feedback":"","mistakes":[{"wrote":"","fix":"","why":""}]},"fixit":{"score":0,"feedback":"","items":[{"score":0,"note":""},{"score":0,"note":""},{"score":0,"note":""}]},"diagram":{"score":0,"feedback":"","mistakes":[]},"rewrite":{"score":0,"feedback":"","mistakes":[]}},
 "cefr":"A2|B1|B2|C1|C2","verdict":"2 sentences","top_fixes":["3 specific habits"]}`, { model, validate: j => { if (!j.criteria?.grammar_tense) throw new Error('bad grade'); } });
      return finalize(r, test, answers, agent);
    } catch (e) { throw new Error(explainError(agent, e.message)); }
  }
}

function finalize(r, test, answers, source) {
  const c = r.criteria;
  const n = k => Math.max(0, Math.min(100, Math.round(Number(c[k]?.score) || 0)));
  const overall = Math.round(0.3 * n('sentence_boundaries') + 0.3 * n('grammar_tense') + 0.25 * n('comprehension') + 0.15 * n('clarity'));
  return {
    source, overall, cefr: r.cefr || (overall >= 88 ? 'C1' : overall >= 75 ? 'B2' : overall >= 60 ? 'B1' : 'A2'),
    criteria: Object.fromEntries(['sentence_boundaries', 'grammar_tense', 'comprehension', 'clarity'].map(k => [k, { score: n(k), comment: c[k]?.comment || '' }])),
    levels: r.levels || {}, verdict: r.verdict || '', top_fixes: r.top_fixes || [],
    models: { passage: test.passage.model_answer, fixit: test.fixit.map(f => f.reference), diagram: test.diagram.model_answer, rewrite: test.rewrite.model_answer },
    test: publicTest(test), answers,
  };
}
