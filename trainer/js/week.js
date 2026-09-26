// "Week" tab: life schedule form + weekly training plan built around it.

import { DAYS, CARE_TYPES, toTime, toMin, dayIndex, timeline, newKid } from './schedule.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const partLabel = (p) => ({ chest: 'Chest', back: 'Back', shoulders: 'Shoulders', arms: 'Arms', core: 'Core', legs: 'Legs', glutes: 'Glutes', cardio: 'Cardio' }[p] || p);

export const FAMILY_TIP = 'Family workout: kids join in. Squats and jumping jacks together, a kid on your hips for glute bridges, races for high knees. They copy you, and you get it done.';

const DAY_START = 5 * 60, DAY_END = 24 * 60;
const pct = (m) => ((Math.min(Math.max(m, DAY_START), DAY_END) - DAY_START) / (DAY_END - DAY_START)) * 100;

function bar(life, d, day) {
  const runs = timeline(life, d).filter((r) => r.end > DAY_START);
  const segs = runs.map((r) => {
    const color = r.kind === 'busy' ? 'var(--line)' : r.kind === 'family' ? '#3b82f655' : '#a3e63533';
    return `<div title="${esc(r.reason || (r.kind === 'family' ? 'Kids with you' : 'Free'))} ${toTime(r.start)}–${toTime(r.end)}" style="position:absolute;top:0;bottom:0;left:${pct(r.start)}%;width:${pct(r.end) - pct(r.start)}%;background:${color}"></div>`;
  }).join('');
  const s = day.session;
  const sess = s ? `<div style="position:absolute;top:-3px;bottom:-3px;left:${pct(s.start)}%;width:${Math.max(1.5, pct(s.end) - pct(s.start))}%;background:var(--accent);border-radius:3px"></div>` : '';
  const walks = day.walks.map((w) => `<div style="position:absolute;top:2px;bottom:2px;left:${pct(w.start)}%;width:${Math.max(1, pct(w.start + w.minutes) - pct(w.start))}%;background:var(--warn);border-radius:2px;opacity:.8"></div>`).join('');
  return `<div style="position:relative;height:14px;border-radius:7px;overflow:hidden;background:var(--surface-2);margin:6px 0 2px">${segs}${walks}${sess}</div>
    <div class="row between small muted" style="font-size:10px"><span>05</span><span>09</span><span>13</span><span>17</span><span>21</span><span>24</span></div>`;
}

export function weekPlanView(life, plan, { doneDays }) {
  const today = dayIndex();
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  return `
  <div class="card hero stack">
    <h3>Your training week</h3>
    <p>${plan.sessions.length} session${plan.sessions.length === 1 ? '' : 's'} planned around your job${life.kids.length ? ', kids' : ''} and commitments. ${plan.sessions.reduce((a, d) => a + d.session.minutes, 0)} min total.</p>
    ${plan.note ? `<p class="small" style="color:var(--warn)">${esc(plan.note)}</p>` : ''}
    <div class="row small muted wrap" style="gap:12px">
      <span><span style="display:inline-block;width:10px;height:10px;background:var(--accent);border-radius:2px"></span> Training</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:var(--warn);border-radius:2px"></span> Walk</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#a3e63533;border-radius:2px"></span> Free</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#3b82f655;border-radius:2px"></span> Kids with you</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:var(--line);border-radius:2px"></span> Busy</span>
    </div>
    <div class="row"><button class="btn" id="ics" style="flex:1">📅 Add to my calendar</button><button class="btn" id="edit-life">Edit schedule</button></div>
  </div>
  ${plan.days.map((day) => {
    const s = day.session;
    const isToday = day.d === today;
    const canStart = s && isToday && now >= s.start - 30 && now <= s.end + 90 && !doneDays.has(day.d);
    return `<div class="card" style="${isToday ? 'border-color:var(--accent)' : ''}">
      <div class="row between"><b>${DAYS[day.d]}${isToday ? ' · Today' : ''}</b>
        ${s ? `<span class="tag" style="color:var(--accent)">${toTime(s.start)} · ${s.minutes} min</span>` : '<span class="tag">Rest / active recovery</span>'}</div>
      ${bar(life, day.d, day)}
      ${s ? `<p style="margin-top:8px"><b>${s.parts.map(partLabel).join(' + ')}</b> <span class="small muted">· ${esc(s.label)}${s.mode === 'cover' ? ' · ask your partner to cover' : ''}</span></p>
        ${s.mode === 'family' ? `<p class="small muted">${FAMILY_TIP}</p>` : ''}
        ${isToday && doneDays.has(day.d) ? '<p class="small accent">✓ Done today, great job!</p>' : ''}
        ${canStart ? `<button class="btn primary" data-session="${day.d}" style="width:100%">Start now ▶</button>` : ''}` : ''}
      ${day.walks.length ? `<p class="small muted" style="margin-top:6px">🚶 ${day.walks.map((w) => `${toTime(w.start)} ${w.minutes} min walk${w.withKids ? ' with the kids' : ''}`).join(' · ')}</p>` : ''}
    </div>`;
  }).join('')}`;
}

