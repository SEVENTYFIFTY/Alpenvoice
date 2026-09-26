// Camera + MediaPipe Pose Landmarker (runs fully on-device, video never
// leaves the phone) + skeleton overlay drawing.

import { CONNECTIONS, toPixels } from './geometry.js';

const VISION_VERSION = '0.10.14';
const VISION_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

let landmarkerPromise;

async function createLandmarker() {
  const { PoseLandmarker, FilesetResolver } = await import(`${VISION_URL}/vision_bundle.mjs`);
  const fileset = await FilesetResolver.forVisionTasks(`${VISION_URL}/wasm`);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    return await PoseLandmarker.createFromOptions(fileset, opts('GPU'));
  } catch {
    return PoseLandmarker.createFromOptions(fileset, opts('CPU'));
  }
}

export function loadPoseModel() {
  landmarkerPromise = landmarkerPromise || createLandmarker();
  landmarkerPromise.catch(() => { landmarkerPromise = null; });
  return landmarkerPromise;
}

export class PoseCamera {
  constructor(video, canvas) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.facing = 'user';
    this.running = false;
    this.onFrame = null; // (pixelLandmarks|null, t) => {color, highlight}
    this.stream = null;
    this.lastTs = -1;
  }

  async start(facing = this.facing) {
    this.facing = facing;
    this.stopStream();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    this.video.srcObject = this.stream;
    this.video.classList.toggle('mirror', facing === 'user');
    this.canvas.classList.toggle('mirror', facing === 'user');
    await this.video.play();
    this.landmarker = await loadPoseModel();
    this.running = true;
    this.loop();
  }

  flip() {
    return this.start(this.facing === 'user' ? 'environment' : 'user');
  }

  loop = () => {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2 && v.videoWidth) {
      if (this.canvas.width !== v.videoWidth) {
        this.canvas.width = v.videoWidth;
        this.canvas.height = v.videoHeight;
      }
      let ts = performance.now();
      if (ts <= this.lastTs) ts = this.lastTs + 1;
      this.lastTs = ts;
      let lm = null;
      try {
        const res = this.landmarker.detectForVideo(v, ts);
        if (res.landmarks && res.landmarks[0]) lm = toPixels(res.landmarks[0], v.videoWidth, v.videoHeight);
      } catch (e) {
        console.warn('pose detect failed', e);
      }
      let style = null;
      try {
        style = this.onFrame ? this.onFrame(lm, ts) : null;
      } catch (e) {
        console.error('frame handler failed', e);
      }
      this.draw(lm, style || {});
    }
    requestAnimationFrame(this.loop);
  };

  draw(lm, { highlight = [], good = false } = {}) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!lm) return;
    const r = Math.max(4, canvas.width / 160);
    const bad = new Set(highlight);
    ctx.lineWidth = r * 0.9;
    ctx.lineCap = 'round';
    for (const [a, b] of CONNECTIONS) {
      if (lm[a].visibility < 0.4 || lm[b].visibility < 0.4) continue;
      ctx.strokeStyle = bad.has(a) || bad.has(b) ? 'rgba(255,77,77,0.95)' : good ? 'rgba(163,230,53,0.9)' : 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.moveTo(lm[a].x, lm[a].y);
      ctx.lineTo(lm[b].x, lm[b].y);
      ctx.stroke();
    }
    for (let i = 11; i < 33; i++) {
      const p = lm[i];
      if (p.visibility < 0.4) continue;
      ctx.fillStyle = bad.has(i) ? '#ff4d4d' : '#a3e635';
      ctx.beginPath();
      ctx.arc(p.x, p.y, bad.has(i) ? r * 1.6 : r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = r * 0.9;
    }
  }

  stopStream() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  stop() {
    this.running = false;
    this.stopStream();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
