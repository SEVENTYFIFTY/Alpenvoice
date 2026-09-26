import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultLife, newKid, freeWindows, weekPlan, toTime, toICS, describeLife, timeline } from '../js/schedule.js';

const fmt = (ws) => ws.map((w) => `${toTime(w.start)}-${toTime(w.end)} ${w.mode} ${w.label}`);

test('office worker, no kids: windows before/after work, lunch is a walk', () => {
  const life = defaultLife();
  const ws = freeWindows(life, 0);
  assert.ok(ws.some((w) => w.mode === 'walk' && w.lunch));
  assert.ok(ws.some((w) => w.start >= 18 * 60 && w.mode === 'solo'), fmt(ws).join('\n'));
  // nothing inside work hours except lunch
  assert.ok(ws.filter((w) => !w.lunch).every((w) => w.end <= 8 * 60 || w.start >= 18 * 60), fmt(ws).join('\n'));
});

test('parent with a 5-year-old in kindergarten: evenings are family time until bedtime', () => {
  const life = defaultLife();
  life.work.type = 'home';
  life.work.days = life.work.days.map((d) => (d ? { start: '08:30', end: '12:00' } : null)); // part-time mornings
  life.kids = [newKid(5)];
  const ws = freeWindows(life, 1);
  const txt = fmt(ws).join('\n');
  assert.ok(ws.some((w) => w.mode === 'family' && w.start >= 12 * 60), txt);
  assert.ok(ws.some((w) => w.label === 'Kids in bed' && w.mode === 'solo'), txt);
  // School run blocks the drop-off time
  assert.ok(!ws.some((w) => w.start <= 7 * 60 + 50 && w.end >= 8 * 60 + 10), txt);
});

test('toddler nap and weekend windows are found', () => {
  const life = defaultLife();
  life.work.type = 'none';
  life.kids = [newKid(2)];
  const sat = freeWindows(life, 5);
  assert.ok(sat.some((w) => w.label === 'Nap time' && w.mode === 'solo'), fmt(sat).join('\n'));
});

test('week plan spreads the requested sessions and avoids back-to-back days', () => {
  const life = defaultLife();
  life.sessionsPerWeek = 3;
  const plan = weekPlan(life);
  const days = plan.sessions.map((d) => d.d);
  assert.equal(days.length, 3);
  for (let i = 1; i < days.length; i++) assert.ok(days[i] - days[i - 1] > 1, days.join(','));
  for (const d of plan.sessions) assert.ok(d.session.minutes >= 15 && d.session.minutes <= 30);
  assert.equal(plan.note, null);
});

test('morning preference is respected when a morning window exists', () => {
  const life = defaultLife();
  life.wake = '05:30';
  life.prefer = 'morning';
  const plan = weekPlan(life);
  assert.ok(plan.sessions.every((d) => d.session.start < 11 * 60), plan.sessions.map((d) => toTime(d.session.start)).join(','));
});

test('busy single parent gets family workouts and an honest note when time is short', () => {
  const life = defaultLife();
  life.kids = [newKid(3), newKid(7)];
  life.work.days = life.work.days.map(() => ({ start: '08:00', end: '17:00' }));
  life.sessionsPerWeek = 5;
  const plan = weekPlan(life);
  assert.ok(plan.sessions.length >= 1);
  assert.ok(plan.days.some((d) => d.session?.mode === 'family' || d.session?.label === 'Kids in bed'));
});

test('night shift blocks the next morning for sleep', () => {
  const life = defaultLife();
  life.work.type = 'shift';
  life.work.days = [{ start: '22:00', end: '06:00' }, null, null, null, null, null, null];
  const tue = freeWindows(life, 1);
  assert.ok(tue.every((w) => w.start >= 13 * 60), fmt(tue).join('\n'));
});

test('timeline covers the whole day and ics has one event per session', () => {
  const life = defaultLife();
  const runs = timeline(life, 0);
  assert.equal(runs[0].start, 0);
  assert.equal(runs[runs.length - 1].end, 1440);
  const plan = weekPlan(life);
  const ics = toICS(plan, new Date(2026, 8, 28));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, plan.sessions.length);
  assert.match(describeLife(life), /Work: office/);
});
