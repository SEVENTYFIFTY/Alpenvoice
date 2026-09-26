// Local-only persistence. Nothing leaves the phone (except optional AI chat).

const KEY = 'alpencoach:v1';

const DEFAULT = {
  profile: null, // {name, sex, age, height, weight, waist, activity, goal, level, diet, lang}
  settings: { voice: true, apiKey: '', model: 'claude-opus-5', waterReminderMin: 90 },
  days: {}, // 'YYYY-MM-DD' -> {water, steps, checkin, meals:{}}
  workouts: [], // {at, parts, minutes, reps, kcal, formScore, blocks:[...]}
  posture: [], // {at, score, results}
  chat: [], // [{role, content}]
};

let state;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? { ...structuredClone(DEFAULT), ...JSON.parse(raw) } : structuredClone(DEFAULT);
    state.settings = { ...DEFAULT.settings, ...state.settings };
  } catch {
    state = structuredClone(DEFAULT);
  }
}

export function get() {
  if (!state) load();
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked - keep working in memory */
  }
}

export function todayKey(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function day(key = todayKey()) {
  const s = get();
  s.days[key] = s.days[key] || { water: 0, steps: 0, checkin: null, meals: {} };
  return s.days[key];
}

export function update(fn) {
  fn(get());
  save();
}

// Consecutive days (ending today or yesterday) with a workout.
export function streak() {
  const s = get();
  const done = new Set(s.workouts.map((w) => todayKey(new Date(w.at))));
  let n = 0;
  const d = new Date();
  if (!done.has(todayKey(d))) d.setDate(d.getDate() - 1);
  while (done.has(todayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function exportJson() {
  return JSON.stringify(get(), null, 2);
}

export function reset() {
  state = structuredClone(DEFAULT);
  save();
}
