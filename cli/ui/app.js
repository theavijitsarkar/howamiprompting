/* how am i prompting? — local report UI (no frameworks, no trackers, no network calls except your own localhost) */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => Number(n || 0).toLocaleString();
  const GH = 'https://github.com/theavijitsarkar/howamiprompting';
  const DIMS = { clarity: ['Clarity', '#ff5c8a', 'Is the ask unambiguous?'], context: ['Context', '#4b5cff', 'Does the AI get what it needs?'], specificity: ['Specificity', '#ffd84d', 'Constraints & acceptance criteria'], structure: ['Structure', '#9b6bff', 'One task at a time, key info first'], efficiency: ['Efficiency', '#2ee6a6', 'Results without correction loops'], english: ['English', '#ff9a3d', 'Grammar, tense, punctuation'] };
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const hourLabel = h => `${(h % 12) || 12}${h < 12 ? 'am' : 'pm'}`;
  const censor = s => String(s).replace(/\b(fuck|shit|damn|crap|bullshit|bloody)(\w*)/gi, (m, a, b) => a[0] + '*'.repeat(a.length - 1) + b);

  let token = (location.hash.match(/t=([a-f0-9]+)/) || [])[1];
  try { if (token) sessionStorage.setItem('hap_t', token); else token = sessionStorage.getItem('hap_t'); } catch (e) {}
  if (location.hash) history.replaceState(null, '', location.pathname);

  async function api(path, body) {
    const r = await fetch('/api/' + path, { method: body ? 'POST' : 'GET', headers: { 'x-hap-token': token || '', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({ error: 'Bad response' }));
    if (!r.ok || j.error) throw new Error(j.error || 'Request failed');
    return j;
  }
  let toastT;
  const toast = (m, ms = 2600) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); };
  let busyT;
  const busy = (on, msgs = ['Thinking…'], sub = '') => {
    $('#busy').classList.toggle('on', on); clearInterval(busyT); $('#busySub').textContent = sub;
    if (on) { let i = 0; $('#busyMsg').textContent = msgs[0]; busyT = setInterval(() => $('#busyMsg').textContent = msgs[++i % msgs.length], 2200); }
  };
  const countUp = (el, to, ms = 1400) => { const t0 = performance.now(); const f = n => { const p = Math.min(1, (n - t0) / ms); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString(); if (p < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); };
  const animateBars = root => setTimeout(() => $$('.fill[data-w]', root).forEach(f => f.style.width = f.dataset.w + '%'), 120);
  const copy = async (text, msg = 'Copied 📋') => { try { await navigator.clipboard.writeText(text); toast(msg); } catch (e) { prompt('Copy this:', text); } };

  function confetti() {
    const c = $('#confetti'), x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
    const cols = ['#ffd84d', '#ff5c8a', '#4b5cff', '#2ee6a6', '#ff9a3d', '#9b6bff'];
    const P = Array.from({ length: 170 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .5, w: 6 + Math.random() * 8, h: 8 + Math.random() * 10, vy: 2 + Math.random() * 4, vx: -2 + Math.random() * 4, r: Math.random() * 6, vr: -.2 + Math.random() * .4, c: cols[Math.random() * 6 | 0] }));
    let f = 0; (function d() { x.clearRect(0, 0, c.width, c.height); P.forEach(p => { p.x += p.vx; p.y += p.vy; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore(); }); if (++f < 240) requestAnimationFrame(d); else x.clearRect(0, 0, c.width, c.height); })();
  }

  /* ---------------- tabs ---------------- */
  function show(v) {
    $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
    $$('#tabs [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    window.scrollTo({ top: 0 });
    if (v === 'prompts' && !$('#plist').children.length) loadPrompts(true);
    if (v === 'share') { drawCard(); document.fonts?.ready.then(drawCard); }
    animateBars($('#v-' + v));
  }
  $$('#tabs [data-view]').forEach(b => b.onclick = () => show(b.dataset.view));

  let R; // the report bundle

  /* ================= WRAPPED STORY ================= */
  function storySlides() {
    const s = R.stats, t = s.totals, h = s.habits, ai = R.ai;
    const range = t.first ? `${new Date(t.first).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} → ${new Date(t.last).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : '';
    const topTool = s.tools[0];
    const max = Math.max(...s.tools.map(x => x.count));
    const sl = [];
    sl.push({ c: 's-yellow', html: `<div class="t1">You typed</div><div class="big" data-count="${t.prompts}">0</div><div class="t1">prompts to AI.</div><div class="t2">Across ${num(t.sessions)} sessions, ${num(t.projects)} projects and ${t.activeDays} active days${range ? ` (${range})` : ''}. That's ${num(t.words)} words — about ${Math.max(1, Math.round(t.words / 60000))} novel${t.words >= 120000 ? 's' : ''}.</div>` });
    sl.push({ c: 's-blue', html: `<div class="t1">Your AI crew</div><div class="tools-race">${s.tools.slice(0, 6).map((x, i) => `<div><span>${esc(x.name)}</span><i style="width:${Math.max(4, 100 * x.count / max)}%;animation-delay:${.2 + i * .15}s;background:${['#ffd84d', '#2ee6a6', '#ff5c8a', '#fff', '#ff9a3d', '#9b6bff'][i]}"></i><span>${num(x.count)}</span></div>`).join('')}</div><div class="t2">${esc(topTool.name)} is your ride-or-die${s.tools.length > 2 ? `, but you've cheated on it with ${s.tools.length - 1} others` : ''}.</div>` });
    if (s.time.hours.some(Boolean)) sl.push({ c: 's-ink', html: `<div class="t1">Prime time</div><div class="big" style="color:var(--yellow)">${hourLabel(s.time.busiestHour)}</div><div class="t1">${DAYS_FULL[s.time.busiestDay]}s are your day.</div><div class="t2">${s.time.nightPct > 15 ? `🦉 ${s.time.nightPct}% of your prompts were sent between midnight and 5am. Go to sleep.` : s.time.weekendPct > 25 ? `🏖️ ${s.time.weekendPct}% on weekends. Who hurt you?` : `Longest streak: ${t.longestStreak} days in a row.`}</div>` });
    sl.push({ c: 's-mint', html: `<div class="t1">Your typical prompt is</div><div class="big">${s.length.median}</div><div class="t1">words long.</div>${s.length.longest ? `<div class="t2">Your longest was ${num(s.length.longest.words)} words:</div><div class="q">“${esc(s.length.longest.text.slice(0, 200))}${s.length.longest.text.length > 200 ? '…' : ''}”</div>` : ''}` });
    const topAck = h.topConfirms.find(x => !/^(thanks|thank you|ty)$/.test(x.text));
    const said = [[topAck ? `"${topAck.text}"` : '"ok"', topAck?.count || 0], ['"please"', Math.round(h.pleasePct * t.prompts / 100)], ['"thanks"', Math.round(h.thanksPct * t.prompts / 100)]];
    sl.push({ c: 's-pink', html: `<div class="t1">Things you said a lot</div><div class="counters">${said.map(([w, n]) => `<div><b data-count="${n}">0</b>${esc(w)}</div>`).join('')}</div><div class="t2">${h.confirmPct > 15 ? `${h.confirmPct}% of your prompts were just a one-word nod. The agent is driving.` : h.pleasePct > 15 ? 'Your AI feels respected. When the robots take over, you will be spared.' : `"${esc((s.openers[0]?.text) || 'can you')}" is how you start most prompts.`}</div>` });
    if (h.frustrationPct > 3 || h.swears) sl.push({ c: 's-orange', html: `<div class="t1">Things got heated</div><div class="big">${h.frustrationPct}%</div><div class="t1">of your prompts were… frustrated.</div>${s.examples.frustration[0] ? `<div class="q">“${esc(censor(s.examples.frustration[0]))}”</div>` : ''}<div class="t2">${h.swears ? `${h.swears} swear${h.swears > 1 ? 's' : ''} detected. ` : ''}${s.sessions.rageSessions ? `${s.sessions.rageSessions} sessions turned into rage spirals.` : ''}</div>` });
    sl.push({ c: 's-purple', html: `<div class="t1">Your prompting personality</div><div class="big" style="font-size:clamp(90px,16vw,170px)">${s.persona.emoji}</div><div class="t1" style="font-size:clamp(36px,6vw,64px)">${esc(s.persona.name)}</div><div class="t2">${esc(ai?.persona_note || s.persona.blurb)}</div><div class="chips" style="justify-content:center;margin-top:18px">${s.persona.badges.map(b => `<span class="chip">${b.emoji} ${esc(b.label)}</span>`).join('')}</div>` });
    sl.push({ c: 's-yellow', score: true, html: `<div class="t1">Your prompting score</div><div class="big" data-count="${R.scores.overall}">0</div><div class="t1">${esc(ai?.headline || 'out of 100')}</div><div class="t2">${ai ? esc(ai.level || '') : 'Run with an AI agent for the full coaching report.'}</div><div style="margin-top:26px"><button class="btn pink" style="font-size:21px;padding:16px 30px" id="toReport">See my full report →</button></div>` });
    return sl;
  }
  function playStory() {
    const st = $('#story'), sl = storySlides();
    let i = 0, timer;
    st.innerHTML = `<div class="prog">${sl.map(() => '<i><b></b></i>').join('')}</div>${sl.map(s => `<div class="slide ${s.c}">${s.html}</div>`).join('')}<div class="tap l"></div><div class="tap r"></div><div class="ctrl"><button class="btn ghost small" id="skip">Skip to report ⏭</button></div>`;
    st.classList.add('on'); document.body.style.overflow = 'hidden';
    const close = () => { clearTimeout(timer); st.classList.remove('on'); document.body.style.overflow = ''; animateBars($('#v-report')); try { localStorage.setItem('hap_seen', R.generatedAt); } catch (e) {} };
    const go = n => {
      if (n >= sl.length) return close();
      i = Math.max(0, n);
      $$('.slide', st).forEach((s, k) => { s.classList.toggle('on', k === i); });
      $$('.prog i', st).forEach((p, k) => { p.className = k < i ? 'done' : k === i ? 'now' : ''; p.style.setProperty('--dur', (sl[k].score ? 9 : 5.5) + 's'); });
      const cur = $$('.slide', st)[i];
      $$('[data-count]', cur).forEach(el => countUp(el, +el.dataset.count, 1400));
      st.style.color = getComputedStyle(cur).color;
      if (sl[i].score) setTimeout(confetti, 900);
      clearTimeout(timer); timer = setTimeout(() => go(i + 1), sl[i].score ? 9000 : 5500);
    };
    $('.tap.l', st).onclick = () => go(i - 1);
    $('.tap.r', st).onclick = () => go(i + 1);
    $('#skip').onclick = close;
    $('#toReport', st).onclick = close;
    document.onkeydown = e => { if (!st.classList.contains('on')) return; if (e.key === 'ArrowRight' || e.key === ' ') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); if (e.key === 'Escape') close(); };
    go(0);
  }
  $('#replay').onclick = playStory;

  /* ================= REPORT ================= */
  const dial = (score, size = 250) => {
    const r = size * .41, C = 2 * Math.PI * r, col = score >= 75 ? '#2ee6a6' : score >= 55 ? '#ffd84d' : '#ff5c8a';
    return `<div class="dial" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="#fff" stroke="#16142b" stroke-width="3"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#16142b" stroke-width="24" stroke-dasharray="${C}" stroke-dashoffset="${C}" stroke-linecap="round" class="ring" data-off="${C * (1 - score / 100)}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="16" stroke-dasharray="${C}" stroke-dashoffset="${C}" stroke-linecap="round" class="ring" data-off="${C * (1 - score / 100)}"/></svg><div class="c"><div><div class="num" data-count="${score}">0</div><div class="of">out of 100</div></div></div></div>`;
  };
  const scoreBars = (sc, keys = Object.keys(DIMS)) => `<div class="bars">${keys.filter(k => sc[k] != null).map(k => `<div class="bar"><div class="lab"><span>${DIMS[k][0]} <small>${DIMS[k][2]}</small></span><span>${sc[k]}</span></div><div class="track"><div class="fill" data-w="${sc[k]}" style="background:${DIMS[k][1]}"></div></div></div>`).join('')}</div>`;
  const ba = (title, was, now, extra = '', why = '') => `<div class="ba"><div class="hd"><h4>${title}</h4><div class="row" style="gap:6px">${extra}</div></div><div class="body"><div class="was"><small class="l">You wrote</small>${esc(was)}</div><div class="arr">→</div><div class="now"><small class="l">Try this</small>${esc(now || '—')}</div></div>${why ? `<div class="why">${why}</div>` : ''}</div>`;
  const statTile = (v, k, bg = '') => `<div class="stat" ${bg ? `style="background:${bg}"` : ''}><div class="v">${v}</div><div class="k">${k}</div></div>`;

  function heatmap(heat) {
    const max = Math.max(1, ...heat.flat());
    return `<div class="heat"><span></span>${Array.from({ length: 24 }, (_, h) => `<span style="text-align:center">${h % 6 === 0 ? hourLabel(h) : ''}</span>`).join('')}${heat.map((row, d) => `<span>${DAYS[d]}</span>${row.map(v => `<i title="${DAYS[d]} ${v} prompts" style="background:${v ? `rgba(75,92,255,${.15 + .85 * v / max})` : ''}"></i>`).join('')}`).join('')}</div>`;
  }

  function renderReport() {
    const s = R.stats, ai = R.ai, sc = R.scores, h = s.habits, hist = (R.history || []).filter(x => x.overall != null);
    const prev = hist.length > 1 ? hist[hist.length - 2] : null;
    const delta = prev ? sc.overall - prev.overall : null;
    const rules = ai?.rules_file?.length ? ai.rules_file : s.repeated.map(r => r.text);
    const el = $('#v-report');
    el.innerHTML = `
      ${!ai ? `<div class="banner">🧠 This is the <b>local-only</b> report (heuristic scores). ${R.aiError ? `The AI analysis failed: <i>${esc(R.aiError.slice(0, 140))}</i>. ` : ''}For real coaching — prompt makeovers, English feedback and a personal plan — install <b>Claude Code</b>, <b>Codex</b> or <b>Gemini CLI</b> (or set an API key / run Ollama) and run <code>npx howamiprompting</code> again.</div>` : ''}
      <div class="card"><div class="hero">
        ${dial(sc.overall)}
        <div>
          <div class="row">${ai?.level ? `<span class="level">${esc(ai.level)}</span>` : ''}${delta != null ? `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲ +' : '▼ '}${delta} since last run</span>` : ''}<span class="pill">${num(s.totals.prompts)} prompts · ${s.tools.length} tools</span>${R.agent ? `<span class="pill">🧠 analysed by ${esc(R.agent.label)}</span>` : ''}</div>
          <div class="headline">${esc(ai?.headline || `You prompt like ${s.persona.name.replace(/^The /, 'a ')}.`)}</div>
          <p style="font-size:17px;margin:0">${esc(ai?.summary || s.persona.blurb)}</p>
        </div>
      </div></div>

      <div class="grid2" style="margin-top:24px">
        <div class="card"><h3>📐 Your six prompting skills</h3>${scoreBars(sc)}</div>
        <div>
          <div class="persona"><div class="e">${s.persona.emoji}</div><div><span class="tag" style="background:var(--yellow);color:var(--ink)">Your persona</span><h3 style="margin-top:8px">${esc(s.persona.name)}</h3><p>${esc(s.persona.blurb)}</p></div></div>
          <div class="chips" style="margin-top:16px">${s.persona.badges.map(b => `<span class="chip" title="${esc(b.detail)}">${b.emoji} ${esc(b.label)}</span>`).join('')}</div>
          ${ai?.fun_facts?.length ? `<div class="card" style="margin-top:18px;padding:20px"><h3>🤓 Fun facts</h3>${ai.fun_facts.map(f => `<p style="margin:8px 0;font-weight:600">• ${esc(f)}</p>`).join('')}</div>` : ''}
        </div>
      </div>

      ${ai ? `
      <div class="section-head"><span class="tag">Coaching</span><h2>What's working · what's not</h2></div>
      <div class="grid2">
        <div class="card"><h3>💚 Keep doing this</h3>${(ai.strengths || []).map(x => `<div class="good"><b>✓ ${esc(x.title)}</b>${esc(x.detail)}${x.example ? `<br><q>${esc(x.example)}</q>` : ''}</div>`).join('')}</div>
        <div class="card"><h3>🔁 Swap these habits</h3>${(ai.habits || []).map(x => `<div class="habit"><div class="x">${esc(x.stop)}</div><div class="s">${esc(x.start)}</div></div>`).join('')}</div>
      </div>
      <div class="card" style="margin-top:24px"><h3>🚩 What's costing you results</h3>
        ${(ai.weaknesses || []).map(w => ba(esc(w.title), w.example, w.better, `${w.category ? `<span class="pill">${esc(w.category)}</span>` : ''}${w.impact ? `<span class="sev ${esc(w.impact)}">${esc(w.impact)} impact</span>` : ''}`, esc(w.detail))).join('')}
      </div>

      <div class="section-head"><span class="tag">Makeovers</span><h2>Your real prompts, rewritten ✨</h2></div>
      ${(ai.makeovers || []).map((m, i) => `<div class="ba" style="box-shadow:var(--shadow-sm)"><div class="hd"><h4>Makeover #${i + 1}</h4><button class="btn small ghost copy" data-copy="${esc(m.rewritten)}">Copy rewrite</button></div><div class="body"><div class="was"><small class="l">Before</small>${esc(m.original)}</div><div class="arr">→</div><div class="now"><small class="l">After</small>${esc(m.rewritten)}</div></div><div class="why">${(m.why || []).map(w => `✓ ${esc(w)}`).join(' &nbsp; ')}</div></div>`).join('')}
      ` : `
      <div class="section-head"><span class="tag">Habits</span><h2>What your prompts say about you</h2></div>
      <div class="card"><h3>🚩 Prompts that made the AI guess</h3>${s.examples.vague.length ? s.examples.vague.map(v => `<div class="good" style="background:#fff1f4"><q>${esc(v)}</q></div>`).join('') : '<p class="muted">None — nice!</p>'}<p class="muted">Short "fix it" prompts without symptoms or expected behaviour are the #1 cause of wasted turns.</p></div>`}

      <div class="section-head"><span class="tag">Set it once</span><h2>Stop repeating yourself 📌</h2></div>
      <div class="card">
        <p style="margin-top:0">${rules.length ? `You keep telling your agents the same things. Put them in a rules file once and never type them again.` : `No repeated instructions found — but a rules file still helps. Here's a starter.`}</p>
        <div class="ftabs" id="ftabs"><button class="on" data-f="CLAUDE.md">CLAUDE.md</button><button data-f="AGENTS.md">AGENTS.md (Codex)</button><button data-f=".cursor/rules/me.mdc">.cursor/rules</button><button data-f="GEMINI.md">GEMINI.md</button><button data-f=".github/copilot-instructions.md">Copilot</button></div>
        <div class="code" id="rulesCode"></div>
        ${s.repeated.length ? `<p class="muted" style="margin-bottom:0">Detected repeats: ${s.repeated.slice(0, 5).map(r => `“${esc(r.text)}” <b>×${r.sessions} sessions</b>`).join(' · ')}</p>` : ''}
      </div>

      ${ai ? `<div class="grid2" style="margin-top:24px">
        <div class="card"><h3>🧩 Your personal prompt template</h3><div class="code"><button class="btn small ghost cbtn copy" data-copy="${esc(ai.template || '')}">Copy</button>${esc(ai.template || '')}</div></div>
        <div class="card"><h3>🗓️ Your 7-day plan</h3><ol class="plan">${(ai.plan || []).map(p => `<li>${esc(p.replace(/^Day \d+:\s*/i, ''))}</li>`).join('')}</ol></div>
      </div>` : ''}

      <div class="section-head"><span class="tag">Stats</span><h2>Your prompting, by the numbers</h2></div>
      <div class="grid4">
        ${statTile(num(s.totals.prompts), 'prompts', 'var(--yellow)')}${statTile(s.length.median, 'median words / prompt')}${statTile(h.confirmPct + '%', 'one-word replies ("ok", "yes")', 'var(--soft-pink)')}${statTile(h.contextPct + '%', 'prompts that give context')}
        ${statTile(h.frustrationPct + '%', 'frustrated prompts')}${statTile(h.pushbackPct + '%', 'corrections ("no", "revert")', 'var(--soft-blue)')}${statTile(h.pastePrayPct + '%', 'error pasted with no explanation')}${statTile(num(s.totals.interrupts), 'times you hit Esc on the agent', 'var(--soft-mint)')}
      </div>
      <div class="grid2" style="margin-top:22px">
        <div class="card"><h3>🕐 When you prompt</h3>${heatmap(s.time.heat)}<p class="muted" style="margin-bottom:0">Busiest: <b>${DAYS[s.time.busiestDay]}s at ${hourLabel(s.time.busiestHour)}</b> · ${s.time.nightPct}% after midnight · ${s.time.weekendPct}% on weekends · longest streak ${s.totals.longestStreak} days</p></div>
        <div class="card"><h3>📏 How long your prompts are</h3><div class="hbars">${s.length.buckets.map(b => `<i style="height:${Math.max(3, 100 * b / Math.max(...s.length.buckets))}%" title="${b}"></i>`).join('')}</div><div class="row between muted" style="font-weight:700;font-size:13px;margin-top:6px"><span>1–3</span><span>4–10</span><span>11–30</span><span>31–80</span><span>80+ words</span></div></div>
      </div>
      <div class="grid3" style="margin-top:22px">
        <div class="card"><h3>🛠️ Tools</h3><table class="t">${s.tools.map(t => `<tr><td><b>${esc(t.name)}</b></td><td>${num(t.count)}</td><td class="muted">${t.avgWords} w</td></tr>`).join('')}</table></div>
        <div class="card"><h3>💬 Your catchphrases</h3><div class="chips">${s.phrases.slice(0, 12).map(p => `<span class="chip">${esc(p.text)} <b>${p.count}</b></span>`).join('') || '<span class="muted">—</span>'}</div></div>
        <div class="card"><h3>📁 Top projects</h3><table class="t">${s.projects.slice(0, 8).map(p => `<tr><td><b>${esc(p.name)}</b></td><td>${num(p.count)}</td></tr>`).join('') || '<tr><td class="muted">—</td></tr>'}</table></div>
      </div>
      ${hist.length > 1 ? `<div class="card" style="margin-top:22px"><h3>📈 Your progress</h3><div class="hbars" style="height:140px">${hist.slice(-20).map(x => `<i style="height:${x.overall}%;background:${x.overall >= 75 ? '#2ee6a6' : x.overall >= 55 ? '#ffd84d' : '#ff5c8a'}" title="${new Date(x.date).toLocaleDateString()}: ${x.overall}"></i>`).join('')}</div><p class="muted" style="margin-bottom:0">${hist.length} runs · first ${hist[0].overall} → now ${sc.overall}</p></div>` : ''}

      <div class="card no-print" style="margin-top:34px;text-align:center;background:var(--ink);color:#fff">
        <h2 style="color:var(--yellow)">Found this useful?</h2>
        <p style="font-size:18px;margin:0 0 18px">Share your score card — and a ⭐ on GitHub helps other devs find this.</p>
        <div class="row" style="justify-content:center"><button class="btn pink" onclick="document.querySelector('[data-view=share]').click()">🚀 Make my share card</button><a class="btn" href="${GH}" target="_blank" rel="noopener">⭐ Star on GitHub</a></div>
      </div>`;

    // rules file tabs
    const rulesText = f => {
      const lines = rules.length ? rules : ['Use the existing code style and libraries; ask before adding dependencies.', 'Keep changes minimal and scoped to the request.', 'Explain your plan in 3 bullets before large edits.'];
      const head = f.endsWith('.mdc') ? '---\ndescription: My personal preferences\nalwaysApply: true\n---\n' : '';
      return `${head}# My preferences (generated by howamiprompting)\n\n${lines.map(l => '- ' + l.replace(/^[-•]\s*/, '')).join('\n')}\n`;
    };
    const paintRules = f => { $('#rulesCode').innerHTML = `<button class="btn small ghost cbtn copy" data-copy="${esc(rulesText(f))}">Copy</button><span class="c"># ${esc(f)}</span>\n${esc(rulesText(f))}`; };
    $$('#ftabs button').forEach(b => b.onclick = () => { $$('#ftabs button').forEach(x => x.classList.toggle('on', x === b)); paintRules(b.dataset.f); });
    paintRules('CLAUDE.md');

    $$('.ring', el).forEach(c => setTimeout(() => { c.style.transition = 'stroke-dashoffset 1.8s cubic-bezier(.2,1,.3,1)'; c.style.strokeDashoffset = c.dataset.off; }, 200));
    $$('.dial [data-count]', el).forEach(n => countUp(n, +n.dataset.count, 1800));
    animateBars(el);
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) copy(b.dataset.copy); });

  /* ================= ENGLISH ================= */
  function renderEnglish() {
    const s = R.stats, e = s.english, ai = R.ai?.english;
    const score = ai?.score ?? R.scores.english;
    const el = $('#v-english');
    el.innerHTML = `
      <div class="card"><div class="hero">
        ${dial(score, 220)}
        <div>
          <span class="tag">English & grammar</span>
          <div class="row" style="margin-top:12px">${ai?.cefr ? `<span class="level">${esc(ai.cefr)}</span>` : ''}<span class="pill">judged on your prose only — never your code</span></div>
          <div class="headline">${score >= 85 ? 'Your English is a strength.' : score >= 70 ? 'Clear English, a few habits to fix.' : score >= 55 ? 'Readable — but errors make the AI guess.' : 'Grammar is holding your prompts back.'}</div>
          <p style="font-size:17px;margin:0">${esc(ai?.summary || 'Small grammar slips turn into ambiguous instructions. Fixing them is the cheapest way to get better answers.')}</p>
        </div>
      </div></div>
      <div class="grid4" style="margin-top:24px">
        ${statTile(e.lowerStartPct + '%', 'start with a lowercase letter', e.lowerStartPct > 50 ? 'var(--soft-pink)' : '')}
        ${statTile(e.noEndPunctPct + '%', 'have no full stop at the end', e.noEndPunctPct > 60 ? 'var(--soft-pink)' : '')}
        ${statTile(e.lowerIPct + '%', 'use lowercase "i"', e.lowerIPct > 5 ? 'var(--soft-pink)' : '')}
        ${statTile(e.runOnPct + '%', 'contain a 45+ word run-on sentence', e.runOnPct > 5 ? 'var(--soft-pink)' : '')}
      </div>
      ${ai?.errors?.length ? `<div class="card" style="margin-top:24px"><h3>❌ → ✅ Your real mistakes</h3><table class="t err"><tr><th>You wrote</th><th>Correct</th><th>Rule</th><th>How often</th></tr>${ai.errors.map(x => `<tr><td>${esc(x.quote)}</td><td>${esc(x.fix)}</td><td>${esc(x.rule)}</td><td>${esc(x.frequency || '')}</td></tr>`).join('')}</table></div>` : ''}
      <div class="grid2" style="margin-top:24px">
        <div class="card"><h3>🔁 Patterns we counted</h3>${e.patterns.length ? `<table class="t">${e.patterns.map(p => `<tr><td><b>${esc(p.label)}</b><br><span class="quote">${esc(p.example || '')}</span><br><small class="muted">${esc(p.tip)}</small></td><td style="font-weight:800;font-size:20px">×${p.count}</td></tr>`).join('')}</table>` : '<p class="muted">No common error patterns found. 👏</p>'}</div>
        <div class="card"><h3>💡 Tips just for you</h3><ol class="fixes">${(ai?.tips || ['End every instruction with a full stop — it tells the model where one thought ends.', 'Capitalise "I" and sentence starts; sloppy text reads as low-priority.', 'One sentence = one instruction. Split anything with "and also".']).map(t => `<li>${esc(t)}</li>`).join('')}</ol>
        <div style="margin-top:18px"><button class="btn pink" onclick="document.querySelector('[data-view=practice]').click()">🎮 Practise my English (10 min)</button></div></div>
      </div>`;
    $$('.ring', el).forEach(c => setTimeout(() => { c.style.transition = 'stroke-dashoffset 1.8s'; c.style.strokeDashoffset = c.dataset.off; }, 200));
    $$('.dial [data-count]', el).forEach(n => countUp(n, +n.dataset.count, 1600));
  }

  /* ================= PRACTICE ================= */
  const P = { test: null, id: null, answers: { passage: '', fixit: ['', '', ''], diagram: '', rewrite: '' }, timer: null, paste: 0 };
  const T = { read: 45, passage: 120, fixit: 150, diagram: 120, rewrite: 90 };
  const sentences = t => (t.trim().replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+["')]?|[^.!?]+$/g) || []).filter(s => s.trim().length > 1);
  const words = t => (t.trim().match(/[A-Za-z0-9']+/g) || []).length;
  function guard(el) { ['spellcheck', 'autocomplete', 'autocorrect', 'autocapitalize'].forEach(a => el.setAttribute(a, 'off')); el.setAttribute('spellcheck', 'false'); el.setAttribute('data-gramm', 'false'); el.setAttribute('data-enable-grammarly', 'false'); ['paste', 'drop'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); P.paste++; toast('🚫 No pasting — type it yourself!'); })); }
  function timer(el, sec, done) {
    clearInterval(P.timer);
    const r = 30, C = 2 * Math.PI * r, end = Date.now() + sec * 1000;
    el.innerHTML = `<svg width="70" height="70"><circle cx="35" cy="35" r="${r}" fill="#fff" stroke="#16142b" stroke-width="3"/><circle cx="35" cy="35" r="${r}" fill="none" stroke="#2ee6a6" stroke-width="8" stroke-dasharray="${C}" stroke-linecap="round" style="transition:stroke-dashoffset 1s linear"/></svg><div class="tt"></div>`;
    const ring = $$('circle', el)[1], lab = $('.tt', el);
    const tick = () => { const left = Math.max(0, Math.round((end - Date.now()) / 1000)); lab.textContent = `${left / 60 | 0}:${String(left % 60).padStart(2, '0')}`; ring.style.strokeDashoffset = C * (1 - left / sec); ring.style.stroke = left <= 10 ? '#ff5c8a' : '#2ee6a6'; el.classList.toggle('warn', left <= 10); if (!left) { clearInterval(P.timer); done(); } };
    tick(); P.timer = setInterval(tick, 250);
  }
  function meters(ta, box, o) {
    const f = () => { const t = ta.value, sc = sentences(t).length, ok = /[.!?]["')]?\s*$/.test(t.trim()); box.innerHTML = `<span class="meter ${words(t) >= (o.min || 0) ? 'ok' : ''}">✍️ ${words(t)} words</span><span class="meter ${o.exact ? (sc === o.exact ? 'ok' : sc > o.exact ? 'bad' : '') : ''}">📏 ${sc}${o.exact ? ' / ' + o.exact : ''} sentences</span><span class="meter ${ok ? 'ok' : ''}">${ok ? '✅' : '◻️'} full stop</span>${o.noBullets && /^\s*([-*•]|\d+[.)])\s/m.test(t) ? '<span class="meter bad">❌ no bullets</span>' : ''}`; };
    ta.addEventListener('input', f); f();
  }
  const lvlHead = (n, icon, title, color) => `<div class="row between" style="margin-bottom:14px"><div class="row"><div style="width:56px;height:56px;border:var(--line);border-radius:15px;display:grid;place-items:center;font-size:28px;background:${color};box-shadow:var(--shadow-sm)">${icon}</div><div><span class="tag">Level ${n} / 4</span><h2 style="margin:6px 0 0">${title}</h2></div></div><div class="timer" id="ptimer"></div></div>`;
  const target = t => t ? `<div class="target">🎯 Targets: <b>${esc(t)}</b></div>` : '';

  function practiceHome() {
    $('#v-practice').innerHTML = `<div class="card" style="text-align:center;padding:40px 26px">
      <span class="tag">Side quest · 9 minutes</span>
      <h2 style="margin-top:14px">Practise your <span class="hl">written English</span></h2>
      <p class="muted" style="max-width:640px;margin:0 auto 22px;font-size:18px">Four timed mini-games${R.agent ? `, freshly written by ${esc(R.agent.label)} from <b>your</b> weak spots` : ' from the built-in question bank'}. No paste, no spell-check — just you.</p>
      <div class="grid4" style="text-align:left;margin-bottom:26px">
        ${[['👻', 'Vanishing Passage', 'Read for 45s. It disappears. Explain it.', 'var(--yellow)'], ['🔧', 'Fix-It Factory', 'Repair 3 broken sentences.', 'var(--soft-pink)'], ['🖼️', 'Picture → Paragraph', 'Turn a flow into 3 sentences.', 'var(--mint)'], ['✨', 'Prompt Glow-Up', 'Rewrite one of your real prompts.', 'var(--soft-blue)']].map(([e, t, d, c]) => `<div class="stat" style="background:${c}"><div style="font-size:30px">${e}</div><b style="display:block;margin:6px 0 4px;font-size:17px">${t}</b><span class="muted" style="font-weight:600;font-size:14px">${d}</span></div>`).join('')}
      </div>
      <button class="btn pink big" id="pstart">Start practice →</button></div>`;
    $('#pstart').onclick = startPractice;
  }
  async function startPractice() {
    busy(true, ['Writing a fresh test for you…', 'Aiming at your weak spots…', 'Breaking sentences the way you do…'], R.agent ? `using ${R.agent.label} · ~30–60s` : '');
    try { const t = await api('practice/new', {}); P.test = t; P.id = t.id; P.paste = 0; P.answers = { passage: '', fixit: ['', '', ''], diagram: '', rewrite: '' }; busy(false); lvl1(); }
    catch (e) { busy(false); toast('😵 ' + e.message, 5000); }
  }
  function lvl1() {
    const t = P.test.passage, v = $('#v-practice');
    v.innerHTML = `${lvlHead(1, '👻', 'The Vanishing Passage', 'var(--yellow)')}${target(t.targets)}<p style="font-weight:700">Read carefully — it <span class="hl pink">vanishes</span> when the timer hits zero.</p><div class="passage" id="pas">${esc(t.text)}</div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost small" id="hide">I've got it — hide it</button></div>`;
    let hidden = false;
    const hide = () => { if (hidden) return; hidden = true; $('#pas').classList.add('poof'); setTimeout(() => {
      v.innerHTML = `${lvlHead(1, '👻', 'The Vanishing Passage', 'var(--yellow)')}<div class="card"><p style="margin-top:0;font-weight:700">Poof! In <b>2–3 complete sentences</b>, answer:</p><ol style="font-weight:700;font-size:18px">${t.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ol><textarea id="a1" placeholder="Start typing…"></textarea><div class="row" id="m1" style="margin-top:10px;gap:8px"></div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="n1">Lock it in →</button></div></div>`;
      const a = $('#a1'); guard(a); meters(a, $('#m1'), { min: 15 }); a.focus();
      const next = () => { clearInterval(P.timer); P.answers.passage = a.value; lvl2(); };
      $('#n1').onclick = next; timer($('#ptimer'), T.passage, next);
    }, 900); };
    $('#hide').onclick = hide; timer($('#ptimer'), T.read, hide);
  }
  function lvl2() {
    const v = $('#v-practice');
    v.innerHTML = `${lvlHead(2, '🔧', 'Fix-It Factory', 'var(--soft-pink)')}${target([...new Set(P.test.fixit.map(f => f.targets).filter(Boolean))].join(' · '))}<p style="font-weight:700">Rewrite each sentence in clear, correct English. Keep the meaning.</p>${P.test.fixit.map((f, i) => `<div class="card" style="padding:18px;margin-bottom:14px"><div class="row between" style="margin-bottom:8px"><span class="tag">#${i + 1}</span>${f.focus ? `<span class="chip" style="font-size:12px">hint: ${esc(f.focus)}</span>` : ''}</div><div class="broken">${esc(f.broken)}</div><textarea class="fx" data-i="${i}" style="min-height:70px" placeholder="Your fixed sentence…"></textarea></div>`).join('')}<div class="row" style="justify-content:flex-end"><button class="btn" id="n2">Ship the fixes →</button></div>`;
    $$('.fx').forEach(guard); $('.fx').focus();
    const next = () => { clearInterval(P.timer); $$('.fx').forEach(t => P.answers.fixit[+t.dataset.i] = t.value); lvl3(); };
    $('#n2').onclick = next; timer($('#ptimer'), T.fixit, next);
  }
  function lvl3() {
    const d = P.test.diagram, v = $('#v-practice');
    v.innerHTML = `${lvlHead(3, '🖼️', 'Picture → Paragraph', 'var(--mint)')}${target(d.targets)}<div class="card"><p style="margin-top:0;font-weight:700;font-size:18px">Explain <span class="hl">${esc(d.title)}</span> to <b>${esc(d.audience)}</b> in one paragraph of <b>exactly 3 sentences</b>. No bullets.</p><div class="flow">${d.boxes.map((b, i) => `${i ? '<div class="arrow">→</div>' : ''}<div class="box b${i}"><span class="e">${esc(b.icon)}</span>${esc(b.label)}</div>`).join('')}</div><textarea id="a3" placeholder="If you…"></textarea><div class="row" id="m3" style="margin-top:10px;gap:8px"></div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="n3">Done →</button></div></div>`;
    const a = $('#a3'); guard(a); meters(a, $('#m3'), { exact: 3, noBullets: true, min: 25 });
    const next = () => { clearInterval(P.timer); P.answers.diagram = a.value; lvl4(); };
    $('#n3').onclick = next; timer($('#ptimer'), T.diagram, next);
  }
  function lvl4() {
    const r = P.test.rewrite, v = $('#v-practice');
    v.innerHTML = `${lvlHead(4, '✨', 'Prompt Glow-Up', 'var(--soft-blue)')}${target(r.targets)}<div class="card"><p style="margin-top:0;font-weight:700;font-size:18px">You (or someone like you) sent this to an AI:</p><div class="original">${esc(r.original)}</div>${r.context ? `<p class="muted" style="font-weight:600">Goal: ${esc(r.context)}</p>` : ''}<p style="font-weight:700">Rewrite it so the AI knows exactly <span class="hl mint">what to do, why, and what done looks like</span>.</p><textarea id="a4" placeholder="Goal: …"></textarea><div class="row" id="m4" style="margin-top:10px;gap:8px"></div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn pink" id="n4">Finish & grade 🏁</button></div></div>`;
    const a = $('#a4'); guard(a); meters(a, $('#m4'), { min: 20 });
    const next = () => { clearInterval(P.timer); P.answers.rewrite = a.value; grade(); };
    $('#n4').onclick = next; timer($('#ptimer'), T.rewrite, next);
  }
  async function grade() {
    busy(true, ['Grading your answers…', 'Checking sentence boundaries…', 'Hunting tense slips…'], R.agent ? `using ${R.agent.label}` : '');
    try {
      const g = await api('practice/submit', { id: P.id, answers: P.answers });
      busy(false);
      const L = g.levels || {}, m = g.models || {};
      const cmp = (y, mdl, l = 'Model answer') => `<div class="cmp"><div class="y"><small>You</small>${esc(y) || '<i>empty</i>'}</div>${mdl ? `<div class="m"><small>${l}</small>${esc(mdl)}</div>` : ''}</div>`;
      const mist = x => (x?.mistakes || []).length ? `<table class="t err">${x.mistakes.map(k => `<tr><td>${esc(k.wrote)}</td><td>${esc(k.fix)}</td><td>${esc(k.why)}</td></tr>`).join('')}</table>` : '';
      const CR = { sentence_boundaries: ['Sentence boundaries', '#ffd84d'], grammar_tense: ['Grammar & tense', '#ff5c8a'], comprehension: ['Comprehension', '#4b5cff'], clarity: ['Clarity & flow', '#2ee6a6'] };
      $('#v-practice').innerHTML = `<div class="card"><div class="hero">${dial(g.overall, 220)}<div><span class="tag">Practice result</span><div class="row" style="margin-top:12px"><span class="level">${esc(g.cefr)}</span>${P.paste ? `<span class="pill">🚫 ${P.paste} paste attempts</span>` : ''}</div><div class="headline">${esc(g.verdict || (g.overall >= 75 ? 'Strong work!' : 'Good effort — keep going.'))}</div>${(g.top_fixes || []).length ? `<ol style="font-weight:600;line-height:1.6">${g.top_fixes.map(f => `<li>${esc(f)}</li>`).join('')}</ol>` : ''}<div class="row"><button class="btn pink" id="again">🔁 New practice test</button></div></div></div></div>
        <div class="card" style="margin-top:22px"><h3>📊 Skills</h3><div class="bars">${Object.entries(CR).map(([k, [n, c]]) => `<div class="bar"><div class="lab"><span>${n} <small>${esc(g.criteria[k].comment)}</small></span><span>${g.criteria[k].score}</span></div><div class="track"><div class="fill" data-w="${g.criteria[k].score}" style="background:${c}"></div></div></div>`).join('')}</div></div>
        <div class="card" style="margin-top:22px"><h3>👻 Vanishing Passage ${L.passage?.score != null ? `· ${L.passage.score}/100` : ''}</h3><p>${esc(L.passage?.feedback || '')}</p>${cmp(g.answers.passage, m.passage)}${mist(L.passage)}<details><summary class="muted" style="cursor:pointer;font-weight:700">Show the passage</summary><p>${esc(g.test.passage.text)}</p></details></div>
        <div class="card" style="margin-top:22px"><h3>🔧 Fix-It Factory ${L.fixit?.score != null ? `· ${L.fixit.score}/100` : ''}</h3>${g.test.fixit.map((f, i) => `<div class="broken" style="margin-top:14px">${esc(f.broken)}</div>${cmp(g.answers.fixit[i], m.fixit[i])}${L.fixit?.items?.[i]?.note ? `<p class="muted" style="font-weight:600;margin:0">💡 ${esc(L.fixit.items[i].note)}</p>` : ''}`).join('')}</div>
        <div class="card" style="margin-top:22px"><h3>🖼️ Picture → Paragraph ${L.diagram?.score != null ? `· ${L.diagram.score}/100` : ''}</h3><p>${esc(L.diagram?.feedback || '')}</p>${cmp(g.answers.diagram, m.diagram)}${mist(L.diagram)}</div>
        <div class="card" style="margin-top:22px"><h3>✨ Prompt Glow-Up ${L.rewrite?.score != null ? `· ${L.rewrite.score}/100` : ''}</h3><div class="original" style="margin-bottom:10px">${esc(g.test.rewrite.original)}</div><p>${esc(L.rewrite?.feedback || '')}</p>${cmp(g.answers.rewrite, m.rewrite, 'Model prompt')}${mist(L.rewrite)}</div>`;
      $('#again').onclick = startPractice;
      $$('.ring', $('#v-practice')).forEach(c => setTimeout(() => { c.style.transition = 'stroke-dashoffset 1.6s'; c.style.strokeDashoffset = c.dataset.off; }, 150));
      $$('.dial [data-count]', $('#v-practice')).forEach(n => countUp(n, +n.dataset.count));
      animateBars($('#v-practice'));
      if (g.overall >= 60) setTimeout(confetti, 900);
      window.scrollTo({ top: 0 });
    } catch (e) { busy(false); toast('😵 ' + e.message, 5000); }
  }

  /* ================= PROMPTS EXPLORER ================= */
  let pOff = 0, pTimer;
  async function loadPrompts(reset) {
    if (reset) { pOff = 0; $('#plist').innerHTML = ''; }
    const q = new URLSearchParams({ q: $('#pq').value, tool: $('#ptool').value, flag: $('#pflag').value, offset: pOff });
    try {
      const r = await api('prompts?' + q);
      $('#pCount').textContent = num(r.total) + ' prompts';
      if (!r.total && !pOff) $('#plist').innerHTML = `<p class="muted">${R.stats.totals.prompts && !$('#pq').value ? 'Prompt history is only available right after a scan (not with --last).' : 'No matches.'}</p>`;
      $('#plist').insertAdjacentHTML('beforeend', r.items.map(p => `<div class="p"><div class="m"><span>${esc(p.tool)}</span>${p.project ? `<span>📁 ${esc(p.project)}</span>` : ''}${p.ts ? `<span>${new Date(p.ts).toLocaleString()}</span>` : ''}<span>${p.words} words</span></div><div class="x">${esc(p.text)}</div></div>`).join(''));
      pOff += r.items.length;
      $('#pmore').hidden = pOff >= r.total;
    } catch (e) { toast(e.message); }
  }
  $('#pq').oninput = () => { clearTimeout(pTimer); pTimer = setTimeout(() => loadPrompts(true), 250); };
  $('#ptool').onchange = $('#pflag').onchange = () => loadPrompts(true);
  $('#pmore').onclick = () => loadPrompts(false);

  /* ================= SHARE ================= */
  function renderShare() {
    const s = R.stats;
    const text = `My AI prompting score: ${R.scores.overall}/100 ${s.persona.emoji} ${s.persona.name}\n${num(s.totals.prompts)} prompts · ${s.tools.map(t => t.name).slice(0, 3).join(', ')}\n\nHow do you prompt? npx howamiprompting`;
    $('#v-share').innerHTML = `
      <div class="card"><span class="tag">Share card</span><h2 style="margin-top:12px">Flex your prompting ${s.persona.emoji}</h2>
        <p class="muted">Only scores and counts — none of your prompts are in the image.</p>
        <canvas class="cardprev" id="cardc" width="1200" height="630"></canvas>
        <div class="row" style="margin-top:18px"><button class="btn pink" id="shX">𝕏 Share on X</button><button class="btn blue" id="shLi">in Share on LinkedIn</button><button class="btn mint" id="shNative">📤 Share image…</button><button class="btn ghost" id="dl">⬇️ Download PNG</button><button class="btn ghost" id="cp">📋 Copy text</button></div>
        <p class="muted" style="font-size:14px;margin-bottom:0" id="shNote">X & LinkedIn: we upload just this image to howamiprompting.com so your post shows it as a big preview. Nothing else is sent.</p>
      </div>
      <div class="grid2" style="margin-top:24px">
        <div class="card"><h3>🏆 Join the public leaderboard <small class="muted">(optional)</small></h3>
          <p class="muted" style="margin-top:0">Sends only your nickname, scores, persona, tool names and prompt count to howamiprompting.com. Never your prompts.</p>
          <input type="text" id="lbHandle" placeholder="Nickname (shown publicly)" maxlength="40" style="margin-bottom:10px">
          <input type="text" id="lbGh" placeholder="GitHub username (optional)" maxlength="40" style="margin-bottom:12px">
          <button class="btn blue" id="lbGo">Publish my score</button><div id="lbMsg" style="margin-top:10px;font-weight:700"></div></div>
        <div class="card" style="background:var(--ink);color:#fff"><h3 style="color:var(--yellow)">⭐ Help other devs find this</h3><p>howamiprompting is free and open source. A star on GitHub is the best way to say thanks.</p><a class="btn" href="${GH}" target="_blank" rel="noopener">⭐ Star on GitHub</a>
          <p style="margin-top:18px;color:#cfcbe6">Tell a teammate: <code style="background:#fff2;padding:3px 8px;border-radius:6px">npx howamiprompting</code></p></div>
      </div>`;
    const cardBlob = () => new Promise(r => $('#cardc').toBlob(r, 'image/png'));
    let cardUrl = null;
    const ensureCardUrl = async () => {
      if (cardUrl) return cardUrl;
      busy(true, ['Creating your share link…']);
      try { const j = await api('card', { png: $('#cardc').toDataURL('image/png') }); cardUrl = j.url; return cardUrl; }
      finally { busy(false); }
    };
    const shareTo = async (net) => {
      const w = window.open('about:blank', '_blank'); // open now so pop-up blockers allow it
      try {
        const u = await ensureCardUrl();
        const short = `My AI prompting score: ${R.scores.overall}/100 ${s.persona.emoji} ${s.persona.name}. How do you prompt? npx howamiprompting`;
        const target = net === 'x' ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(short)}&url=${encodeURIComponent(u)}`
          : `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`;
        if (w) w.location = target; else window.open(target, '_blank');
        if (net === 'li') copy(text + '\n' + u, 'Post text copied — paste it into LinkedIn ✍️');
      } catch (e) {
        if (w) w.close();
        // offline fallback: put the PNG on the clipboard and open the composer with text only
        let copied = false;
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': await cardBlob() })]); copied = true; } catch (err) {}
        toast(copied ? 'Image copied — paste it into your post (⌘V) 🖼️' : '😵 ' + e.message, 5000);
        window.open(net === 'x' ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}` : 'https://www.linkedin.com/feed/', '_blank');
      }
    };
    $('#shX').onclick = () => shareTo('x');
    $('#shLi').onclick = () => shareTo('li');
    $('#shNative').onclick = async () => {
      const file = new File([await cardBlob()], 'howamiprompting.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], text, title: 'How am I prompting?' }); } catch (e) {}
      } else {
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': file })]); toast('Image copied to clipboard — paste it anywhere 🖼️'); }
        catch (e) { $('#dl').click(); }
      }
    };
    $('#dl').onclick = () => { const a = document.createElement('a'); a.download = 'howamiprompting.png'; a.href = $('#cardc').toDataURL('image/png'); a.click(); toast('Saved 🎉'); };
    $('#cp').onclick = () => copy(text);
    $('#lbGo').onclick = async () => {
      const handle = $('#lbHandle').value.trim();
      if (!handle) { $('#lbMsg').textContent = 'Pick a nickname first.'; return; }
      $('#lbGo').disabled = true; $('#lbMsg').textContent = 'Publishing…';
      try { const r = await api('publish', { handle, github: $('#lbGh').value.trim() }); $('#lbMsg').innerHTML = `🎉 Published! ${r.rank ? `You're <b>#${r.rank}</b>. ` : ''}${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">See the leaderboard →</a>` : ''}`; confetti(); }
      catch (e) { $('#lbMsg').textContent = '😵 ' + e.message; }
      finally { $('#lbGo').disabled = false; }
    };
  }
  function drawCard() {
    const c = $('#cardc'); if (!c) return;
    const x = c.getContext('2d'), s = R.stats, sc = R.scores;
    const F = (w, sz) => `${w} ${sz}px "Bricolage Grotesque", "Space Grotesk", system-ui, sans-serif`;
    x.fillStyle = '#fff7e8'; x.fillRect(0, 0, 1200, 630);
    x.fillStyle = 'rgba(22,20,43,.1)'; for (let i = 0; i < 1200; i += 24) for (let j = 0; j < 630; j += 24) { x.beginPath(); x.arc(i, j, 1.6, 0, 7); x.fill(); }
    x.fillStyle = '#ffd84d'; x.beginPath(); x.arc(1120, 40, 190, 0, 7); x.fill();
    x.fillStyle = '#ff5c8a'; x.beginPath(); x.arc(40, 640, 150, 0, 7); x.fill();
    const box = (X, Y, W, H, fill) => { x.fillStyle = '#16142b'; x.beginPath(); x.roundRect(X + 8, Y + 8, W, H, 28); x.fill(); x.fillStyle = fill; x.beginPath(); x.roundRect(X, Y, W, H, 28); x.fill(); x.lineWidth = 4; x.strokeStyle = '#16142b'; x.stroke(); };
    box(50, 50, 1092, 524, '#fff');
    // dial
    const cx = 240, cy = 300, r = 140, col = sc.overall >= 75 ? '#2ee6a6' : sc.overall >= 55 ? '#ffd84d' : '#ff5c8a';
    x.lineCap = 'round'; x.lineWidth = 30; x.strokeStyle = '#16142b'; x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * sc.overall / 100); x.stroke();
    x.lineWidth = 20; x.strokeStyle = col; x.stroke();
    x.fillStyle = '#16142b'; x.textAlign = 'center'; x.font = F(800, 110); x.fillText(sc.overall, cx, cy + 36);
    x.font = F(800, 18); x.fillStyle = '#6b6880'; x.fillText('PROMPTING SCORE', cx, cy + 72);
    // text
    x.textAlign = 'left'; x.fillStyle = '#16142b';
    x.font = F(800, 26); x.fillText('how am i prompting?', 450, 112);
    x.font = F(800, 56); x.fillText(`${s.persona.emoji} ${s.persona.name}`, 450, 182);
    x.font = F(600, 22); x.fillStyle = '#6b6880'; x.fillText(`${num(s.totals.prompts)} prompts · ${s.tools.slice(0, 3).map(t => t.name).join(' · ')}`, 450, 222);
    Object.keys(DIMS).forEach((k, i) => {
      const y = 270 + i * 44;
      x.fillStyle = '#16142b'; x.font = F(800, 21); x.fillText(DIMS[k][0], 450, y + 18);
      x.fillStyle = '#fff'; x.beginPath(); x.roundRect(620, y, 400, 24, 12); x.fill(); x.lineWidth = 3; x.strokeStyle = '#16142b'; x.stroke();
      x.fillStyle = DIMS[k][1]; x.beginPath(); x.roundRect(622, y + 2, Math.max(10, 396 * sc[k] / 100), 20, 10); x.fill();
      x.fillStyle = '#16142b'; x.font = F(800, 21); x.fillText(sc[k], 1036, y + 19);
    });
    x.fillStyle = '#16142b'; x.beginPath(); x.roundRect(450, 528, 300, 34, 10); x.fill();
    x.fillStyle = '#2ee6a6'; x.font = '600 20px "JetBrains Mono", ui-monospace, monospace'; x.fillText('$ npx howamiprompting', 464, 552);
    x.fillStyle = '#6b6880'; x.font = F(700, 19); x.fillText('howamiprompting.com', 790, 552);
  }

  /* ================= BOOT ================= */
  (async () => {
    try {
      R = await api('report');
      $('#ver').textContent = 'v' + R.version + ' · ' + new Date(R.generatedAt).toLocaleString();
      $('#ptool').innerHTML = '<option value="">All tools</option>' + R.stats.tools.map(t => `<option>${esc(t.name)}</option>`).join('');
      renderReport(); renderEnglish(); practiceHome(); renderShare();
      let seen = null; try { seen = localStorage.getItem('hap_seen'); } catch (e) {}
      if (seen !== R.generatedAt) playStory();
    } catch (e) {
      $('#v-report').innerHTML = `<div class="card" style="text-align:center"><h2>😵 Can't load your report</h2><p class="muted">${esc(e.message)}</p><p>Open the exact link printed in your terminal, or run <code>npx howamiprompting --last</code>.</p></div>`;
    }
  })();
})();
