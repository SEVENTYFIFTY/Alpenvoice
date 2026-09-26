// Full-screen camera sessions: guided workouts and the posture scan.

import { PoseCamera } from './pose.js';
import { byId, evaluate, checkFaults } from './exercises.js';
import { RepCounter, HoldTimer } from './repCounter.js';
import { SIDES, visible } from './geometry.js';
import { pick, beep } from './coach.js';
import { analyzeFront, analyzeSide } from './posture.js';

const $ = (id) => document.getElementById(id);

function ui() {
  return {
    root: $('session'),
    video: document.querySelector('#session video'),
    canvas: document.querySelector('#session canvas'),
    title: $('s-title'),
    sub: $('s-sub'),
    progress: $('s-progress'),
    overlay: $('s-overlay'),
    cue: $('s-cue'),
    reps: $('s-reps'),
    form: $('s-form'),
    plus: $('s-plus'),
    pause: $('s-pause'),
    skip: $('s-skip'),
    close: $('s-close'),
    flip: $('s-flip'),
    voice: $('s-voice'),
    depth: document.querySelector('#session .depth'),
  };
}

function bindCommon(el, coach, cam, onClose) {
  el.voice.textContent = coach.voiceOn ? '🔊' : '🔇';
  el.voice.onclick = () => {
    coach.setVoice(!coach.voiceOn);
    el.voice.textContent = coach.voiceOn ? '🔊' : '🔇';
  };
  el.flip.onclick = () => cam.flip().catch(() => {});
  el.close.onclick = onClose;
}

function showOverlay(el, html) {
  el.overlay.hidden = !html;
  if (html) el.overlay.innerHTML = html;
}

async function openCamera(el, cam) {
  el.root.classList.add('open');
  showOverlay(el, '<div><div class="count">⏳</div><p>Starting camera &amp; loading the AI body tracker…</p></div>');
  try {
    await cam.start();
    return true;
  } catch (e) {
    showOverlay(el, `<div style="pointer-events:auto"><h2>Camera not available</h2><p class="muted">${e.message || e}</p>
      <p class="small muted">Allow camera access and open the app over https (or localhost).</p>
      <button class="btn primary" onclick="document.getElementById('s-close').click()">Close</button></div>`);
    return false;
  }
}

export class WorkoutSession {
  constructor({ plan, coach, weight, onFinish }) {
    this.plan = plan;
    this.coach = coach;
    this.weight = weight;
    this.onFinish = onFinish;
    this.el = ui();
    this.cam = new PoseCamera(this.el.video, this.el.canvas);
    this.blockIdx = -1;
    this.results = [];
    this.startedAt = Date.now();
    this.paused = false;
    this.lastCueAt = 0;
  }

  async start() {
    const { el } = this;
    el.reps.parentElement.hidden = false;
    el.plus.parentElement.hidden = false;
    for (const b of [el.plus, el.pause, el.skip]) b.hidden = false;
    bindCommon(el, this.coach, this.cam, () => {
      if (confirm('End this workout now? Your progress so far is saved.')) this.finish(true);
    });
    el.pause.onclick = () => this.togglePause();
    el.skip.onclick = () => this.skip();
    el.plus.onclick = () => this.manualRep();
    this.coach.onSay((m) => this.showCue(m));
    this.cam.onFrame = (lm, t) => this.frame(lm, t);
    if (!(await openCamera(el, this.cam))) return;
    this.timer = setInterval(() => this.tick(), 250);
    this.nextBlock();
  }

  get block() {
    return this.plan.blocks[this.blockIdx];
  }

  showCue(text, bad = false) {
    this.el.cue.textContent = text;
    this.el.cue.classList.toggle('bad', bad);
    this.lastCueAt = performance.now();
  }

  nextBlock() {
    this.blockIdx++;
    if (this.blockIdx >= this.plan.blocks.length) return this.finish(false);
    const b = this.block;
    this.ex = byId[b.id];
    this.setIdx = 0;
    this.result = { id: b.id, name: b.name, type: b.type, target: b.target, sets: [], activeSec: 0, met: this.ex.met };
    this.results.push(this.result);
    this.el.depth.hidden = b.type === 'hold';
    this.el.plus.hidden = b.type === 'hold';
    const P = this.coach.P;
    this.coach.say(b.type === 'hold' ? P.nextHold : P.next, { interrupt: true, vars: { ex: b.name, sets: b.sets, reps: b.target } });
    this.wait('intro', this.blockIdx === 0 ? 12 : Math.max(b.rest, 12));
  }

