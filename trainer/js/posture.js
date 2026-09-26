// Posture scan: averages landmarks over a few seconds of standing still and
// flags common imbalances, each mapped to corrective exercises.
// Screening only - not a medical or physiotherapy diagnosis.

import { angle, tilt, dist, mid } from './geometry.js';

const CORRECTIVES = {
  shoulder: ['Side-lying external rotations', 'Single-arm farmer carry (weaker side)', 'Doorway chest stretch'],
  hip: ['Side plank (both sides)', 'Clamshells', 'Single-leg glute bridge'],
  head_tilt: ['Neck side stretch', 'Chin tucks'],
  shift: ['Side plank', 'Suitcase carry', 'Bird dog'],
  valgus: ['Banded squats (knees out)', 'Clamshells', 'Lateral band walks'],
  forward_head: ['Chin tucks 3×10 daily', 'Wall angels', 'Thoracic extension over a towel'],
  slouch: ['Wall angels', 'Band pull-aparts', 'Prone Y-T-W raises', 'Doorway chest stretch'],
  sway: ['Hip flexor stretch (kneeling lunge)', 'Dead bugs', 'Glute bridges'],
};

function average(samples) {
  const n = samples.length;
  return samples[0].map((_, i) => {
    let x = 0, y = 0, v = 0;
    for (const s of samples) {
      x += s[i].x;
      y += s[i].y;
      v += s[i].visibility;
    }
    return { x: x / n, y: y / n, visibility: v / n };
  });
}

const round1 = (v) => Math.round(v * 10) / 10;

// samples: array of pixel-space landmark arrays, person facing the camera.
export function analyzeFront(samples) {
  const lm = average(samples);
  const findings = [];
  const shoulderTilt = tilt(lm[11], lm[12]);
  const hipTilt = tilt(lm[23], lm[24]);
  const headTilt = tilt(lm[7], lm[8]);
  const shoulderW = dist(lm[11], lm[12]) || 1;
  const shift = (mid(lm[11], lm[12]).x - mid(lm[23], lm[24]).x) / shoulderW;
  const kneeGap = dist(lm[25], lm[26]);
  const ankleGap = dist(lm[27], lm[28]);

  // MediaPipe "left" = the person's left. A larger y means lower on screen.
  if (Math.abs(shoulderTilt) > 3) {
    const higher = lm[11].y < lm[12].y ? 'left' : 'right';
    findings.push({ id: 'shoulder', severity: Math.abs(shoulderTilt) > 6 ? 'moderate' : 'mild', title: `Uneven shoulders (${higher} higher, ${round1(Math.abs(shoulderTilt))}°)`, fix: CORRECTIVES.shoulder });
  }
  if (Math.abs(hipTilt) > 3) {
    const higher = lm[23].y < lm[24].y ? 'left' : 'right';
    findings.push({ id: 'hip', severity: Math.abs(hipTilt) > 6 ? 'moderate' : 'mild', title: `Pelvic tilt (${higher} hip higher, ${round1(Math.abs(hipTilt))}°)`, fix: CORRECTIVES.hip });
  }
  if (lm[7].visibility > 0.5 && lm[8].visibility > 0.5 && Math.abs(headTilt) > 4) {
    findings.push({ id: 'head_tilt', severity: 'mild', title: `Head tilted to one side (${round1(Math.abs(headTilt))}°)`, fix: CORRECTIVES.head_tilt });
  }
  if (Math.abs(shift) > 0.08) {
    findings.push({ id: 'shift', severity: Math.abs(shift) > 0.15 ? 'moderate' : 'mild', title: 'Upper body shifted to one side', fix: CORRECTIVES.shift });
  }
  if (ankleGap > 0 && kneeGap < ankleGap * 0.8) {
    findings.push({ id: 'valgus', severity: 'mild', title: 'Knees drift inward (valgus tendency)', fix: CORRECTIVES.valgus });
  }
  return {
    view: 'front',
    metrics: { shoulderTilt: round1(shoulderTilt), hipTilt: round1(hipTilt), headTilt: round1(headTilt), lateralShift: round1(shift * 100) },
    findings,
  };
}

// samples: pixel-space landmarks, person standing side-on.
export function analyzeSide(samples) {
  const lm = average(samples);
  const side = lm[11].visibility + lm[7].visibility >= lm[12].visibility + lm[8].visibility ? 'L' : 'R';
  const [ear, sh, hip, knee, ankle] = side === 'L' ? [7, 11, 23, 25, 27].map((i) => lm[i]) : [8, 12, 24, 26, 28].map((i) => lm[i]);
  const nose = lm[0];
  const facing = Math.sign(nose.x - ear.x) || 1; // +1 facing right on screen
  const torso = dist(sh, hip) || 1;
  const findings = [];

  // Craniovertebral-style angle: shoulder->ear line vs horizontal. <50° = forward head.
  const cva = Math.atan2(Math.abs(sh.y - ear.y), Math.abs(ear.x - sh.x)) * (180 / Math.PI);
  const headForward = ((ear.x - sh.x) * facing) / torso;
  const shoulderForward = ((sh.x - hip.x) * facing) / torso;
  const hipForward = ((hip.x - ankle.x) * facing) / torso;
  const kneeAngle = angle(hip, knee, ankle);

  if (cva < 50 && headForward > 0.1) {
    findings.push({ id: 'forward_head', severity: cva < 42 ? 'moderate' : 'mild', title: `Forward head posture (neck angle ${Math.round(cva)}°)`, fix: CORRECTIVES.forward_head });
  }
  if (shoulderForward > 0.12) {
    findings.push({ id: 'slouch', severity: shoulderForward > 0.22 ? 'moderate' : 'mild', title: 'Rounded / slouched upper back', fix: CORRECTIVES.slouch });
  }
  if (hipForward > 0.15) {
    findings.push({ id: 'sway', severity: 'mild', title: 'Hips pushed forward (sway-back)', fix: CORRECTIVES.sway });
  }
  return {
    view: 'side',
    metrics: { neckAngle: Math.round(cva), headForward: round1(headForward * 100), shoulderForward: round1(shoulderForward * 100), kneeAngle: Math.round(kneeAngle) },
    findings,
  };
}

export function postureScore(results) {
  let score = 100;
  for (const r of results) for (const f of r.findings) score -= f.severity === 'moderate' ? 12 : 6;
  return Math.max(40, score);
}
