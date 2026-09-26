import * as store from './store.js';
import { BODY_PARTS, EXERCISES, byId } from './exercises.js';
import { buildWorkout, recommendParts, blockSeconds } from './planner.js';
import { targets, mealPlan, workoutWaterMl, ACTIVITY, GOALS, SLOTS } from './nutrition.js';
import { Coach } from './coach.js';
import { WorkoutSession, runPostureScan } from './session.js';
import { postureScore } from './posture.js';
import { Pedometer } from './pedometer.js';
import { sendChat } from './chat.js';
import { loadPoseModel } from './pose.js';

const view = document.getElementById('view');
const S = () => store.get();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('de-CH');

let tab = 'home';
let coach;
let pedometer;
let draftPlan = null;
let selectedParts = null;
let foodDay = (new Date().getDay() + 6) % 7;

function makeCoach() {
  const p = S().profile || {};
  coach = new Coach({ lang: p.lang || 'en', name: p.name || '', voice: S().settings.voice });
}

function T() {
  return S().profile ? targets(S().profile) : null;
}

function todayWorkouts() {
  const k = store.todayKey();
  return S().workouts.filter((w) => store.todayKey(new Date(w.at)) === k);
}

function waterGoal() {
  const t = T();
  if (!t) return 2500;
  const mins = todayWorkouts().reduce((a, w) => a + w.minutes, 0);
  return t.waterMl + workoutWaterMl(mins);
}

function toast(text, ms = 4000) {
  const d = document.createElement('div');
  d.className = 'toast';
  d.innerHTML = `<div class="coach-say"><div class="avatar">🤖</div><div>${esc(text)}</div></div>`;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), ms);
}

function ring(value, max, color, big, small) {
  const r = 40, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  return `<div class="ring"><svg width="92" height="92" viewBox="0 0 92 92">
    <circle cx="46" cy="46" r="${r}" fill="none" stroke="#ffffff14" stroke-width="9"/>
    <circle cx="46" cy="46" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/></svg>
    <div class="val"><div>${big}<small>${small}</small></div></div></div>`;
}

// ---------- Coach messages (the "friend" voice on the home screen) ----------

function coachLines() {
  const s = S();
  const p = s.profile;
  const d = store.day();
  const t = T();
  const hour = new Date().getHours();
  const lines = [];
  const name = p?.name ? `, ${p.name}` : '';
  const greet = hour < 11 ? `Good morning${name}!` : hour < 17 ? `Hey${name}!` : `Good evening${name}!`;
  lines.push(greet);

  const streak = store.streak();
  const doneToday = todayWorkouts().length > 0;
  if (d.checkin === 'low') lines.push("Low energy today. That's OK. We'll do a lighter session and focus on perfect form.");
  if (d.checkin === 'high') lines.push("You're full of energy. Let's make today count!");
  if (doneToday) lines.push(`Workout done today ✅. That's ${streak} day${streak === 1 ? '' : 's'} in a row. Recovery matters too: protein, water, sleep.`);
  else if (streak >= 2) lines.push(`🔥 ${streak}-day streak. Don't break it! Even 15 minutes counts.`);
  else if (hour >= 17) lines.push("There's still time for a quick 15-minute session. I'll count every rep with you.");
  else lines.push("Pick your body parts in Train and I'll build today's workout and watch your form.");

  if (t) {
    const expected = waterGoal() * Math.max(0, Math.min(1, (hour - 7) / 14));
    if (d.water < expected - 400) lines.push(`You're behind on water (${fmt(d.water)} ml). Grab a glass now 💧`);
    if (hour >= 15 && d.steps < t.steps * 0.5) lines.push(`Steps: ${fmt(d.steps)} of ${fmt(t.steps)}. A 15-minute walk is about 1,800 steps.`);
  }
  const lastScan = s.posture[s.posture.length - 1];
  const finding = lastScan?.results.flatMap((r) => r.findings)[0];
  if (finding) lines.push(`Posture homework: ${finding.fix[0]}. It only takes 2 minutes.`);
  return lines;
}

