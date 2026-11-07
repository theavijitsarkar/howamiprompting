// Local, deterministic metrics — the "Wrapped" layer. No AI needed.
const STOP = new Set('a an the to of and or in on for with is are be it this that i you me my we our can could would will just please also so then now do does did not no yes ok okay if as at by from but all any some there here what how why when which should make need want like get use using code file files one more see into out up them they its it\'s im i\'m dont don\'t lets let\'s'.split(' '));

const RX = {
  confirm: /^(y|ya|yes|yeah|yep|yup|ok|okay|k|sure|continue|go|go ahead|proceed|do it|next|yes please|ok do it|looks good|lgtm|perfect|great|nice|cool|thanks|thank you|ty|done|good|correct|right|approved?)[.! ]*$/i,
  please: /\b(please|pls|plz|kindly)\b/i,
  thanks: /\b(thanks|thank you|thx|ty|cheers|appreciate)\b/i,
  sorry: /\b(sorry|my bad|apologies)\b/i,
  swear: /\b(wtf|wth|ffs|fuck\w*|shit\w*|damn\w*|crap|bullshit|stupid|idiot|dumb|bloody|hell)\b/i,
  frustr: /(\bstill (not|doesn'?t|isn'?t|broken|failing|the same)\b|\bagain\b.*\b(error|broken|fail|wrong)|\bwhy (is|are|does|did|isn'?t|doesn'?t|would|the hell)\b|\b(doesn'?t|does not|didn'?t|not) work(ing)?\b|\bsame (error|issue|problem|bug)\b|!!+|\?\?+|\bseriously\b|\bcome on\b|\bfor the \w+ time\b|\bi (told|said) you\b|\bwhat the\b)/i,
  pushback: /^(no|nope|nah|wrong|stop|wait|undo|revert|don'?t|that'?s (not|wrong)|not what|you (broke|deleted|removed|changed)|why did you)\b/i,
  context: /\b(because|so that|in order to|expected|expect|instead of|currently|right now|the goal|i want|should|must|constraint|requirement|acceptance|without (changing|breaking|touching)|don'?t (change|touch|modify|break)|keep (the|it|existing)|only (change|modify|touch)|for example|e\.g\.|such as|make sure|edge case)\b/i,
  vagueVerb: /\b(fix( it| this| that)?|broken|doesn'?t work|not working|make it (better|nicer|work|good|look good)|improve (it|this)|clean (it|this) up|do (it|the rest|the same)|same (thing|for)|it'?s wrong|error)\b/i,
  question: /\?\s*$|^(how|what|why|where|when|which|who|can|could|is|are|does|do|should|would|will)\b/i,
  multi: /(\balso\b|\band then\b|\bplus\b|^\s*\d+[.)]\s|\n\s*[-*•]\s)/im,
  canYou: /\b(can|could|would) you\b/i,
  emoji: /\p{Extended_Pictographic}/gu,
};