  wait(phase, seconds) {
    this.phase = phase;
    this.phaseEnds = performance.now() + seconds * 1000;
    this.spokeTen = seconds <= 10;
    this.spokeGo = false;
    this.render();
  }

  startSet() {
    const b = this.block;
    this.phase = 'work';
    this.counter = b.type === 'hold' ? new HoldTimer() : new RepCounter(this.ex.range, { fast: this.ex.fast });
    this.setStartedAt = performance.now();
    this.lastActive = performance.now();
    showOverlay(this.el, '');
    this.render();
  }

  finishSet() {
    const b = this.block;
    const c = this.counter;
    const activeSec = (performance.now() - this.setStartedAt) / 1000;
    this.result.activeSec += activeSec;
    this.result.sets.push(b.type === 'hold' ? { seconds: Math.floor(c.held), form: c.formScore } : { reps: c.reps, form: c.formScore });
    this.setIdx++;
    this.phase = 'between';
    const P = this.coach.P;
    if (this.setIdx < b.sets) {
      this.coach.say(pick(P.setDone), { interrupt: true });
      this.coach.say(P.rest, { vars: { n: b.rest } });
      this.wait('rest', b.rest);
    } else if (this.blockIdx < this.plan.blocks.length - 1) {
      this.coach.say(pick(P.setDone), { interrupt: true });
      this.nextBlock();
    } else {
      this.finish(false);
    }
  }

  tick() {
    if (this.paused || !this.phase) return;
    const now = performance.now();
    const P = this.coach.P;
    if (this.phase === 'intro' || this.phase === 'rest') {
      const left = Math.ceil((this.phaseEnds - now) / 1000);
      if (!this.spokeTen && left <= 10) {
        this.spokeTen = true;
        if (this.phase === 'rest') this.coach.say(P.restTen);
      }
      if (!this.spokeGo && left <= 3) {
        this.spokeGo = true;
        this.coach.say(P.go, { interrupt: true });
      }
      if (left <= 0) this.startSet();
      else this.renderWait(left);
    } else if (this.phase === 'work' && this.block.type !== 'hold') {
      if (this.counter.reps > 0 && now - Math.max(this.lastActive, this.counter.lastMoveAt) > 8000) {
        this.coach.say(pick(P.idle), { key: 'idle', cooldown: 12000 });
      }
    }
  }

  renderWait(left) {
    const b = this.block;
    const ex = this.ex;
    const setInfo = this.phase === 'rest' ? `Rest · next: set ${this.setIdx + 1} of ${b.sets}` : `Get in position · ${ex.view === 'side' ? 'side-on to the camera' : 'facing the camera'}`;
    showOverlay(this.el, `<div><div class="small muted">${setInfo}</div><div class="count">${left}</div>
      <h2>${b.name}</h2><p class="muted" style="max-width:420px">${ex.setup}</p>
      <p class="small">${b.type === 'hold' ? `${b.sets} × ${b.target}s hold` : `${b.sets} × ${b.target} reps`}</p></div>`);
  }

  render() {
    const { el } = this;
    const b = this.block;
    if (!b) return;
    el.title.textContent = b.name;
    el.sub.textContent = `Set ${Math.min(this.setIdx + 1, b.sets)}/${b.sets} · Exercise ${this.blockIdx + 1}/${this.plan.blocks.length}`;
    el.progress.style.width = `${(this.blockIdx / this.plan.blocks.length) * 100}%`;
    const c = this.phase === 'work' ? this.counter : null;
    if (b.type === 'hold') {
      el.reps.innerHTML = `${c ? Math.floor(c.held) : 0}<small>/${b.target}s</small>`;
    } else {
      el.reps.innerHTML = `${c ? c.reps : 0}<small>/${b.target}</small>`;
    }
    el.form.textContent = `${c ? c.formScore : 100}%`;
  }

