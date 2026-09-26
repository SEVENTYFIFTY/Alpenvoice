// Live step counter from the phone's accelerometer while the app is open.
// Browsers can't read the phone's built-in step history (Apple Health /
// Google Fit), so steps can also be entered manually.

export class StepDetector {
  constructor({ threshold = 1.1, minGapMs = 280 } = {}) {
    this.threshold = threshold;
    this.minGapMs = minGapMs;
    this.mean = 9.81;
    this.lastStep = 0;
    this.above = false;
  }

  // magnitude in m/s² (including gravity); returns true when a step is detected.
  push(magnitude, t) {
    this.mean = 0.98 * this.mean + 0.02 * magnitude;
    const d = magnitude - this.mean;
    if (!this.above && d > this.threshold && t - this.lastStep > this.minGapMs) {
      this.above = true;
      this.lastStep = t;
      return true;
    }
    if (this.above && d < 0) this.above = false;
    return false;
  }
}

export class Pedometer {
  constructor(onStep) {
    this.onStep = onStep;
    this.detector = new StepDetector();
    this.active = false;
  }

  static supported() {
    return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
  }

  async start() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const res = await DeviceMotionEvent.requestPermission(); // iOS
      if (res !== 'granted') throw new Error('Motion permission denied');
    }
    window.addEventListener('devicemotion', this.handle);
    this.active = true;
  }

  stop() {
    window.removeEventListener('devicemotion', this.handle);
    this.active = false;
  }

  handle = (e) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    const m = Math.hypot(a.x, a.y, a.z);
    if (this.detector.push(m, performance.now())) this.onStep();
  };
}
