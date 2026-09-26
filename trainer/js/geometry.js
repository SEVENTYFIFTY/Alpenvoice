// Pure geometry helpers for pose landmarks (MediaPipe 33-point BlazePose model).
// All functions expect points in pixel space ({x, y, visibility}) so angles are
// not distorted by the camera's aspect ratio.

export const LM = {
  NOSE: 0,
  L_EAR: 7, R_EAR: 8,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28,
  L_HEEL: 29, R_HEEL: 30,
  L_FOOT: 31, R_FOOT: 32,
};

// Skeleton lines drawn over the camera image.
export const CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32],
  [7, 11], [8, 12],
];

export const SIDES = {
  L: { ear: 7, shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27, foot: 31 },
  R: { ear: 8, shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28, foot: 32 },
};

export function toPixels(landmarks, width, height) {
  return landmarks.map((p) => ({
    x: p.x * width,
    y: p.y * height,
    z: (p.z || 0) * width,
    visibility: p.visibility ?? 1,
  }));
}

// Interior angle at b (degrees, 0..180).
export function angle(a, b, c) {
  const abx = a.x - b.x, aby = a.y - b.y;
  const cbx = c.x - b.x, cby = c.y - b.y;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (!mag) return 0;
  const cos = (abx * cbx + aby * cby) / mag;
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

// Signed tilt of the line a->b from horizontal, in degrees (-90..90).
export function tilt(a, b) {
  let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return deg;
}

// Angle of the segment a->b away from vertical (0 = perfectly vertical).
export function fromVertical(a, b) {
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visibility: Math.min(a.visibility, b.visibility) };
}

export function visible(lm, ids, threshold = 0.5) {
  return ids.every((i) => lm[i] && lm[i].visibility >= threshold);
}

// Pick the body side the camera sees best (for side-on exercises).
export function bestSide(lm, keys = ['shoulder', 'hip', 'knee', 'ankle', 'elbow', 'wrist']) {
  const score = (s) => keys.reduce((sum, k) => sum + (lm[SIDES[s][k]]?.visibility ?? 0), 0);
  return score('L') >= score('R') ? 'L' : 'R';
}

// Distance of point p from the straight line a-c, signed: positive when p is
// "below" the line in image space (larger y). Used for hip sag / pike checks.
export function offsetFromLine(a, c, p) {
  if (c.x === a.x) return p.x - a.x;
  const t = (p.x - a.x) / (c.x - a.x);
  const yOnLine = a.y + t * (c.y - a.y);
  return p.y - yOnLine;
}

export class Smoother {
  constructor(alpha = 0.4) {
    this.alpha = alpha;
    this.value = null;
  }
  push(v) {
    this.value = this.value == null ? v : this.alpha * v + (1 - this.alpha) * this.value;
    return this.value;
  }
  reset() {
    this.value = null;
  }
}
