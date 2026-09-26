import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angle, tilt } from '../js/geometry.js';
import { RepCounter, HoldTimer } from '../js/repCounter.js';
import { byId, evaluate, checkFaults, EXERCISES } from '../js/exercises.js';
import { targets, mealPlan, bmr } from '../js/nutrition.js';
import { buildWorkout, recommendParts } from '../js/planner.js';
import { analyzeFront, analyzeSide } from '../js/posture.js';
import { StepDetector } from '../js/pedometer.js';
import { fill } from '../js/coach.js';

// Side-on skeleton (pixel space) with a given knee angle, facing right.
function sideSkeleton({ knee = 175, torsoLean = 10 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0.1 }));
  const set = (i, x, y) => { lm[i] = { x, y, visibility: 0.95 }; };
  const ankle = { x: 500, y: 900 };
  const shin = 220, thigh = 230, torso = 300;
  // shin tilts forward by half the knee bend
  const bend = (180 - knee) * Math.PI / 180;
  const kneeP = { x: ankle.x + Math.sin(bend / 2) * shin, y: ankle.y - Math.cos(bend / 2) * shin };
  // place hip so that the angle at the knee equals `knee`, hip above knee
  const hip = {};
  const a1 = Math.atan2(ankle.y - kneeP.y, ankle.x - kneeP.x);
  const a2 = a1 + (knee * Math.PI) / 180;
  hip.x = kneeP.x + Math.cos(a2) * thigh;
  hip.y = kneeP.y + Math.sin(a2) * thigh;
  if (hip.y > kneeP.y) { const a3 = a1 - (knee * Math.PI) / 180; hip.x = kneeP.x + Math.cos(a3) * thigh; hip.y = kneeP.y + Math.sin(a3) * thigh; }
  const lean = (torsoLean * Math.PI) / 180;
  const sh = { x: hip.x + Math.sin(lean) * torso, y: hip.y - Math.cos(lean) * torso };
  for (const [i, p] of [[11, sh], [23, hip], [25, kneeP], [27, ankle]]) set(i, p.x, p.y);
  set(13, sh.x + 20, sh.y + 140); set(15, sh.x + 60, sh.y + 250);
  set(7, sh.x + 15, sh.y - 90); set(0, sh.x + 45, sh.y - 85); set(31, ankle.x + 60, ankle.y + 10);
  return lm;
}

test('angle and tilt basics', () => {
  assert.equal(Math.round(angle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })), 90);
  assert.equal(Math.round(angle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })), 180);
  assert.equal(Math.round(tilt({ x: 0, y: 0 }, { x: 10, y: 0 })), 0);
});

test('synthetic skeleton produces the requested knee angle', () => {
  for (const k of [170, 120, 90]) {
    const lm = sideSkeleton({ knee: k });
    assert.ok(Math.abs(angle(lm[23], lm[25], lm[27]) - k) < 0.5, `knee ${k}`);
  }
});

test('squat reps are counted from a camera-like stream', () => {
  const ex = byId.squat;
  const rc = new RepCounter(ex.range);
  let t = 0, reps = 0;
  const cycle = [175, 160, 140, 120, 100, 90, 85, 90, 110, 130, 150, 165, 175, 175];
  for (let r = 0; r < 5; r++) {
    for (const k of cycle) {
      t += 150;
      const f = evaluate(ex, sideSkeleton({ knee: k }));
      assert.ok(f.ok);
      for (const ev of rc.update(f.value, t, checkFaults(ex, f, rc.phase).map((x) => x.id))) if (ev.type === 'rep') reps = ev.count;
    }
  }
  assert.equal(reps, 5);
  assert.equal(rc.formScore, 100);
});

test('shallow squats are flagged as partial, not counted', () => {
  const rc = new RepCounter(byId.squat.range);
  const events = [];
  let t = 0;
  for (const v of [175, 150, 130, 125, 140, 170]) events.push(...rc.update(v, (t += 200)));
  assert.equal(rc.reps, 0);
  assert.ok(events.some((e) => e.type === 'partial'));
});

test('forward lean in squat triggers the chest-up cue', () => {
  const ex = byId.squat;
  const f = evaluate(ex, sideSkeleton({ knee: 100, torsoLean: 65 }));
  assert.deepEqual(checkFaults(ex, f, 'moving').map((x) => x.id), ['chest_up']);
  const ok = evaluate(ex, sideSkeleton({ knee: 100, torsoLean: 30 }));
  assert.equal(checkFaults(ex, ok, 'moving').length, 0);
});

test('rising metrics (shoulder press) count too, and fast reps are flagged', () => {
  const rc = new RepCounter(byId.shoulder_press.range);
  let t = 0, last;
  for (const v of [90, 110, 140, 160, 140, 100, 90]) for (const e of rc.update(v, (t += 100))) last = e;
  assert.equal(rc.reps, 1);
  assert.equal(last.tooFast, true);
});