export const ENGLISH_PATTERNS = [
  ['why because', /\bwhy because\b/i, 'Use just "because".'],
  ['can able to', /\bcan(not)? able to\b/i, 'Say "can" or "be able to", never both.'],
  ['didn\'t + past tense', /\b(didn'?t|did not|doesn'?t|does not)\s+(?!need\b|feed\b|proceed\b|exceed\b|succeed\b|embed\b|seed\b|speed\b)(\w+ed|went|came|got|gave|did|made|wrote|took|saw|ran)\b/i, 'After did/does use the base verb: "didn\'t work".'],
  ['have did / has went', /\b(has|have|had)\s+(went|came|gave|did|wrote|ran|took|saw|ate|broke)\b/i, 'Use the past participle: "have done", "has gone".'],
  ['missing is/are', /\b(it|this|that|page|api|response|data|button|app|server|screen|value|error|output|code)\s+(not\s+)?(coming|showing|getting|giving|throwing|happening|loading|working|crashing|failing|returning)\b/i, 'Add the helping verb: "the page is showing".'],
  ['subject–verb agreement', /(?<!\b(?:make|makes|made|making|let|lets|help|helps|see|saw|watch|have|has|had|does|did|do|can|could|will|would|should|must|might|may|to)\s)\b(it|he|she|this|that|user|the user|page|the page|api|button|server|app|code|function|screen)\s+(get|show|work|give|come|take|go|return|throw|crash|load|send|break|fail|run|need|look|seem|have|do)\b(?!['-])/i, 'Singular subjects take -s: "it gets", "the page shows".'],
  ['a + vowel sound', /\ba\s+(error|api|issue|update|option|object|array|event|input|output|image|endpoint|example|empty|existing|extra|easy|important|hour|ui|id|url|svg|html|sql|ec2)\b/i, 'Use "an" before vowel sounds: "an error", "an API".'],
  ['double comparative', /\b(more better|more faster|more easier|more simpler|most best|more cleaner)\b/i, '"better", not "more better".'],
  ['since / for', /\b(since|from)\s+(\d+|two|three|four|five)\s+(mins?|minutes|hours?|days?|weeks?)\b/i, '"for" + duration, "since" + starting point.'],
  ['redundant words', /\b(discuss about|revert back|return back|repeat again|reply back)\b/i, 'Drop the extra word.'],
  ['texting shortcuts', /\b(u|ur|pls|plz|thx|bcoz|coz|bcz|wat|wht|r u)\b/i, 'Write words in full — the model does better with clear text.'],
];

const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (n, d) => d ? Math.round(1000 * n / d) / 10 : 0;
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function computeStats(prompts, { interrupts = 0 } = {}) {
  const n = prompts.length;
  const tools = {}, projects = {}, sessions = new Map();
  const hours = Array(24).fill(0), weekdays = Array(7).fill(0), heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  const days = new Set();
  const words = [];
  const c = { confirm: 0, please: 0, thanks: 0, sorry: 0, swear: 0, frustr: 0, pushback: 0, context: 0, vague: 0, question: 0, multi: 0, canYou: 0, emoji: 0, pastePray: 0, pastedCode: 0, pastedLog: 0, images: 0, lowerStart: 0, noEnd: 0, lowerI: 0, runOn: 0, shouty: 0 };
  const english = Object.fromEntries(ENGLISH_PATTERNS.map(([k]) => [k, { count: 0, example: null }]));
  const examples = { swear: [], frustr: [], vague: [], confirm: {}, longest: null, pastePray: [] };
  const ngrams = new Map(), openers = new Map();
  const sentenceSessions = new Map();
  let night = 0, weekend = 0, timed = 0;

  for (const p of prompts) {
    const prose = p.prose || '';
    const w = p.words;
    words.push(w);
    tools[p.tool] = (tools[p.tool] || 0) + 1;
    if (p.project) projects[p.project] = (projects[p.project] || 0) + 1;
    const sk = p.tool + '|' + p.session;
    if (!sessions.has(sk)) sessions.set(sk, { n: 0, frustr: 0, tool: p.tool, project: p.project, first: p.ts });
    sessions.get(sk).n++;

    if (p.ts) {
      const d = new Date(p.ts);
      timed++;
      hours[d.getHours()]++; weekdays[d.getDay()]++; heat[d.getDay()][d.getHours()]++;
      days.add(dayKey(d));
      if (d.getHours() < 5) night++;
      if (d.getDay() === 0 || d.getDay() === 6) weekend++;
    }
    const t = prose.trim();
    if (RX.confirm.test(t)) { c.confirm++; const k = t.toLowerCase().replace(/[.! ]+$/, ''); examples.confirm[k] = (examples.confirm[k] || 0) + 1; }
    if (RX.please.test(t)) c.please++;
    if (RX.thanks.test(t)) c.thanks++;
    if (RX.sorry.test(t)) c.sorry++;
    if (RX.swear.test(t)) { c.swear++; if (examples.swear.length < 5 && w < 40) examples.swear.push(t); }
    if (RX.frustr.test(t)) { c.frustr++; sessions.get(sk).frustr++; if (examples.frustr.length < 8 && w < 40) examples.frustr.push(t); }
    if (RX.pushback.test(t)) c.pushback++;
    if (RX.context.test(t) && w >= 8) c.context++;
    if (w <= 7 && RX.vagueVerb.test(t) && !p.codeLines && !p.logLines) { c.vague++; if (examples.vague.length < 8) examples.vague.push(t); }
    if (RX.question.test(t)) c.question++;
    if (RX.multi.test(p.text) && w > 15) c.multi++;
    if (RX.canYou.test(t)) c.canYou++;
    c.emoji += (t.match(RX.emoji) || []).length;
    if (p.logLines && w < 8) { c.pastePray++; if (examples.pastePray.length < 5) examples.pastePray.push(t || '(just a pasted error)'); }
    if (p.codeLines) c.pastedCode++;
    if (p.logLines) c.pastedLog++;
    c.images += p.images || 0;
    if (w >= 3) {
      if (/^[a-z]/.test(t)) c.lowerStart++;
      if (!/[.!?)"'`:]$/.test(t)) c.noEnd++;
      if (/(^|\s)i(\s|'m|'ll|'ve|'d)/.test(t)) c.lowerI++;
      if (t.split(/[.!?;]\s/).some(s => s.split(/\s+/).length > 45)) c.runOn++;
      const caps = t.match(/\b[A-Z]{3,}\b/g) || [];
      if (caps.length >= 3 && caps.length / Math.max(1, w) > 0.3) c.shouty++;
      for (const [k, re] of ENGLISH_PATTERNS) if (re.test(t)) { english[k].count++; if (!english[k].example && w < 60) english[k].example = t.slice(0, 160); }
    }
    if (!examples.longest || w > examples.longest.words) examples.longest = { words: w, text: t.slice(0, 280), tool: p.tool, ts: p.ts };

    // phrases
    const toks = t.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
    if (toks.length) { const op = toks.slice(0, 2).join(' '); openers.set(op, (openers.get(op) || 0) + 1); }
    for (let i = 0; i + 1 < toks.length; i++) {
      for (const len of [2, 3]) {
        const g = toks.slice(i, i + len);
        if (g.length < len || STOP.has(g[0]) || STOP.has(g[len - 1])) continue;
        const k = g.join(' ');
        ngrams.set(k, (ngrams.get(k) || 0) + 1);
      }
    }
    // repeated instructions (candidates for CLAUDE.md / AGENTS.md / .cursorrules)
    for (const s of t.split(/(?<=[.!?\n])\s+/)) {
      const norm = s.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
      const wc = norm.split(' ').length;
      if (wc < 4 || wc > 22) continue;
      if (!/\b(always|never|don'?t|do not|use|make sure|avoid|prefer|keep|only|must|should)\b/.test(norm) || RX.pushback.test(norm)) continue;
      if (!sentenceSessions.has(norm)) sentenceSessions.set(norm, { text: s.trim(), sessions: new Set() });
      sentenceSessions.get(norm).sessions.add(sk);
    }
  }

  // streak
  const sortedDays = [...days].sort();
  let streak = 0, cur = 0, prev = null;
  for (const d of sortedDays) {
    const t = Date.parse(d);
    cur = prev && t - prev <= 86400000 * 1.5 ? cur + 1 : 1;
    streak = Math.max(streak, cur); prev = t;
  }
  const sess = [...sessions.values()];
  const topN = (m, k = 12, min = 2) => [...m.entries()].filter(([, v]) => v >= min).sort((a, b) => b[1] - a[1]).slice(0, k).map(([text, count]) => ({ text, count }));
  const ratio = k => pct(c[k], n);

  const stats = {
    totals: {
      prompts: n, sessions: sessions.size, projects: Object.keys(projects).length, tools: Object.keys(tools).length,
      words: words.reduce((a, b) => a + b, 0), interrupts,
      first: prompts.find(p => p.ts)?.ts || null, last: [...prompts].reverse().find(p => p.ts)?.ts || null,
      activeDays: days.size, longestStreak: streak, avgPerDay: days.size ? Math.round(10 * timed / days.size) / 10 : 0,
    },
    tools: Object.entries(tools).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count, avgWords: Math.round(prompts.filter(p => p.tool === name).reduce((a, p) => a + p.words, 0) / count) })),
    projects: Object.entries(projects).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
    time: { hours, weekdays, heat, nightPct: pct(night, timed), weekendPct: pct(weekend, timed), busiestHour: hours.indexOf(Math.max(...hours)), busiestDay: weekdays.indexOf(Math.max(...weekdays)) },
    length: { avg: n ? Math.round(10 * words.reduce((a, b) => a + b, 0) / n) / 10 : 0, median: median(words), buckets: [[1, 3], [4, 10], [11, 30], [31, 80], [81, 1e9]].map(([a, b]) => words.filter(x => x >= a && x <= b).length), longest: examples.longest },
    habits: {
      confirmPct: ratio('confirm'), pleasePct: ratio('please'), thanksPct: ratio('thanks'), sorry: c.sorry,
      swears: c.swear, swearPct: ratio('swear'), frustrationPct: ratio('frustr'), pushbackPct: ratio('pushback'),
      contextPct: ratio('context'), vaguePct: ratio('vague'), questionPct: ratio('question'), multiAskPct: ratio('multi'),
      canYouPct: ratio('canYou'), emoji: c.emoji, pastePrayPct: ratio('pastePray'), pastedCodePct: ratio('pastedCode'), pastedLogPct: ratio('pastedLog'),
      images: c.images, shoutyPct: ratio('shouty'),
      topConfirms: Object.entries(examples.confirm).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([text, count]) => ({ text, count })),
    },
    english: {
      lowerStartPct: ratio('lowerStart'), noEndPunctPct: ratio('noEnd'), lowerIPct: ratio('lowerI'), runOnPct: ratio('runOn'),
      patterns: ENGLISH_PATTERNS.map(([k, , tip]) => ({ label: k, tip, ...english[k] })).filter(x => x.count).sort((a, b) => b.count - a.count),
    },
    phrases: dedupeGrams(topN(ngrams, 40, 3)).slice(0, 15),
    openers: topN(openers, 8, 3),
    repeated: [...sentenceSessions.values()].filter(x => x.sessions.size >= 3).sort((a, b) => b.sessions.size - a.sessions.size).slice(0, 12).map(x => ({ text: x.text, sessions: x.sessions.size })),
    sessions: { avgPrompts: sess.length ? Math.round(10 * n / sess.length) / 10 : 0, longest: Math.max(0, ...sess.map(s => s.n)), rageSessions: sess.filter(s => s.frustr >= 3).length },
    examples: { swear: examples.swear, frustration: examples.frustr, vague: examples.vague, pastePray: examples.pastePray },
  };
  stats.badges = badges(stats);
  stats.persona = null; // decided by the AI analysis
  return stats;
}

// drop n-grams contained in a longer, equally frequent n-gram ("dependency injection" vs "use dependency injection")
function dedupeGrams(list) {
  return list.filter(a => !list.some(b => b !== a && b.text.includes(a.text) && b.count >= a.count * 0.8) && !list.some(b => b !== a && a.text.includes(b.text) && b.count > a.count * 1.2));
}

export const PERSONAS = [
  { id: 'architect', name: 'The Architect', emoji: '📐', blurb: 'You brief your AI like a senior engineer: goals, constraints, context. It shows.', },
  { id: 'novelist', name: 'The Novelist', emoji: '📜', blurb: 'Your prompts are essays. Rich context — but the important ask sometimes gets buried.', },
  { id: 'sniper', name: 'The Sniper', emoji: '🎯', blurb: 'Short, precise, effective. You say exactly what you need and move on.', },
  { id: 'yes', name: 'The Yes-Machine', emoji: '👍', blurb: '"ok", "continue", "yes". You let the agent drive — sometimes straight into a wall.', },
  { id: 'paste', name: 'The Paste-and-Pray', emoji: '🙏', blurb: 'Error in, fix out. You paste the stack trace and hope. Add one line of context and watch it work.', },
  { id: 'rage', name: 'The Rage Prompter', emoji: '🌋', blurb: 'When the AI messes up, it hears about it. Your frustration is valid — but it costs you turns.', },
  { id: 'diplomat', name: 'The Polite Diplomat', emoji: '🎩', blurb: '"Please" and "thank you" — your AI has never felt so respected.', },
  { id: 'speedrunner', name: 'The Speedrunner', emoji: '⚡', blurb: 'Three-word prompts at 200 WPM. Fast — but the AI is guessing half the time.', },
  { id: 'micromanager', name: 'The Micromanager', emoji: '🔍', blurb: '"No, not like that." You course-correct a lot. Front-load the details to skip the back-and-forth.', },
];
export function badges(s) {
  const badges = [];
  if (s.time.nightPct > 20) badges.push({ emoji: '🦉', label: 'Night Owl', detail: `${s.time.nightPct}% of prompts after midnight` });
  if (s.time.weekendPct > 30) badges.push({ emoji: '🏖️', label: 'Weekend Warrior', detail: `${s.time.weekendPct}% on weekends` });
  if (s.totals.longestStreak >= 14) badges.push({ emoji: '🔥', label: 'On Fire', detail: `${s.totals.longestStreak}-day streak` });
  if (s.tools.length >= 3) badges.push({ emoji: '🧪', label: 'Tool Hopper', detail: `${s.tools.length} different AI tools` });
  if (s.habits.pleasePct > 20) badges.push({ emoji: '🎩', label: 'Polite', detail: `"please" in ${s.habits.pleasePct}% of prompts` });
  if (s.habits.swears > 10) badges.push({ emoji: '🤬', label: 'Potty Mouth', detail: `${s.habits.swears} swears` });
  if (s.totals.prompts > 2000) badges.push({ emoji: '🏋️', label: 'Power User', detail: `${s.totals.prompts.toLocaleString()} prompts` });
  return badges;
}
