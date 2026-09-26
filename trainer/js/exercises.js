// Exercise library. Each rep-based exercise exposes a single tracked metric
// (usually a joint angle) plus a [start, peak] range; the RepCounter turns the
// metric stream into reps. Form checks return fault ids that the coach turns
// into spoken cues and the overlay paints red.

import { SIDES, angle, fromVertical, tilt, offsetFromLine, dist, mid, visible, bestSide } from './geometry.js';

export const BODY_PARTS = [
  { id: 'chest', label: 'Chest', icon: '🫁' },
  { id: 'back', label: 'Back', icon: '🔙' },
  { id: 'shoulders', label: 'Shoulders', icon: '🤷' },
  { id: 'arms', label: 'Arms', icon: '💪' },
  { id: 'core', label: 'Core / Abs', icon: '🧱' },
  { id: 'legs', label: 'Legs', icon: '🦵' },
  { id: 'glutes', label: 'Glutes', icon: '🍑' },
  { id: 'cardio', label: 'Cardio / Fat burn', icon: '🔥' },
];

const pts = (lm, side) => {
  const s = SIDES[side];
  const o = {};
  for (const k of Object.keys(s)) o[k] = lm[s[k]];
  return o;
};
const ids = (side, keys) => keys.map((k) => SIDES[side][k]);

// Hip below/above the shoulder-ankle line, normalised by body length.
function hipLineOffset(P) {
  const len = dist(P.shoulder, P.ankle) || 1;
  return offsetFromLine(P.shoulder, P.ankle, P.hip) / len;
}

const bodyStraight = {
  id: 'hips_sag',
  joints: ['hip'],
  test: (P) => hipLineOffset(P) > 0.06,
};
const bodyPike = {
  id: 'hips_pike',
  joints: ['hip'],
  test: (P) => hipLineOffset(P) < -0.08,
};

