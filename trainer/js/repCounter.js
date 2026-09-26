// Turns a stream of metric values into reps.
// progress = 0 at the start position, 1 at the peak (works for metrics that
// rise or fall). A rep counts when the user reaches the peak and returns.

export class RepCounter {
  constructor([start, peak], { fast = false } = {}) {
    this.start = start;
    this.peak = peak;
    this.fast = fast;
    this.reset();
  }

  reset() {
    this.reps = 0;
    this.cleanReps = 0;
    this.partials = 0;
    this.phase = 'start';
    this.maxProgress = 0;
    this.repStartedAt = 0;
    this.faults = new Set();
    this.lastMoveAt = 0;
    this.cleanStreak = 0;
  }

  progress(v) {
    return (this.start - v) / (this.start - this.peak);
  }

  // faultIds: iterable of fault ids detected on this frame.
  update(value, t, faultIds = []) {
    const p = this.progress(value);
    const events = [];

    if (this.phase === 'start') {
      if (p > 0.25) {
        this.phase = 'moving';
        this.maxProgress = p;
        this.repStartedAt = t;
        this.faults.clear();
        this.lastMoveAt = t;
      }
    }
    if (this.phase === 'moving' || this.phase === 'peak') {
      for (const f of faultIds) this.faults.add(f);
      this.maxProgress = Math.max(this.maxProgress, p);
      this.lastMoveAt = t;
    }
    if (this.phase === 'moving') {
      if (p >= 1) {
        this.phase = 'peak';
        events.push({ type: 'peak' });
      } else if (p <= 0.1) {
        this.phase = 'start';
        if (this.maxProgress > 0.45) {
          this.partials++;
          events.push({ type: 'partial', depth: this.maxProgress });
        }
      }
    } else if (this.phase === 'peak') {
      if (p <= 0.15) {
        this.phase = 'start';
        this.reps++;
        const tempo = (t - this.repStartedAt) / 1000;
        const clean = this.faults.size === 0;
        if (clean) {
          this.cleanReps++;
          this.cleanStreak++;
        } else {
          this.cleanStreak = 0;
        }
        const tooFast = !this.fast && tempo < 1.0;
        events.push({ type: 'rep', count: this.reps, tempo, clean, tooFast, faults: [...this.faults], streak: this.cleanStreak });
      }
    }
    return events;
  }

  get formScore() {
    const attempts = this.reps + this.partials;
    return attempts ? Math.round((this.cleanReps / attempts) * 100) : 100;
  }
}

// Accumulates time spent in a valid hold position.
export class HoldTimer {
  constructor() {
    this.reset();
  }
  reset() {
    this.held = 0;
    this.goodTime = 0;
    this.last = null;
    this.inPos = false;
  }
  update(inPos, t, faulty = false) {
    const events = [];
    if (this.last != null && inPos) {
      const dt = Math.min((t - this.last) / 1000, 0.25);
      const before = Math.floor(this.held);
      this.held += dt;
      if (!faulty) this.goodTime += dt;
      if (Math.floor(this.held) !== before) events.push({ type: 'second', seconds: Math.floor(this.held) });
    }
    if (inPos !== this.inPos) events.push({ type: inPos ? 'enter' : 'exit' });
    this.inPos = inPos;
    this.last = t;
    return events;
  }
  get formScore() {
    return this.held ? Math.round((this.goodTime / this.held) * 100) : 100;
  }
}