test('hidden body parts are reported as not visible', () => {
  const lm = sideSkeleton();
  lm[25].visibility = 0.1; lm[26].visibility = 0.1;
  assert.equal(evaluate(byId.squat, lm).reason, 'not_visible');
});

test('hold timer accumulates only while in position', () => {
  const h = new HoldTimer();
  let t = 0;
  for (let i = 0; i < 20; i++) h.update(true, (t += 100));
  for (let i = 0; i < 20; i++) h.update(false, (t += 100));
  assert.ok(Math.abs(h.held - 1.9) < 0.05);
});

test('every exercise is well-formed', () => {
  for (const e of EXERCISES) {
    assert.ok(e.parts.length && e.setup && e.keys.length, e.id);
    if (e.type === 'hold') assert.equal(typeof e.hold, 'function', e.id);
    else assert.ok(e.range[0] !== e.range[1] && typeof e.metric === 'function', e.id);
  }
});

test('nutrition targets are sensible', () => {
  const p = { sex: 'male', age: 35, height: 180, weight: 85, activity: 'light', goal: 'lose', waist: 92 };
  assert.equal(Math.round(bmr(p)), 1805);
  const t = targets(p);
  assert.equal(t.bmi, 26.2);
  assert.ok(t.kcal < t.tdee && t.kcal > 1500);
  assert.equal(t.protein, 170);
  assert.equal(t.waterMl, 3000);
  assert.equal(t.steps, 10000);
  assert.equal(t.waistRisk, 'Increased');
});

test('meal plan respects diet and roughly hits calories', () => {
  const t = targets({ sex: 'female', age: 29, height: 165, weight: 60, activity: 'moderate', goal: 'maintain' });
  const plan = mealPlan(t, 'vegan', 7);
  assert.equal(plan.length, 7);
  for (const d of plan) {
    assert.ok(Math.abs(d.kcal - t.kcal) / t.kcal < 0.15, `day kcal ${d.kcal} vs ${t.kcal}`);
    for (const m of d.meals) assert.equal(m.diet, 'vegan');
  }
});

test('workout builder fits the time budget and chosen parts', () => {
  const w = buildWorkout({ parts: ['legs', 'core'], level: 'intermediate', goal: 'lose', minutes: 20, seed: 42 });
  assert.equal(w.blocks[0].warmup, true);
  assert.ok(w.blocks.length >= 3);
  for (const b of w.blocks.slice(1)) assert.ok(byId[b.id].parts.some((p) => ['legs', 'core'].includes(p)));
  const low = buildWorkout({ parts: ['legs'], level: 'intermediate', minutes: 20, energy: 'low', seed: 42 });
  assert.ok(low.blocks[1].sets < w.blocks[1].sets || low.blocks[1].sets === 2);
});

test('recommendations avoid parts trained in the last 48h', () => {
  const now = Date.now();
  const rec = recommendParts([{ at: now - 3600e3, parts: ['legs', 'glutes'] }], now);
  assert.ok(!rec.includes('legs') && !rec.includes('glutes'));
});

test('posture scan flags uneven shoulders and forward head', () => {
  const front = Array.from({ length: 33 }, () => ({ x: 500, y: 500, visibility: 0.9 }));
  const put = (i, x, y) => (front[i] = { x, y, visibility: 0.9 });
  put(11, 600, 300); put(12, 400, 320); // person's left shoulder higher
  put(23, 570, 600); put(24, 430, 600);
  put(25, 570, 800); put(26, 430, 800); put(27, 570, 1000); put(28, 430, 1000);
  put(7, 540, 200); put(8, 460, 200);
  const r = analyzeFront([front, front]);
  assert.ok(r.findings.find((f) => f.id === 'shoulder' && f.title.includes('left higher')));

  const side = sideSkeleton({ knee: 178, torsoLean: 2 });
  side[7] = { x: side[11].x + 110, y: side[11].y - 70, visibility: 0.95 };
  side[0] = { x: side[7].x + 40, y: side[7].y + 5, visibility: 0.95 };
  const s = analyzeSide([side]);
  assert.ok(s.findings.some((f) => f.id === 'forward_head'));
});

test('step detector counts walking-like peaks', () => {
  const d = new StepDetector();
  let steps = 0;
  for (let i = 0; i < 400; i++) {
    const t = i * 20; // 50 Hz, 8 s
    const m = 9.81 + 2.5 * Math.sin((2 * Math.PI * t) / 500); // 2 steps/s
    if (d.push(m, t)) steps++;
  }
  assert.ok(steps >= 14 && steps <= 17, `steps=${steps}`);
});

test('coach phrase templating', () => {
  assert.equal(fill('One more, {name}!', { name: 'Alex' }), 'One more, Alex!');
});