const dayChecks = (path, arr) => `<div class="chips">${DAYS.map((n, i) => `<label class="chip ${arr[i] ? 'on' : ''}" style="padding:6px 10px"><input type="checkbox" data-path="${path}.${i}" ${arr[i] ? 'checked' : ''} hidden>${n}</label>`).join('')}</div>`;
const time = (path, v) => `<input type="time" data-path="${path}" value="${esc(v || '')}">`;
const num = (path, v, extra = '') => `<input type="number" inputmode="numeric" data-path="${path}" value="${esc(v ?? '')}" ${extra}>`;
const sel = (path, obj, cur) => `<select data-path="${path}">${Object.entries(obj).map(([k, v]) => `<option value="${k}" ${String(k) === String(cur) ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;

export function lifeFormView(life, first) {
  const w = life.work;
  return `
  <form class="stack" id="life-form">
    ${first ? `<div class="card hero"><div class="coach-say"><div class="avatar">🤖</div><div>
      <h2>Let's fit training into your real life</h2>
      <p>Tell me about your job, your kids and your fixed commitments. I'll find the free time in your day and plan sessions that fit.</p></div></div></div>` : '<h2>Your schedule</h2>'}

    <div class="card stack">
      <h3>🛌 Your day</h3>
      <div class="grid3">
        <label class="field"><span>Wake up</span>${time('wake', life.wake)}</label>
        <label class="field"><span>Dinner</span>${time('dinner', life.dinner)}</label>
        <label class="field"><span>Bedtime</span>${time('sleep', life.sleep)}</label>
      </div>
    </div>

    <div class="card stack">
      <h3>💼 Work</h3>
      <label class="field"><span>Type</span>${sel('work.type', { office: 'Office / on-site', home: 'Home office', hybrid: 'Hybrid', shift: 'Shifts / irregular', none: 'Not working' }, w.type)}</label>
      ${w.type === 'none' ? '' : `
      <div class="grid2">
        <label class="field"><span>Commute (min, one way)</span>${num('work.commute', w.commute, 'min="0" max="240"')}</label>
        <label class="field"><span>Lunch break (min)</span>${num('work.lunch', w.lunch, 'min="0" max="120"')}</label>
      </div>
      <p class="small muted">Working hours per day. Untick days off. For shifts, enter this week's shifts. Night shifts can end after midnight.</p>
      ${DAYS.map((n, i) => {
        const d = w.days[i];
        return `<div class="row" style="gap:8px">
          <label class="chip ${d ? 'on' : ''}" style="width:64px;text-align:center;padding:8px 0"><input type="checkbox" data-workday="${i}" ${d ? 'checked' : ''} hidden>${n}</label>
          ${d ? `${time(`work.days.${i}.start`, d.start)}<span class="muted">–</span>${time(`work.days.${i}.end`, d.end)}
            ${w.type === 'hybrid' ? `<label class="small" style="white-space:nowrap"><input type="checkbox" data-path="work.homeDays.${i}" ${w.homeDays[i] ? 'checked' : ''} style="width:18px;min-height:0"> 🏠</label>` : ''}` : '<span class="muted small">Day off</span>'}
        </div>`;
      }).join('')}
      <button type="button" class="btn ghost small" id="copy-mon">Copy Monday to Tue–Fri</button>`}
    </div>

    <div class="card stack">
      <h3>👨‍👩‍👧 Kids</h3>
      ${life.kids.length ? '' : '<p class="small muted">No kids added. If you have children, add them so I plan around school runs, naps and bedtimes.</p>'}
      ${life.kids.map((k, i) => `<div class="bubble stack">
        <div class="row between"><b>Child ${i + 1}</b><button type="button" class="btn ghost small danger" data-delkid="${i}">Remove</button></div>
        <div class="grid2">
          <label class="field"><span>Age</span>${num(`kids.${i}.age`, k.age, 'min="0" max="18"')}</label>
          <label class="field"><span>Bedtime</span>${time(`kids.${i}.bedtime`, k.bedtime)}</label>
        </div>
        <label class="field"><span>During the day</span>${sel(`kids.${i}.care`, CARE_TYPES, k.care)}</label>
        ${k.care === 'none' ? '' : `
          <div class="grid2">
            <label class="field"><span>Starts</span>${time(`kids.${i}.start`, k.start)}</label>
            <label class="field"><span>Ends / pick-up</span>${time(`kids.${i}.end`, k.end)}</label>
          </div>
          ${dayChecks(`kids.${i}.days`, k.days)}
          <div class="row wrap">
            <label class="row small"><input type="checkbox" data-path="kids.${i}.dropoff" ${k.dropoff ? 'checked' : ''} style="width:20px;min-height:0"> I do drop-off</label>
            <label class="row small"><input type="checkbox" data-path="kids.${i}.pickup" ${k.pickup ? 'checked' : ''} style="width:20px;min-height:0"> I do pick-up</label>
          </div>`}
        ${k.age >= 12 ? '<p class="small muted">12+ can stay home alone, so they won\'t block your training time.</p>' : ''}
      </div>`).join('')}
      <button type="button" class="btn" id="add-kid">+ Add child</button>
      ${life.kids.length ? `<label class="row small"><input type="checkbox" data-path="partnerHelps" ${life.partnerHelps ? 'checked' : ''} style="width:20px;min-height:0"> A partner or family member can watch the kids for 30–45 min</label>` : ''}
    </div>

    <div class="card stack">
      <h3>📌 Other fixed commitments</h3>
      <p class="small muted">Kids' football, language class, caring for parents…</p>
      ${life.commitments.map((c, i) => `<div class="bubble stack">
        <div class="row"><input data-path="commitments.${i}.label" value="${esc(c.label)}" placeholder="What" style="flex:1"><button type="button" class="btn ghost small danger" data-delcom="${i}">✕</button></div>
        <div class="grid2"><label class="field"><span>From</span>${time(`commitments.${i}.start`, c.start)}</label><label class="field"><span>To</span>${time(`commitments.${i}.end`, c.end)}</label></div>
        ${dayChecks(`commitments.${i}.days`, c.days)}
      </div>`).join('')}
      <button type="button" class="btn" id="add-com">+ Add commitment</button>
    </div>

    <div class="card stack">
      <h3>🎯 Training preferences</h3>
      <div class="grid2">
        <label class="field"><span>Sessions per week</span>${sel('sessionsPerWeek', { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' }, life.sessionsPerWeek)}</label>
        <label class="field"><span>Max length</span>${sel('maxMinutes', { 15: '15 min', 20: '20 min', 30: '30 min', 45: '45 min', 60: '60 min' }, life.maxMinutes)}</label>
      </div>
      <label class="field"><span>Best time for me</span>${sel('prefer', { any: 'Whenever it fits', morning: 'Morning', lunch: 'Lunch', evening: 'Evening' }, life.prefer)}</label>
    </div>

    <button class="btn primary big">${first ? 'Build my week' : 'Save & re-plan'}</button>
  </form>`;
}

// Apply an input change to the draft using its data-path.
export function applyInput(draft, el) {
  if (el.dataset.workday != null) {
    const i = Number(el.dataset.workday);
    const mon = draft.work.days.find(Boolean) || { start: '08:30', end: '17:30' };
    draft.work.days[i] = el.checked ? { ...mon } : null;
    return true; // structure changed
  }
  const path = el.dataset.path;
  if (!path) return false;
  const keys = path.split('.');
  let obj = draft;
  for (const k of keys.slice(0, -1)) obj = obj[k];
  const last = keys[keys.length - 1];
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'number' || ['sessionsPerWeek', 'maxMinutes'].includes(last)) v = el.value === '' ? '' : Number(el.value);
  else v = el.value;
  obj[last] = v;
  // Re-render when a choice changes which fields are shown.
  return ['type', 'care', 'age'].includes(last) || el.type === 'checkbox';
}

export function copyMonday(draft) {
  const mon = draft.work.days[0];
  if (!mon) return;
  for (let i = 1; i < 5; i++) draft.work.days[i] = { ...mon };
}

export function addKid(draft) {
  draft.kids.push(newKid(6));
}

export function addCommitment(draft) {
  draft.commitments.push({ label: '', start: '18:00', end: '19:00', days: [false, false, true, false, false, false, false] });
}

export function validLife(life) {
  if (toMin(life.sleep) <= toMin(life.wake)) return 'Bedtime must be after wake-up time.';
  for (const k of life.kids) if (k.age === '' || k.age < 0) return 'Please enter each child\'s age.';
  return null;
}