// ---------- Views ----------

function homeView() {
  const s = S();
  if (!s.profile) {
    return `<div class="card hero stack">
      <div class="coach-say"><div class="avatar">🤖</div><div>
        <h1>Hi, I'm AlpenCoach.</h1>
        <p>Your AI personal trainer and training buddy. I watch your form through the camera, count your reps, cheer you on, and plan your food, water and steps.</p>
      </div></div>
      <p class="small muted">Everything runs on your phone. Your video never leaves the device.</p>
      <button class="btn primary big" data-go="body">Let's set you up →</button>
    </div>`;
  }
  const d = store.day();
  const t = T();
  const lines = coachLines();
  const rec = recommendParts(s.workouts);
  const wk = s.workouts.filter((w) => Date.now() - w.at < 7 * 86400000);
  const recLabels = rec.map((id) => BODY_PARTS.find((b) => b.id === id)?.label).join(' + ');

  return `
  <div class="card hero">
    <div class="coach-say"><div class="avatar">🤖</div>
      <div class="stack">${lines.map((l, i) => `<p style="${i === 0 ? 'font-weight:700;font-size:18px' : ''}">${esc(l)}</p>`).join('')}</div>
    </div>
  </div>

  ${d.checkin ? '' : `<div class="card"><h3>How's your energy today?</h3>
    <div class="grid3">
      <button class="btn" data-checkin="low">😴 Low</button>
      <button class="btn" data-checkin="ok">🙂 OK</button>
      <button class="btn" data-checkin="high">⚡ High</button>
    </div></div>`}

  <div class="card">
    <div class="grid3">
      <div>${ring(d.water, waterGoal(), 'var(--water)', (d.water / 1000).toFixed(1) + 'L', `/${(waterGoal() / 1000).toFixed(1)}L`)}<div class="ring-label">Water</div></div>
      <div>${ring(d.steps, t.steps, 'var(--warn)', d.steps >= 1000 ? (d.steps / 1000).toFixed(1) + 'k' : d.steps, `/${t.steps / 1000}k`)}<div class="ring-label">Steps</div></div>
      <div>${ring(todayWorkouts().length ? 1 : 0, 1, 'var(--accent)', todayWorkouts().length ? '✓' : '–', '')}<div class="ring-label">Workout</div></div>
    </div>
  </div>

  <div class="card stack">
    <div class="row between"><h3>💧 Water</h3><span class="small muted">${fmt(d.water)} / ${fmt(waterGoal())} ml</span></div>
    <div class="grid3">
      <button class="btn" data-water="250">+ Glass<br><span class="small muted">250 ml</span></button>
      <button class="btn" data-water="500">+ Bottle<br><span class="small muted">500 ml</span></button>
      <button class="btn ghost" data-water="-250">Undo<br><span class="small muted">−250 ml</span></button>
    </div>
  </div>

  <div class="card stack">
    <div class="row between"><h3>👟 Steps</h3><span class="small muted">${fmt(d.steps)} / ${fmt(t.steps)}</span></div>
    <button class="btn ${pedometer?.active ? 'primary' : ''}" id="ped-toggle" style="width:100%">${pedometer?.active ? '● Counting live (tap to stop)' : '▶ Count steps live'}</button>
    <div class="row">
      <input id="steps-add" type="number" inputmode="numeric" placeholder="Add steps from Health app" style="flex:1">
      <button class="btn" id="steps-save">Add</button>
    </div>
    <p class="small muted">Live counting works while the app is open. Copy your daily total from your phone's Health app for the full picture.</p>
  </div>

  <div class="card stack">
    <h3>Today's suggestion</h3>
    <p>${esc(recLabels)} · ${d.checkin === 'low' ? 15 : 25} min</p>
    <button class="btn primary big" data-quick="${rec.join(',')}">Start with my coach ▶</button>
  </div>

  <div class="card">
    <h3>This week</h3>
    <div class="grid3">
      <div class="stat"><b>${wk.length}</b><span>workouts</span></div>
      <div class="stat"><b>${fmt(wk.reduce((a, w) => a + w.reps, 0))}</b><span>reps</span></div>
      <div class="stat"><b>${fmt(wk.reduce((a, w) => a + w.kcal, 0))}</b><span>kcal burned</span></div>
    </div>
  </div>`;
}