export const EXERCISES = [
  {
    id: 'squat',
    name: 'Bodyweight Squat',
    parts: ['legs', 'glutes'],
    view: 'side',
    met: 5.0,
    setup: 'Stand side-on to the camera, feet shoulder-width apart. Sit back like into a chair.',
    keys: ['shoulder', 'hip', 'knee', 'ankle'],
    metric: (P) => angle(P.hip, P.knee, P.ankle),
    range: [160, 95],
    faults: [
      { id: 'chest_up', joints: ['shoulder', 'hip'], when: 'moving', test: (P) => fromVertical(P.hip, P.shoulder) > 50 },
    ],
  },
  {
    id: 'lunge',
    name: 'Reverse Lunge',
    parts: ['legs', 'glutes'],
    view: 'side',
    met: 4.0,
    setup: 'Side-on to the camera. Step one leg back and lower until both knees are near 90°. Alternate legs.',
    keys: ['shoulder', 'hip', 'knee', 'ankle'],
    bilateral: true,
    metric: (P, lm) => Math.min(angle(lm[23], lm[25], lm[27]), angle(lm[24], lm[26], lm[28])),
    range: [160, 100],
    faults: [
      { id: 'torso_upright', joints: ['shoulder', 'hip'], when: 'moving', test: (P) => fromVertical(P.hip, P.shoulder) > 25 },
    ],
  },
  {
    id: 'wall_sit',
    name: 'Wall Sit',
    parts: ['legs'],
    view: 'side',
    met: 4.0,
    type: 'hold',
    setup: 'Back against a wall, side-on to the camera. Slide down until thighs are parallel to the floor.',
    keys: ['shoulder', 'hip', 'knee', 'ankle'],
    hold: (P) => {
      const k = angle(P.hip, P.knee, P.ankle);
      return k > 70 && k < 125;
    },
    faults: [
      { id: 'go_lower', joints: ['knee'], when: 'always', test: (P) => angle(P.hip, P.knee, P.ankle) > 110 },
    ],
  },
  {
    id: 'glute_bridge',
    name: 'Glute Bridge',
    parts: ['glutes', 'core'],
    view: 'side',
    met: 3.5,
    setup: 'Lie on your back side-on to the camera, knees bent, feet flat. Drive hips up and squeeze.',
    keys: ['shoulder', 'hip', 'knee'],
    metric: (P) => angle(P.shoulder, P.hip, P.knee),
    range: [140, 165],
    faults: [],
  },
  {
    id: 'good_morning',
    name: 'Good Morning (hip hinge)',
    parts: ['back', 'glutes'],
    view: 'side',
    met: 3.5,
    setup: 'Side-on, hands behind head. Push hips back with a flat back and soft knees, then stand tall.',
    keys: ['shoulder', 'hip', 'knee', 'ankle'],
    metric: (P) => angle(P.shoulder, P.hip, P.knee),
    range: [160, 110],
    faults: [
      { id: 'soft_knee', joints: ['knee'], when: 'moving', test: (P) => angle(P.hip, P.knee, P.ankle) < 140 },
    ],
  },
  {
    id: 'bent_row',
    name: 'Bent-over Row (backpack / dumbbell)',
    parts: ['back', 'arms'],
    view: 'side',
    met: 4.0,
    setup: 'Side-on, hinge forward ~45° with a flat back, pull the weight to your belly button.',
    keys: ['shoulder', 'elbow', 'wrist', 'hip'],
    metric: (P) => angle(P.shoulder, P.elbow, P.wrist),
    range: [150, 90],
    faults: [
      { id: 'hinge_more', joints: ['shoulder', 'hip'], when: 'always', test: (P) => fromVertical(P.hip, P.shoulder) < 30 },
    ],
  },
  {
    id: 'pushup',
    name: 'Push-up',
    parts: ['chest', 'arms', 'core'],
    view: 'side',
    met: 8.0,
    setup: 'Phone on the floor, side-on. Hands under shoulders, body in one straight line.',
    keys: ['shoulder', 'elbow', 'wrist', 'hip', 'ankle'],
    metric: (P) => angle(P.shoulder, P.elbow, P.wrist),
    range: [155, 95],
    faults: [
      { ...bodyStraight, when: 'always' },
      { ...bodyPike, when: 'always' },
    ],
  },
  {
    id: 'incline_pushup',
    name: 'Incline Push-up (hands on bench/sofa)',
    parts: ['chest', 'arms'],
    view: 'side',
    met: 5.0,
    setup: 'Hands on a bench or sofa edge, side-on to the camera, body straight.',
    keys: ['shoulder', 'elbow', 'wrist', 'hip', 'ankle'],
    metric: (P) => angle(P.shoulder, P.elbow, P.wrist),
    range: [155, 100],
    faults: [
      { ...bodyStraight, when: 'always' },
      { ...bodyPike, when: 'always' },
    ],
  },
  {
    id: 'pike_pushup',
    name: 'Pike Push-up',
    parts: ['shoulders', 'arms'],
    view: 'side',
    met: 6.0,
    setup: 'Side-on, hips high in an upside-down V. Lower your head towards the floor between your hands.',
    keys: ['shoulder', 'elbow', 'wrist', 'hip'],
    metric: (P) => angle(P.shoulder, P.elbow, P.wrist),
    range: [150, 100],
    faults: [
      { id: 'hips_high', joints: ['hip'], when: 'always', test: (P) => angle(P.shoulder, P.hip, P.ankle) > 130 },
    ],
  },
  {
    id: 'shoulder_press',
    name: 'Shoulder Press (bottles / dumbbells)',
    parts: ['shoulders', 'arms'],
    view: 'front',
    met: 4.0,
    setup: 'Face the camera, weights at shoulder height, press straight overhead.',
    keys: ['shoulder', 'elbow', 'wrist'],
    metric: (P) => angle(P.shoulder, P.elbow, P.wrist),
    range: [95, 155],
    faults: [
      { id: 'wrists_over_elbows', joints: ['wrist', 'elbow'], when: 'always', test: (P) => fromVertical(P.elbow, P.wrist) > 35 && P.wrist.y < P.shoulder.y },
    ],
  },
  {
    id: 'lateral_raise',
    name: 'Lateral Raise',
    parts: ['shoulders'],
    view: 'front',
    met: 3.5,
    setup: 'Face the camera, arms at your sides, raise them out to shoulder height.',
    keys: ['shoulder', 'elbow', 'hip'],
    metric: (P) => angle(P.hip, P.shoulder, P.elbow),
    range: [25, 80],
    faults: [
      { id: 'too_high', joints: ['elbow', 'shoulder'], when: 'moving', test: (P) => angle(P.hip, P.shoulder, P.elbow) > 115 },
      { id: 'straight_arms', joints: ['elbow'], when: 'moving', test: (P) => angle(P.shoulder, P.elbow, P.wrist) < 130 },
    ],
  },
  {
    id: 'bicep_curl',
    name: 'Biceps Curl',
    parts: ['arms'],
    view: 'side',
    met: 3.5,
    setup: 'Side-on to the camera, elbows tucked, curl the weight up and lower slowly.',
    keys: ['shoulder', 'elbow', 'wrist', 'hip'],
    metric: (P) => angle(P.shoulder, P.elbow, P.wrist),
    range: [150, 55],
    faults: [
      { id: 'elbows_pinned', joints: ['elbow', 'shoulder'], when: 'moving', test: (P) => angle(P.hip, P.shoulder, P.elbow) > 35 },
    ],
  },
  {
    id: 'chair_dip',
    name: 'Chair Dip',
    parts: ['arms', 'chest'],
    view: 'side',
    met: 4.0,
    setup: 'Hands on a stable chair behind you, side-on to the camera. Lower until elbows reach ~90°.',
    keys: ['shoulder', 'elbow', 'wrist'],
    metric: (P) => angle(P.shoulder, P.elbow, P.wrist),
    range: [155, 100],
    faults: [],
  },
  {
    id: 'situp',
    name: 'Sit-up',
    parts: ['core'],
    view: 'side',
    met: 3.8,
    setup: 'Lie on your back side-on to the camera, knees bent. Curl all the way up and lower with control.',
    keys: ['shoulder', 'hip', 'knee'],
    metric: (P) => angle(P.shoulder, P.hip, P.knee),
    range: [115, 70],
    faults: [],
  },
  {
    id: 'plank',
    name: 'Plank',
    parts: ['core', 'shoulders'],
    view: 'side',
    met: 3.3,
    type: 'hold',
    setup: 'Phone on the floor, side-on. Forearms down, body one straight line from head to heels.',
    keys: ['shoulder', 'hip', 'ankle', 'elbow'],
    hold: (P) => Math.abs(tilt(P.shoulder, P.ankle)) < 35 && angle(P.shoulder, P.hip, P.ankle) > 145,
    faults: [
      { ...bodyStraight, when: 'always' },
      { ...bodyPike, when: 'always' },
    ],
  },
  {
    id: 'side_plank',
    name: 'Side Plank',
    parts: ['core'],
    view: 'front',
    met: 3.0,
    type: 'hold',
    setup: 'Face the camera on one forearm, stack your feet, lift hips into a straight line.',
    keys: ['shoulder', 'hip', 'ankle'],
    hold: (P) => angle(P.shoulder, P.hip, P.ankle) > 150 && Math.abs(tilt(P.shoulder, P.ankle)) < 70,
    faults: [
      { id: 'hips_up', joints: ['hip'], when: 'always', test: (P) => angle(P.shoulder, P.hip, P.ankle) < 160 },
    ],
  },
  {
    id: 'mountain_climber',
    name: 'Mountain Climbers',
    parts: ['cardio', 'core'],
    view: 'side',
    met: 8.0,
    setup: 'Plank position side-on. Drive knees towards your chest, alternating fast.',
    keys: ['shoulder', 'hip', 'knee', 'ankle'],
    bilateral: true,
    metric: (P, lm) => Math.min(angle(lm[11], lm[23], lm[25]), angle(lm[12], lm[24], lm[26])),
    range: [150, 105],
    fast: true,
    faults: [
      { id: 'hips_pike', joints: ['hip'], when: 'always', test: (P) => P.hip.y < Math.min(P.shoulder.y, P.ankle.y) - dist(P.shoulder, P.hip) * 0.35 },
    ],
  },
  {
    id: 'high_knees',
    name: 'High Knees',
    parts: ['cardio', 'legs'],
    view: 'side',
    met: 8.0,
    setup: 'Side-on, run on the spot driving each knee to hip height.',
    keys: ['shoulder', 'hip', 'knee'],
    bilateral: true,
    metric: (P, lm) => Math.min(angle(lm[11], lm[23], lm[25]), angle(lm[12], lm[24], lm[26])),
    range: [150, 110],
    fast: true,
    faults: [],
  },
  {
    id: 'jumping_jack',
    name: 'Jumping Jacks',
    parts: ['cardio'],
    view: 'front',
    met: 8.0,
    setup: 'Face the camera, full body in view. Jump feet out while arms go overhead.',
    keys: ['shoulder', 'hip', 'wrist'],
    bilateral: true,
    metric: (P, lm) => (angle(lm[23], lm[11], lm[15]) + angle(lm[24], lm[12], lm[16])) / 2,
    range: [45, 140],
    fast: true,
    faults: [
      {
        id: 'feet_wide', joints: ['ankle'], when: 'peak',
        test: (P, lm) => dist(lm[27], lm[28]) < dist(lm[23], lm[24]) * 1.3,
      },
    ],
  },
];

export const byId = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export function exercisesFor(parts) {
  return EXERCISES.filter((e) => e.parts.some((p) => parts.includes(p)));
}

// Evaluate one frame: returns {ok, reason, side, value, inHold, faults, joints}.
export function evaluate(ex, lm) {
  const side = bestSide(lm, ex.keys);
  const needed = ids(side, ex.keys);
  if (!visible(lm, needed, 0.5)) {
    return { ok: false, reason: 'not_visible', side };
  }
  const P = pts(lm, side);
  const result = { ok: true, side, P, lm };
  if (ex.type === 'hold') {
    result.inHold = ex.hold(P, lm);
  } else {
    result.value = ex.metric(P, lm);
  }
  return result;
}

// Faults active for the given rep phase ('start' | 'moving' | 'peak' | 'hold').
export function checkFaults(ex, frame, phase) {
  const active = [];
  for (const f of ex.faults || []) {
    if (f.when === 'moving' && phase === 'start') continue;
    if (f.when === 'peak' && phase !== 'peak') continue;
    try {
      if (f.test(frame.P, frame.lm)) active.push(f);
    } catch {
      /* landmark missing - ignore this check */
    }
  }
  return active;
}

export { pts as sidePoints, mid };
