// Life schedule -> free training windows -> a realistic weekly training plan.
// Works on a 5-minute grid per day. Each slot is one of:
//   FREE   - you're on your own (solo camera workout possible)
//   FAMILY - kids are with you (family workout / walk, or needs cover)
//   BUSY   - work, commute, school run, dinner, commitments, sleep

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const CARE_TYPES = {
  none: 'At home with me',
  daycare: 'Daycare / Kita',
  kindergarten: 'Kindergarten',
  school: 'School',
};

const SLOT = 5;
const N = 1440 / SLOT;
const FREE = 0, FAMILY = 1, BUSY = 2;

export const toMin = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
};
export const toTime = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Mon=0 .. Sun=6
export const dayIndex = (d = new Date()) => (d.getDay() + 6) % 7;

export function defaultLife() {
  const weekday = { start: '08:30', end: '17:30' };
  return {
    wake: '06:30',
    sleep: '22:30',
    dinner: '18:30',
    work: {
      type: 'office', // office | home | hybrid | shift | none
      commute: 30,
      lunch: 45,
      days: [weekday, weekday, weekday, weekday, weekday, null, null].map((d) => (d ? { ...d } : null)),
      homeDays: [false, false, false, false, false, false, false],
    },
    kids: [],
    partnerHelps: false,
    commitments: [],
    prefer: 'any', // morning | lunch | evening | any
    sessionsPerWeek: 3,
    maxMinutes: 30,
  };
}

export function newKid(age = 6) {
  const care = age < 1 ? 'none' : age < 4 ? 'daycare' : age < 6 ? 'kindergarten' : 'school';
  return {
    age,
    care,
    days: [true, true, true, true, true, false, false],
    start: '08:00',
    end: age < 4 ? '17:00' : age < 6 ? '12:00' : '15:30',
    bedtime: age < 4 ? '19:00' : age < 10 ? '20:00' : '21:00',
    dropoff: true,
    pickup: true,
  };
}

function paint(grid, from, to, state, reason, reasons) {
  if (from == null || to == null) return;
  const a = Math.max(0, Math.floor(from / SLOT));
  const b = Math.min(N, Math.ceil(to / SLOT));
  for (let i = a; i < b; i++) {
    if (state >= grid[i]) {
      grid[i] = state;
      if (reasons) reasons[i] = reason;
    }
  }
}

// Returns the day's grid plus labelled busy blocks for the timeline.
export function dayGrid(life, d) {
  const grid = new Array(N).fill(FREE);
  const reasons = new Array(N).fill('');
  const wake = toMin(life.wake);
  const sleep = toMin(life.sleep);
  const tags = { kidsAway: new Array(N).fill(false), kidsAsleep: new Array(N).fill(false), nap: new Array(N).fill(false) };

  // Night + morning routine + wind-down.
  paint(grid, 0, wake, BUSY, 'Sleep', reasons);
  paint(grid, wake, wake + 30, BUSY, 'Wake up & get ready', reasons);
  paint(grid, sleep - 30, sleep, BUSY, 'Wind down', reasons);
  paint(grid, sleep, 1440, BUSY, 'Sleep', reasons);

  // Kids: with you unless at school/daycare, asleep, or old enough.
  const youngKids = life.kids.filter((k) => k.age < 12);
  for (const k of youngKids) {
    const bed = toMin(k.bedtime);
    const away = k.care !== 'none' && k.days[d];
    const s = toMin(k.start), e = toMin(k.end);
    for (let i = Math.floor(wake / SLOT); i < N; i++) {
      const m = i * SLOT;
      const isAway = away && m >= s && m < e;
      const asleep = m >= bed;
      const napping = k.age < 4 && !isAway && m >= 13 * 60 && m < 14 * 60 + 30;
      if (isAway) tags.kidsAway[i] = true;
      if (asleep) tags.kidsAsleep[i] = true;
      if (napping) tags.nap[i] = true;
      if (!isAway && !asleep && !napping) paint(grid, m, m + SLOT, FAMILY, 'Kids with you', reasons);
    }
    if (away && k.age < 10) paint(grid, wake, s - 20, BUSY, 'Getting kids ready', reasons);
    if (away && k.dropoff) paint(grid, s - 20, s + 10, BUSY, 'School / daycare run', reasons);
    if (away && k.pickup) paint(grid, e - 15, e + 15, BUSY, 'Pick-up', reasons);
  }

  // Night shift from the previous day: finish it, then sleep ~7 h.
  const prev = life.work.type !== 'none' ? life.work.days[(d + 6) % 7] : null;
  if (prev && prev.start && prev.end && toMin(prev.end) <= toMin(prev.start)) {
    paint(grid, 0, toMin(prev.end) + (Number(life.work.commute) || 0) + 7 * 60, BUSY, 'Night shift + sleep', reasons);
  }

  // Work (plus commute unless working from home that day).
  const w = life.work.type !== 'none' ? life.work.days[d] : null;
  let lunch = null;
  if (w && w.start && w.end) {
    const home = life.work.type === 'home' || (life.work.type === 'hybrid' && life.work.homeDays[d]);
    const commute = home ? 0 : Number(life.work.commute) || 0;
    const ws = toMin(w.start), we = toMin(w.end);
    const end = we > ws ? we : we + 1440; // night shift crossing midnight
    paint(grid, ws - commute, Math.min(end + commute, 1440), BUSY, commute ? 'Work + commute' : 'Work', reasons);
    const lunchLen = Number(life.work.lunch) || 0;
    if (lunchLen >= 20 && ws <= 11 * 60 && end >= 14 * 60) {
      const ls = 12 * 60;
      lunch = { start: ls, end: ls + lunchLen, home };
    }
  }

  // Dinner (family meal) and fixed commitments.
  const dn = toMin(life.dinner);
  if (dn != null) paint(grid, dn, dn + 40, BUSY, 'Dinner', reasons);
  for (const c of life.commitments) {
    if (c.days[d]) paint(grid, toMin(c.start), toMin(c.end), BUSY, c.label || 'Commitment', reasons);
  }

  return { grid, reasons, tags, lunch, wake, sleep };
}