function trainView() {
  const s = S();
  const p = s.profile || {};
  if (!selectedParts) selectedParts = recommendParts(s.workouts);
  const planHtml = draftPlan ? `
    <div class="card stack">
      <div class="row between"><h2>Your workout</h2><span class="muted small">~${Math.round(draftPlan.blocks.reduce((a, b) => a + blockSeconds(b), 0) / 60)} min</span></div>
      <ul class="list">${draftPlan.blocks.map((b) => `<li class="row between">
        <div><b>${esc(b.name)}</b><div class="small muted">${byId[b.id].view === 'side' ? 'Side-on to camera' : 'Facing camera'}</div></div>
        <span class="tag">${b.sets} × ${b.target}${b.type === 'hold' ? 's' : ''}</span></li>`).join('')}</ul>
      <p class="small muted">Tip: lean your phone against something at hip height, 2–3 m away, so I can see your whole body.</p>
      <div class="row"><button class="btn" id="shuffle">🔀 Shuffle</button><button class="btn primary" id="start" style="flex:1">Start workout ▶</button></div>
    </div>` : '';

  const history = s.workouts.slice(-5).reverse();
  return `
  <h1>Train</h1>
  <div class="card stack">
    <h3>What do you want to work today?</h3>
    <div class="chips">${BODY_PARTS.map((b) => `<span class="chip ${selectedParts.includes(b.id) ? 'on' : ''}" data-part="${b.id}">${b.icon} ${b.label}</span>`).join('')}</div>
    <div class="grid2">
      <label class="field"><span>Time</span><select id="minutes">${[10, 15, 20, 30, 45].map((m) => `<option ${m === (s.lastMinutes || 20) ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="field"><span>Level</span><select id="level">${['beginner', 'intermediate', 'advanced'].map((l) => `<option value="${l}" ${l === (p.level || 'beginner') ? 'selected' : ''}>${l[0].toUpperCase() + l.slice(1)}</option>`).join('')}</select></label>
    </div>
    <button class="btn primary big" id="build">Build my workout</button>
  </div>
  ${planHtml}
  <div class="card">
    <h3>Exercise library</h3>
    <p class="small muted">Tap one to practise a single exercise with live form feedback.</p>
    <ul class="list">${EXERCISES.filter((e) => !selectedParts.length || e.parts.some((x) => selectedParts.includes(x))).map((e) => `<li class="row between">
      <div><b>${esc(e.name)}</b><div class="small muted">${e.parts.join(' · ')}</div></div>
      <button class="btn" data-practice="${e.id}">Try</button></li>`).join('')}</ul>
  </div>
  ${history.length ? `<div class="card"><h3>Recent workouts</h3><ul class="list">${history.map((w) => `<li>
    <div class="row between"><b>${new Date(w.at).toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' })}</b><span class="tag">${w.minutes} min</span></div>
    <div class="small muted">${w.parts.join(', ')} · ${w.reps} reps · form ${w.formScore ?? '–'}% · ${w.kcal} kcal</div></li>`).join('')}</ul></div>` : ''}`;
}

function bodyView() {
  const s = S();
  const p = s.profile || { sex: 'male', activity: 'light', goal: 'lose', level: 'beginner', diet: 'omni', lang: 'en' };
  const t = s.profile ? targets(s.profile) : null;
  const opt = (obj, cur) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(v.label || v)}</option>`).join('');
  const lastScan = s.posture[s.posture.length - 1];

  return `
  <h1>Your body</h1>
  ${t ? `<div class="card hero stack">
    <h3>Your numbers</h3>
    <div class="grid3">
      <div class="stat"><b>${t.bmi}</b><span>BMI · ${t.bmiCategory}</span></div>
      <div class="stat"><b>${fmt(t.bmr)}</b><span>BMR kcal (at rest)</span></div>
      <div class="stat"><b>${fmt(t.tdee)}</b><span>Daily burn kcal</span></div>
      <div class="stat"><b class="accent">${fmt(t.kcal)}</b><span>Eat kcal / day</span></div>
      <div class="stat"><b>${t.protein} g</b><span>Protein / day</span></div>
      <div class="stat"><b>${(t.waterMl / 1000).toFixed(1)} L</b><span>Water + workouts</span></div>
      <div class="stat"><b>${fmt(t.steps)}</b><span>Steps / day</span></div>
      <div class="stat"><b>${t.carbs} g</b><span>Carbs</span></div>
      <div class="stat"><b>${t.fat} g</b><span>Fat</span></div>
    </div>
    ${t.waistToHeight ? `<p class="small">Waist-to-height ratio <b>${t.waistToHeight}</b> · risk: <b>${t.waistRisk}</b> (aim for under 0.5)</p>` : '<p class="small muted">Add your waist measurement for a better health-risk estimate than BMI alone.</p>'}
    <p class="small muted">Estimates from standard formulas (Mifflin-St Jeor). Not medical advice.</p>
  </div>` : ''}

  <div class="card stack">
    <div class="row between"><h3>🧍 Posture scan</h3>${lastScan ? `<span class="tag">Score ${lastScan.score}</span>` : ''}</div>
    <p class="small muted">I'll look at you from the front and the side for 5 seconds each and check shoulders, hips, head, knees and back.</p>
    ${lastScan ? `<ul class="list">${lastScan.results.flatMap((r) => r.findings).map((f) => `<li><div class="row between"><b>${esc(f.title)}</b><span class="tag ${f.severity}">${f.severity}</span></div>
      <div class="small muted">Fix: ${f.fix.map(esc).join(' · ')}</div></li>`).join('') || '<li>No notable imbalances found. Nice posture! 👏</li>'}</ul>
      <p class="small muted">Last scan ${new Date(lastScan.at).toLocaleDateString('de-CH')}. Screening only. See a physiotherapist for pain.</p>` : ''}
    <button class="btn primary" id="scan" ${s.profile ? '' : 'disabled'}>${lastScan ? 'Scan again' : 'Start posture scan'}</button>
  </div>

  <form class="card stack" id="profile">
    <h3>${s.profile ? 'Profile' : "Let's get to know you"}</h3>
    <label class="field"><span>Your name (the coach will use it)</span><input name="name" value="${esc(p.name || '')}" required></label>
    <div class="grid2">
      <label class="field"><span>Sex (for calorie formula)</span><select name="sex">${opt({ male: 'Male', female: 'Female' }, p.sex)}</select></label>
      <label class="field"><span>Age</span><input name="age" type="number" inputmode="numeric" min="14" max="99" value="${p.age || ''}" required></label>
      <label class="field"><span>Height (cm)</span><input name="height" type="number" inputmode="decimal" min="120" max="230" value="${p.height || ''}" required></label>
      <label class="field"><span>Weight (kg)</span><input name="weight" type="number" inputmode="decimal" step="0.1" min="35" max="300" value="${p.weight || ''}" required></label>
      <label class="field"><span>Waist (cm, optional)</span><input name="waist" type="number" inputmode="decimal" value="${p.waist || ''}"></label>
      <label class="field"><span>Fitness level</span><select name="level">${opt({ beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }, p.level)}</select></label>
    </div>
    <label class="field"><span>Activity</span><select name="activity">${opt(ACTIVITY, p.activity)}</select></label>
    <label class="field"><span>Main goal</span><select name="goal">${opt(GOALS, p.goal)}</select></label>
    <div class="grid2">
      <label class="field"><span>Diet</span><select name="diet">${opt({ omni: 'Everything', veg: 'Vegetarian', vegan: 'Vegan' }, p.diet)}</select></label>
      <label class="field"><span>Coach voice</span><select name="lang">${opt({ en: 'English', de: 'Deutsch' }, p.lang)}</select></label>
    </div>
    <button class="btn primary big">${s.profile ? 'Save' : 'Create my plan'}</button>
  </form>

  ${s.profile ? `<div class="card stack">
    <h3>Settings</h3>
    <label class="row between"><span>Voice coaching</span><input type="checkbox" id="voice" ${s.settings.voice ? 'checked' : ''} style="width:24px;min-height:0"></label>
    <label class="field"><span>Water reminder every (minutes, 0 = off)</span><input id="remind" type="number" value="${s.settings.waterReminderMin}"></label>
    <div class="row"><button class="btn" id="test-voice">🔊 Test voice</button><button class="btn" id="export">Export data</button><button class="btn danger" id="reset">Reset</button></div>
  </div>` : ''}`;
}

function foodView() {
  const s = S();
  if (!s.profile) return `<h1>Food</h1><div class="card"><p>Create your profile first so I can calculate your calories.</p><button class="btn primary" data-go="body">Set up profile</button></div>`;
  const t = T();
  const plan = mealPlan(t, s.profile.diet, 7);
  const today = (new Date().getDay() + 6) % 7;
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dp = plan[foodDay];
  const eaten = foodDay === today ? store.day().meals : {};
  const eatenKcal = dp.meals.filter((m) => eaten[m.slot]).reduce((a, m) => a + m.kcal, 0);
  const eatenProt = dp.meals.filter((m) => eaten[m.slot]).reduce((a, m) => a + m.protein, 0);
  const glasses = Math.ceil(waterGoal() / 250);

  return `
  <h1>Food & water</h1>
  <div class="card hero">
    <div class="grid3">
      <div class="stat"><b class="accent">${fmt(t.kcal)}</b><span>kcal target</span></div>
      <div class="stat"><b>${t.protein} g</b><span>protein</span></div>
      <div class="stat"><b>${(waterGoal() / 1000).toFixed(1)} L</b><span>water</span></div>
    </div>
    ${foodDay === today ? `<p class="small" style="margin-top:10px">Eaten so far: <b>${fmt(eatenKcal)} kcal</b> · <b>${eatenProt} g protein</b></p>` : ''}
  </div>

  <div class="day-tabs">${dayNames.map((n, i) => `<span class="chip ${i === foodDay ? 'on' : ''}" data-day="${i}">${n}${i === today ? ' •' : ''}</span>`).join('')}</div>

  <div style="margin-top:12px">${dp.meals.map((m) => `
    <div class="card meal ${eaten[m.slot] ? 'eaten' : ''}">
      ${foodDay === today ? `<input type="checkbox" data-meal="${m.slot}" ${eaten[m.slot] ? 'checked' : ''} aria-label="Mark as eaten">` : ''}
      <div style="flex:1">
        <div class="small muted">${m.slot}</div>
        <h3>${esc(m.name)}</h3>
        <div class="small">${m.items.map(([n, g]) => `${esc(n)} <b>${g}${/milk|oil/i.test(n) && g > 20 ? ' ml' : ' g'}</b>`).join(' · ')}</div>
        <div class="small muted" style="margin-top:4px">${m.kcal} kcal · ${m.protein} g protein</div>
      </div>
    </div>`).join('')}
    <p class="small muted">Day total ≈ ${fmt(dp.kcal)} kcal · ${dp.protein} g protein. Portions are scaled to your target. Swap meals freely within the same slot.</p>
    ${dp.protein < t.protein - 15 ? `<div class="card small">💪 Protein gap: about <b>${t.protein - dp.protein} g</b>. Add ${s.profile.diet === 'vegan' ? 'a soy/pea protein shake (~25 g) or 200 g tofu' : 'a protein shake (~25 g), 250 g low-fat quark (~30 g) or 200 g cottage cheese (~22 g)'} to hit your target.</div>` : ''}
  </div>

  <div class="card">
    <h3>💧 Water plan: ${glasses} glasses</h3>
    <ul class="list small">
      <li>On waking: 1–2 glasses</li>
      <li>Before each meal: 1 glass</li>
      <li>During training: ~500 ml per 30 min</li>
      <li>Afternoon: 2 glasses (beats the 3 pm slump)</li>
    </ul>
  </div>`;
}

function chatView() {
  const s = S();
  const hasKey = !!s.settings.apiKey;
  return `
  <h1>Coach chat</h1>
  ${hasKey ? '' : `<div class="card stack">
    <div class="coach-say"><div class="avatar">🤖</div><div>
      <p>Ask me anything: form, soreness, what to eat tonight, how to break a plateau. I know your profile, today's numbers and workout history.</p>
      <p class="small muted">Chat uses Claude by Anthropic. Paste your own API key from console.anthropic.com. It's stored only on this phone and sent only to Anthropic.</p>
    </div></div>
    <label class="field"><span>Anthropic API key</span><input id="apikey" type="password" autocomplete="off" placeholder="sk-ant-…"></label>
    <button class="btn primary" id="savekey">Save key</button>
  </div>`}
  <div class="chat-log" id="chatlog">${s.chat.map((m) => `<div class="msg ${m.role}">${esc(m.content)}</div>`).join('')}</div>
  ${hasKey ? `<div class="chips" style="margin-bottom:8px">${['What should I eat after training?', 'My knees hurt when I squat', 'Plan my week', 'Motivate me!'].map((q) => `<span class="chip" data-ask="${esc(q)}">${esc(q)}</span>`).join('')}</div>
  <form class="chat-input" id="chatform"><input id="chatmsg" placeholder="Message your coach…" autocomplete="off"><button class="btn primary">Send</button></form>
  <div class="row"><button class="btn ghost small" id="clearchat">Clear chat</button><button class="btn ghost small" id="forgetkey">Remove API key</button></div>` : ''}`;
}

function chatContext() {
  const s = S();
  const t = T();
  const d = store.day();
  const p = s.profile;
  const recent = s.workouts.slice(-5).map((w) => `${new Date(w.at).toDateString()}: ${w.parts.join('/')} ${w.minutes}min, ${w.reps} reps, form ${w.formScore}%, blocks: ${w.blocks.map((b) => `${b.name} ${b.sets.map((x) => x.reps ?? x.seconds + 's').join('/')}`).join('; ')}`).join('\n');
  const findings = (s.posture[s.posture.length - 1]?.results || []).flatMap((r) => r.findings.map((f) => f.title)).join('; ');
  return [
    p ? `Profile: ${p.name}, ${p.sex}, ${p.age}y, ${p.height}cm, ${p.weight}kg${p.waist ? `, waist ${p.waist}cm` : ''}, activity ${p.activity}, goal ${p.goal}, level ${p.level}, diet ${p.diet}.` : 'No profile yet.',
    t ? `Targets: ${t.kcal} kcal, ${t.protein}g protein, ${t.carbs}g carbs, ${t.fat}g fat, water ${waterGoal()}ml, steps ${t.steps}. BMI ${t.bmi}.` : '',
    `Today (${new Date().toString().slice(0, 21)}): water ${d.water}ml, steps ${d.steps}, energy check-in ${d.checkin || 'n/a'}, meals eaten: ${Object.keys(d.meals).filter((k) => d.meals[k]).join(', ') || 'none logged'}.`,
    `Streak: ${store.streak()} days.`,
    recent ? `Recent workouts:\n${recent}` : 'No workouts logged yet.',
    findings ? `Posture findings: ${findings}` : '',
  ].filter(Boolean).join('\n');
}

// ---------- Rendering & events ----------

function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  view.innerHTML = { home: homeView, train: trainView, body: bodyView, food: foodView, chat: chatView }[tab]();
  if (tab === 'chat') {
    const log = document.getElementById('chatlog');
    log?.lastElementChild?.scrollIntoView({ block: 'end' });
  }
}