  frame(lm, t) {
    if (!this.ex) return null;
    if (!lm) {
      if (this.phase === 'work' && !this.paused) this.coach.say(this.coach.P.notVisible, { key: 'visible', cooldown: 8000 });
      return null;
    }
    const f = evaluate(this.ex, lm);
    if (!f.ok) {
      if (this.phase === 'work' && !this.paused) this.coach.say(this.coach.P.notVisible, { key: 'visible', cooldown: 8000 });
      return null;
    }
    if (this.phase !== 'work' || this.paused) return { good: false };

    const b = this.block;
    const c = this.counter;
    const phase = b.type === 'hold' ? 'hold' : c.phase;
    const faults = checkFaults(this.ex, f, phase);
    const highlight = faults.flatMap((x) => x.joints.map((j) => SIDES[f.side][j]));
    if (faults.length) this.coach.fault(faults[0].id);

    if (b.type === 'hold') {
      const events = c.update(f.inHold, t, faults.length > 0);
      for (const ev of events) {
        if (ev.type === 'enter') this.coach.say(this.coach.P.holdStart, { key: 'hold', cooldown: 5000 });
        if (ev.type === 'exit' && c.held > 1) this.coach.say(this.coach.P.holdLost, { key: 'holdlost', cooldown: 4000, interrupt: true });
        if (ev.type === 'second') {
          const left = b.target - ev.seconds;
          if (left === 10 || left === 20) this.coach.say(this.coach.P.holdLeft, { vars: { n: left }, interrupt: true });
          else if (left > 0 && left <= 3) this.coach.count(left);
          else if (ev.seconds % 15 === 0 && left > 5) this.coach.say(pick(this.coach.P.hype), { key: 'hype', cooldown: 10000 });
          this.render();
        }
      }
      if (c.held >= b.target) {
        this.coach.say(this.coach.P.holdDone, { interrupt: true });
        this.finishSet();
      }
      return { highlight, good: f.inHold && !faults.length };
    }

    const events = c.update(f.value, t, faults.map((x) => x.id));
    const progress = Math.max(0, Math.min(1, c.progress(f.value)));
    this.el.depth.firstElementChild.style.height = `${progress * 100}%`;
    for (const ev of events) {
      if (ev.type === 'rep') this.onRep(ev);
      if (ev.type === 'partial') this.coach.say(this.coach.P.partial, { key: 'partial', cooldown: 6000, interrupt: true });
    }
    return { highlight, good: c.phase !== 'start' && !faults.length };
  }

  onRep(ev) {
    this.lastActive = performance.now();
    beep(ev.clean ? 988 : 660);
    this.render();
    if (ev.count >= this.block.target) {
      this.finishSet();
    } else {
      this.coach.onRep(ev, this.block.target);
    }
  }

  manualRep() {
    if (this.phase !== 'work' || this.block.type === 'hold') return;
    const c = this.counter;
    c.reps++;
    c.cleanReps++;
    this.onRep({ type: 'rep', count: c.reps, clean: true, faults: [], streak: 0, tempo: 2 });
  }

  skip() {
    if (this.phase === 'work') this.finishSet();
    else if (this.phase === 'intro' || this.phase === 'rest') this.phaseEnds = performance.now();
  }

  togglePause() {
    this.paused = !this.paused;
    this.el.pause.textContent = this.paused ? 'Resume' : 'Pause';
    if (this.paused) {
      this.pausedAt = performance.now();
      this.coach.stop();
      showOverlay(this.el, '<div><div class="count">⏸</div><p>Paused. Take your time.</p></div>');
    } else {
      const d = performance.now() - this.pausedAt;
      this.phaseEnds += d;
      if (this.setStartedAt) this.setStartedAt += d;
      if (this.counter instanceof HoldTimer) this.counter.last = null;
      if (this.phase === 'work') showOverlay(this.el, '');
    }
  }