// Runs of equal state for drawing the day's timeline.
export function timeline(life, d) {
  const { grid, reasons } = dayGrid(life, d);
  const runs = [];
  for (let i = 0; i < N; i++) {
    const kind = grid[i] === BUSY ? 'busy' : grid[i] === FAMILY ? 'family' : 'free';
    const last = runs[runs.length - 1];
    if (last && last.kind === kind && last.reason === reasons[i]) last.end = (i + 1) * SLOT;
    else runs.push({ start: i * SLOT, end: (i + 1) * SLOT, kind, reason: reasons[i] });
  }
  return runs;
}

function labelFor(tags, i0, i1, grid, wake) {
  const any = (arr) => arr.slice(i0, i1).some(Boolean);
  if (grid[i0] === FAMILY) return 'Kids with you';
  if (any(tags.nap)) return 'Nap time';
  if (any(tags.kidsAsleep)) return 'Kids in bed';
  if (any(tags.kidsAway)) return 'Kids at school / daycare';
  if (i0 * SLOT < 10 * 60 && i0 * SLOT <= wake + 120) return 'Early morning';
  return 'Free time';
}

// Contiguous non-busy runs of at least minLen minutes.
export function freeWindows(life, d, minLen = 10) {
  const { grid, tags, lunch, wake } = dayGrid(life, d);
  const out = [];
  let i = 0;
  while (i < N) {
    if (grid[i] === BUSY) { i++; continue; }
    let j = i;
    while (j < N && grid[j] === grid[i]) j++;
    const len = (j - i) * SLOT;
    if (len >= minLen) {
      const family = grid[i] === FAMILY;
      out.push({
        start: i * SLOT,
        end: j * SLOT,
        minutes: len,
        mode: family ? (life.partnerHelps ? 'cover' : 'family') : 'solo',
        label: labelFor(tags, i, j, grid, wake),
      });
    }
    i = j;
  }
  if (lunch) {
    out.push({
      start: lunch.start,
      end: lunch.end,
      minutes: lunch.end - lunch.start,
      mode: lunch.home ? 'solo' : 'walk',
      label: lunch.home ? 'Lunch break (home)' : 'Lunch break',
      lunch: true,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

// Body-part rotation depending on how many sessions fit in the week.
function splits(n) {
  if (n <= 3) return [['legs', 'chest', 'core'], ['back', 'glutes', 'shoulders'], ['legs', 'arms', 'cardio']];
  return [['chest', 'shoulders', 'arms'], ['legs', 'glutes'], ['back', 'core'], ['cardio', 'legs', 'core'], ['chest', 'back'], ['glutes', 'core']];
}

function scoreWindow(w, life) {
  if (w.mode === 'walk') return -1;
  const usable = w.lunch ? w.minutes - 15 : w.minutes - 5;
  if (usable < 15) return -1;
  const maxM = Number(life.maxMinutes) || 30;
  let s = Math.min(usable, maxM) / maxM;
  const h = w.start / 60;
  const slot = h < 11 ? 'morning' : h < 14 ? 'lunch' : h >= 16 ? 'evening' : 'afternoon';
  if (life.prefer !== 'any' && slot === life.prefer) s += 0.5;
  if (w.mode === 'family') s -= 0.35;
  if (w.mode === 'cover') s -= 0.15;
  if (w.start + usable > toMin(life.sleep) - 90) s -= 0.25; // late training can hurt sleep
  return s;
}

export function weekPlan(life) {
  const days = DAYS.map((name, d) => {
    const windows = freeWindows(life, d);
    const ranked = windows.map((w) => ({ w, s: scoreWindow(w, life) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    return { d, name, windows, best: ranked[0] || null, session: null, walks: [] };
  });

  // Spread sessions across the week: pick best scores, penalise neighbours.
  const want = Math.max(1, Math.min(7, Number(life.sessionsPerWeek) || 3));
  const picked = new Set();
  for (let k = 0; k < want; k++) {
    let best = null;
    for (const day of days) {
      if (!day.best || picked.has(day.d)) continue;
      const nb = [(day.d + 6) % 7, (day.d + 1) % 7].filter((x) => picked.has(x)).length;
      const s = day.best.s - 0.4 * nb;
      if (!best || s > best.s) best = { day, s };
    }
    if (!best) break;
    picked.add(best.day.d);
  }

  const order = [...picked].sort((a, b) => a - b);
  const rot = splits(order.length);
  const maxM = Number(life.maxMinutes) || 30;
  order.forEach((d, idx) => {
    const day = days[d];
    const w = day.best.w;
    const usable = (w.lunch ? w.minutes - 15 : w.minutes - 5);
    const minutes = Math.max(15, Math.floor(Math.min(usable, maxM) / 5) * 5);
    day.session = {
      start: w.start,
      end: w.start + minutes,
      minutes,
      mode: w.mode,
      label: w.label,
      parts: w.mode === 'family' ? ['legs', 'cardio', 'core'] : rot[idx % rot.length],
    };
  });

  // Walks for steps in leftover windows (family walks are great too).
  for (const day of days) {
    const s = day.session;
    for (const w of day.windows) {
      if (day.walks.length >= 2) break;
      if (s && w.start < s.end && w.end > s.start) continue;
      if (w.minutes >= 15 || w.mode === 'walk') {
        const minutes = Math.min(w.mode === 'walk' ? w.minutes - 15 : w.minutes, 30);
        // In long windows (weekends), walk mid-morning rather than at dawn.
        const start = w.minutes > 120 && w.start < 10 * 60 ? 10 * 60 : w.start;
        if (s && start < s.end && start + minutes > s.start) continue;
        if (minutes >= 10) day.walks.push({ start, minutes, withKids: w.mode === 'family', label: w.label });
      }
    }
  }

  const sessions = days.filter((d) => d.session);
  const note = sessions.length < want
    ? `Only ${sessions.length} of ${want} sessions fit your week. Add 10-minute micro-sessions or ask someone to cover the kids for 30 minutes.`
    : null;
  return { days, sessions, note };
}

// Plain-text summary for the AI coach.
export function describeLife(life) {
  const w = life.work;
  const workDays = w.days.map((x, i) => (x && w.type !== 'none' ? `${DAYS[i]} ${x.start}-${x.end}` : null)).filter(Boolean).join(', ');
  const kids = life.kids.map((k) => `${k.age}y (${CARE_TYPES[k.care]}${k.care !== 'none' ? ` ${k.start}-${k.end} on ${k.days.map((x, i) => (x ? DAYS[i] : null)).filter(Boolean).join('/')}` : ''}, bed ${k.bedtime}${k.dropoff ? ', I drop off' : ''}${k.pickup ? ', I pick up' : ''})`).join('; ');
  return [
    `Wake ${life.wake}, sleep ${life.sleep}, dinner ${life.dinner}.`,
    `Work: ${w.type}${workDays ? ` - ${workDays}, commute ${w.commute} min, lunch ${w.lunch} min` : ''}.`,
    kids ? `Kids: ${kids}. ${life.partnerHelps ? 'Partner/someone can watch the kids for short periods.' : 'No regular help with the kids.'}` : 'No young kids.',
    life.commitments.length ? `Commitments: ${life.commitments.map((c) => `${c.label} ${c.start}-${c.end} (${c.days.map((x, i) => (x ? DAYS[i] : null)).filter(Boolean).join('/')})`).join('; ')}.` : '',
    `Wants ${life.sessionsPerWeek} sessions/week, max ${life.maxMinutes} min, prefers ${life.prefer}.`,
  ].filter(Boolean).join('\n');
}

// Calendar file (.ics) for the next 7 days so the phone reminds you even
// when the app is closed.
export function toICS(plan, from = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = (date, min) => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AlpenCoach//Training plan//EN', 'CALSCALE:GREGORIAN'];
  for (let i = 0; i < 7; i++) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const day = plan.days[dayIndex(date)];
    if (!day.session) continue;
    const s = day.session;
    lines.push(
      'BEGIN:VEVENT',
      `UID:alpencoach-${stamp(date, s.start)}@alpencoach`,
      `DTSTAMP:${stamp(from, from.getHours() * 60 + from.getMinutes())}`,
      `DTSTART:${stamp(date, s.start)}`,
      `DTEND:${stamp(date, s.end)}`,
      `SUMMARY:💪 AlpenCoach: ${s.minutes} min ${s.parts.join(' + ')}${s.mode === 'family' ? ' (family workout)' : ''}`,
      `DESCRIPTION:${s.label}. Open AlpenCoach and tap Start. One more, you can do it!`,
      'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', 'DESCRIPTION:Training in 10 minutes', 'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