function go(t) {
  tab = t;
  render();
  window.scrollTo(0, 0);
}

function startWorkout(plan) {
  makeCoach();
  const p = S().profile;
  S().lastMinutes = plan.minutes;
  const session = new WorkoutSession({
    plan,
    coach,
    weight: p?.weight || 70,
    onFinish: (summary) => {
      if (summary.blocks.length) {
        store.update((s) => s.workouts.push(summary));
        toast(`Saved: ${summary.reps} reps · ${summary.kcal} kcal · form ${summary.formScore ?? '–'}%. Drink ~${workoutWaterMl(summary.minutes)} ml extra today.`, 7000);
      }
      draftPlan = null;
      go('home');
    },
  });
  session.start();
}

document.getElementById('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) go(b.dataset.tab);
});

view.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-go],[data-checkin],[data-water],[data-quick],[data-part],[data-practice],[data-day],[data-ask],button');
  if (!t) return;
  const ds = t.dataset;
  if (ds.go) return go(ds.go);
  if (ds.checkin) {
    store.update(() => { store.day().checkin = ds.checkin; });
    return render();
  }
  if (ds.water) {
    store.update((s) => {
      const d = store.day();
      d.water = Math.max(0, d.water + Number(ds.water));
      s.lastWaterAt = Date.now();
    });
    const d = store.day();
    if (Number(ds.water) > 0 && d.water >= waterGoal() && d.water - Number(ds.water) < waterGoal()) toast('Water goal reached! 💧 Your body thanks you.');
    return render();
  }
  if (ds.quick) {
    const s = S();
    const low = store.day().checkin === 'low';
    const plan = buildWorkout({ parts: ds.quick.split(','), level: s.profile.level, goal: s.profile.goal, minutes: low ? 15 : 25, energy: store.day().checkin || 'ok' });
    return startWorkout(plan);
  }
  if (ds.part) {
    selectedParts = selectedParts.includes(ds.part) ? selectedParts.filter((x) => x !== ds.part) : [...selectedParts, ds.part];
    draftPlan = null;
    return render();
  }
  if (ds.practice) {
    const ex = byId[ds.practice];
    const lvl = S().profile?.level || 'beginner';
    const target = ex.type === 'hold' ? { beginner: 20, intermediate: 40, advanced: 60 }[lvl] : { beginner: 8, intermediate: 12, advanced: 15 }[lvl] * (ex.fast ? 2 : 1);
    return startWorkout({ parts: ex.parts, minutes: 5, blocks: [{ id: ex.id, name: ex.name, type: ex.type || 'reps', sets: 3, target, rest: 45 }] });
  }
  if (ds.day) {
    foodDay = Number(ds.day);
    return render();
  }
  if (ds.ask) return askCoach(ds.ask);

  switch (t.id) {
    case 'build':
    case 'shuffle': {
      const s = S();
      const minutes = Number(document.getElementById('minutes').value);
      const level = document.getElementById('level').value;
      s.lastMinutes = minutes;
      draftPlan = buildWorkout({ parts: selectedParts, level, goal: s.profile?.goal, minutes, energy: store.day().checkin || 'ok', seed: Date.now() });
      render();
      document.getElementById('start')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      break;
    }
    case 'start':
      if (draftPlan) startWorkout(draftPlan);
      break;
    case 'ped-toggle':
      try {
        if (pedometer?.active) pedometer.stop();
        else {
          pedometer = pedometer || new Pedometer(onStep);
          await pedometer.start();
          toast('Counting steps. Keep the app open while you walk.');
        }
      } catch (err) {
        toast(`Step counting unavailable: ${err.message}`);
      }
      render();
      break;
    case 'steps-save': {
      const v = Number(document.getElementById('steps-add').value);
      if (v > 0) store.update(() => { store.day().steps += v; });
      render();
      break;
    }
    case 'scan':
      makeCoach();
      runPostureScan({
        coach,
        onDone: (results) => {
          if (!results.length) return toast("I couldn't see you clearly. Try again with your whole body in frame and good light.");
          store.update((s) => s.posture.push({ at: Date.now(), score: postureScore(results), results }));
          const n = results.flatMap((r) => r.findings).length;
          coach.say(n ? `Scan complete. I found ${n} thing${n > 1 ? 's' : ''} to work on. I've added corrective exercises.` : 'Scan complete. Your posture looks great!');
          go('body');
        },
      });
      break;
    case 'test-voice':
      makeCoach();
      coach.say(coach.P.remaining[1], { interrupt: true });
      break;
    case 'export': {
      const blob = new Blob([store.exportJson()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `alpencoach-${store.todayKey()}.json`;
      a.click();
      break;
    }
    case 'reset':
      if (confirm('Delete all your data on this phone?')) {
        store.reset();
        go('home');
      }
      break;
    case 'savekey': {
      const k = document.getElementById('apikey').value.trim();
      if (k) store.update((s) => { s.settings.apiKey = k; });
      render();
      break;
    }
    case 'forgetkey':
      store.update((s) => { s.settings.apiKey = ''; });
      render();
      break;
    case 'clearchat':
      store.update((s) => { s.chat = []; });
      render();
      break;
  }
});

