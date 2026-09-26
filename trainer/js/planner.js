// Builds a workout from the chosen body parts, level, goal and time budget,
// and recommends what to train next based on recent history.

import { EXERCISES, BODY_PARTS, byId } from './exercises.js';

const LEVELS = {
  beginner: { sets: 2, reps: 8, hold: 20, rest: 60 },
  intermediate: { sets: 3, reps: 12, hold: 40, rest: 45 },
  advanced: { sets: 4, reps: 15, hold: 60, rest: 40 },
};

const GOAL_TWEAK = {
  lose: { reps: 1.25, rest: 0.7 },
  maintain: { reps: 1, rest: 1 },
  gain: { reps: 0.8, rest: 1.5 },
};

// Approximate seconds for one block (all sets + rests).
export function blockSeconds(b) {
  const work = b.type === 'hold' ? b.target : b.target * (byId[b.id]?.fast ? 1 : 3);
  return b.sets * work + (b.sets - 1) * b.rest + 20;
}

export function buildWorkout({ parts, level = 'beginner', goal = 'maintain', minutes = 20, energy = 'ok', seed = Date.now() }) {
  const L = LEVELS[level] || LEVELS.beginner;
  const G = GOAL_TWEAK[goal] || GOAL_TWEAK.maintain;
  const lowEnergy = energy === 'low';
  const chosen = parts.length ? parts : ['legs', 'chest', 'core'];

  // Shuffle deterministically so repeat workouts vary.
  let s = seed % 2147483647 || 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);

  const pools = chosen.map((p) =>
    EXERCISES.filter((e) => e.parts.includes(p)).sort(() => rnd() - 0.5),
  );

  const make = (ex) => {
    const sets = Math.max(1, L.sets - (lowEnergy ? 1 : 0));
    const target = ex.type === 'hold'
      ? Math.round(L.hold * (lowEnergy ? 0.75 : 1))
      : Math.max(5, Math.round(L.reps * G.reps * (ex.fast ? 2 : 1) * (lowEnergy ? 0.8 : 1)));
    return { id: ex.id, name: ex.name, type: ex.type || 'reps', sets, target, rest: Math.round(L.rest * G.rest) };
  };

  const warmup = { id: 'jumping_jack', name: 'Warm-up: Jumping Jacks', type: 'reps', sets: 1, target: 20, rest: 20, warmup: true };
  const blocks = [warmup];
  const used = new Set(['jumping_jack']);
  let budget = minutes * 60 - blockSeconds(warmup);
  let i = 0;
  let guard = 0;
  while (budget > 60 && guard++ < 50) {
    const pool = pools[i % pools.length];
    i++;
    const ex = pool.find((e) => !used.has(e.id));
    if (!ex) {
      if (pools.every((p) => p.every((e) => used.has(e.id)))) break;
      continue;
    }
    const b = make(ex);
    const cost = blockSeconds(b);
    if (cost > budget && blocks.length > 2) break;
    used.add(ex.id);
    blocks.push(b);
    budget -= cost;
  }
  return { parts: chosen, level, goal, minutes, blocks };
}

// Recommend body parts not trained in the last 48h, favouring the least recent.
export function recommendParts(history, now = Date.now()) {
  const last = {};
  for (const w of history) {
    for (const p of w.parts || []) last[p] = Math.max(last[p] || 0, w.at);
  }
  const ranked = BODY_PARTS.map((b) => b.id)
    .filter((p) => p !== 'cardio')
    .sort((a, b) => (last[a] || 0) - (last[b] || 0));
  const fresh = ranked.filter((p) => !last[p] || now - last[p] > 48 * 3600 * 1000);
  const pickFrom = fresh.length >= 2 ? fresh : ranked;
  return pickFrom.slice(0, 2).concat(Math.random() < 0.5 ? ['cardio'] : []);
}