  finish(early) {
    clearInterval(this.timer);
    if (this.phase === 'work' && this.counter && this.result) {
      const c = this.counter;
      if (c.reps || c.held) {
        this.result.activeSec += (performance.now() - this.setStartedAt) / 1000;
        this.result.sets.push(this.block.type === 'hold' ? { seconds: Math.floor(c.held), form: c.formScore } : { reps: c.reps, form: c.formScore });
      }
    }
    this.phase = null;
    if (!early) this.coach.say(this.coach.P.workoutDone, { interrupt: true });
    this.cam.stop();
    this.el.root.classList.remove('open');
    showOverlay(this.el, '');
    this.coach.listeners = [];

    const done = this.results.filter((r) => r.sets.length);
    const totalReps = done.reduce((a, r) => a + r.sets.reduce((s, x) => s + (x.reps || 0), 0), 0);
    const forms = done.flatMap((r) => r.sets.map((s) => s.form));
    const activeSec = done.reduce((a, r) => a + r.activeSec, 0);
    const kcal = Math.round(done.reduce((a, r) => a + r.met * this.weight * (r.activeSec / 3600), 0) + ((Date.now() - this.startedAt) / 1000 - activeSec) / 3600 * 1.5 * this.weight);
    this.onFinish?.({
      at: Date.now(),
      early,
      parts: this.plan.parts,
      minutes: Math.round((Date.now() - this.startedAt) / 60000),
      reps: totalReps,
      formScore: forms.length ? Math.round(forms.reduce((a, b) => a + b, 0) / forms.length) : null,
      kcal,
      blocks: done.map((r) => ({ id: r.id, name: r.name, type: r.type, sets: r.sets })),
    });
  }
}

// Posture scan: 5 s facing the camera, then 5 s side-on.
export async function runPostureScan({ coach, onDone }) {
  const el = ui();
  const cam = new PoseCamera(el.video, el.canvas);
  let cancelled = false;
  const close = () => {
    cancelled = true;
    cam.stop();
    coach.stop();
    el.root.classList.remove('open');
    showOverlay(el, '');
  };
  bindCommon(el, coach, cam, close);
  el.reps.parentElement.hidden = true;
  el.plus.parentElement.hidden = true;
  el.depth.hidden = true;
  el.cue.textContent = '';
  el.progress.style.width = '0';

  let capture = null;
  const needed = [0, 11, 12, 23, 24, 25, 26, 27, 28];
  cam.onFrame = (lm) => {
    if (!lm) return null;
    if (capture && visible(lm, capture.view === 'front' ? needed : [11, 23, 25, 27].map((i) => (lm[i].visibility >= lm[i + 1].visibility ? i : i + 1)), 0.5)) {
      capture.samples.push(lm);
    }
    return { good: !!capture };
  };
  if (!(await openCamera(el, cam))) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function countdown(title, text, secs) {
    for (let s = secs; s > 0 && !cancelled; s--) {
      showOverlay(el, `<div><div class="small muted">${title}</div><div class="count">${s}</div><p style="max-width:420px">${text}</p></div>`);
      await sleep(1000);
    }
  }
  async function grab(view, secs) {
    capture = { view, samples: [] };
    for (let s = secs; s > 0 && !cancelled; s--) {
      showOverlay(el, '');
      el.cue.textContent = `Hold still… ${s}`;
      el.progress.style.width = `${((view === 'front' ? 0 : 50) + ((secs - s) / secs) * 50)}%`;
      await sleep(1000);
    }
    const out = capture.samples;
    capture = null;
    el.cue.textContent = '';
    return out;
  }

  const results = [];
  const steps = [
    { view: 'front', title: 'Step 1 of 2 · Front', text: 'Face the camera. Stand relaxed, feet hip-width, arms by your sides. Your whole body must be visible.', analyze: analyzeFront },
    { view: 'side', title: 'Step 2 of 2 · Side', text: 'Turn 90° so your side faces the camera. Stand naturally, look straight ahead.', analyze: analyzeSide },
  ];
  el.title.textContent = 'Posture scan';
  for (const step of steps) {
    el.sub.textContent = step.title;
    coach.say(step.text, { interrupt: true });
    await countdown(step.title, step.text, 10);
    if (cancelled) return;
    let samples = await grab(step.view, 5);
    if (samples.length < 10 && !cancelled) {
      coach.say(coach.P.notVisible, { interrupt: true });
      await countdown(step.title, 'I could not see your full body. Step back so head to feet are in the frame.', 6);
      samples = await grab(step.view, 5);
    }
    if (cancelled) return;
    if (samples.length >= 10) results.push(step.analyze(samples));
  }
  close();
  onDone(results);
}