view.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.meal) {
    store.update(() => { store.day().meals[t.dataset.meal] = t.checked; });
    render();
  } else if (t.id === 'voice') {
    store.update((s) => { s.settings.voice = t.checked; });
  } else if (t.id === 'remind') {
    store.update((s) => { s.settings.waterReminderMin = Math.max(0, Number(t.value) || 0); });
  }
});

view.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'profile') {
    const f = new FormData(e.target);
    const num = (k) => (f.get(k) ? Number(f.get(k)) : null);
    const first = !S().profile;
    store.update((s) => {
      s.profile = {
        name: f.get('name').trim(), sex: f.get('sex'), age: num('age'), height: num('height'), weight: num('weight'), waist: num('waist'),
        activity: f.get('activity'), goal: f.get('goal'), level: f.get('level'), diet: f.get('diet'), lang: f.get('lang'),
      };
    });
    makeCoach();
    toast(first ? `Welcome ${S().profile.name}! Your plan is ready. Let's do this 💪` : 'Saved. Targets updated.');
    render();
    window.scrollTo(0, 0);
  } else if (e.target.id === 'chatform') {
    const input = document.getElementById('chatmsg');
    const q = input.value.trim();
    if (q) askCoach(q);
  }
});

async function askCoach(q) {
  const s = S();
  store.update((st) => st.chat.push({ role: 'user', content: q }));
  render();
  const log = document.getElementById('chatlog');
  const bubble = document.createElement('div');
  bubble.className = 'msg assistant';
  bubble.textContent = '…';
  log.appendChild(bubble);
  bubble.scrollIntoView({ block: 'end' });
  try {
    const reply = await sendChat({
      apiKey: s.settings.apiKey,
      model: s.settings.model,
      history: s.chat.slice(-20),
      context: chatContext(),
      onText: (txt) => { bubble.textContent = txt; },
    });
    store.update((st) => st.chat.push({ role: 'assistant', content: reply }));
  } catch (err) {
    store.update((st) => st.chat.pop());
    toast(`Coach chat failed: ${err.message || err}`, 6000);
  }
  if (tab === 'chat') render();
}

function onStep() {
  store.update(() => { store.day().steps += 1; });
  const d = store.day();
  const t = T();
  if (t && d.steps === t.steps) toast(`🎉 ${fmt(t.steps)} steps! Daily step goal smashed.`);
  if (tab === 'home' && d.steps % 10 === 0) render();
}

// Hydration nudges while the app is open.
setInterval(() => {
  const s = S();
  const every = s.settings.waterReminderMin;
  const h = new Date().getHours();
  if (!every || !s.profile || h < 8 || h >= 22 || document.getElementById('session').classList.contains('open')) return;
  const last = Math.max(s.lastWaterAt || 0, s.lastNudgeAt || 0);
  if (Date.now() - last > every * 60000 && store.day().water < waterGoal()) {
    s.lastNudgeAt = Date.now();
    store.save();
    toast(`${s.profile.name}, water break! 💧 ${fmt(store.day().water)} of ${fmt(waterGoal())} ml so far.`, 6000);
  }
}, 60000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

makeCoach();
render();
// Warm up the pose model in the background so the first workout starts fast.
if (S().profile) setTimeout(() => loadPoseModel().catch(() => {}), 1500);
