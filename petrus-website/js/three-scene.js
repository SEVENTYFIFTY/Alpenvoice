// Petrus AI — full-page 3D background.
// A drifting particle field the camera travels through as the page scrolls,
// punctuated by glowing wireframe "windows" — there is always a window.

import * as THREE from 'three';

const canvas = document.getElementById('bg3d');
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x060a14, 0.016);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 220);
camera.position.set(0, 0, 16);

const PALETTE = [0x2dd4bf, 0x4f8df9, 0x8b7cf6];

// ---- Particle field (snow-like drift, alpine night) ----
const COUNT = prefersReduced ? 600 : 2400;
const DEPTH = 160; // field extends behind the camera's full scroll path
const positions = new Float32Array(COUNT * 3);
const colors = new Float32Array(COUNT * 3);
const speeds = new Float32Array(COUNT);
const color = new THREE.Color();

for (let i = 0; i < COUNT; i++) {
  positions[i * 3 + 0] = (Math.random() - 0.5) * 70;
  positions[i * 3 + 1] = (Math.random() - 0.5) * 50;
  positions[i * 3 + 2] = 20 - Math.random() * DEPTH;
  color.set(PALETTE[(Math.random() * PALETTE.length) | 0]);
  color.multiplyScalar(0.55 + Math.random() * 0.45);
  colors[i * 3 + 0] = color.r;
  colors[i * 3 + 1] = color.g;
  colors[i * 3 + 2] = color.b;
  speeds[i] = 0.2 + Math.random() * 0.8;
}

const particleGeo = new THREE.BufferGeometry();
particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const sprite = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  const ctx = c.getContext('2d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

const particles = new THREE.Points(particleGeo, new THREE.PointsMaterial({
  size: 0.34,
  map: sprite,
  vertexColors: true,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
}));
scene.add(particles);

// ---- Glowing window frames along the scroll path ----
const windows = new THREE.Group();
scene.add(windows);

function makeWindow(w, h, col) {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.55 });
  const outer = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-w / 2, -h / 2, 0), new THREE.Vector3(w / 2, -h / 2, 0),
      new THREE.Vector3(w / 2, h / 2, 0), new THREE.Vector3(-w / 2, h / 2, 0),
    ]), mat);
  // window cross-bars
  const bars = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -h / 2, 0), new THREE.Vector3(0, h / 2, 0),
      new THREE.Vector3(-w / 2, 0, 0), new THREE.Vector3(w / 2, 0, 0),
    ]), mat);
  // soft light spilling through the window
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
  group.add(outer, bars, glow);
  return group;
}

const WINDOW_COUNT = 9;
for (let i = 0; i < WINDOW_COUNT; i++) {
  const col = PALETTE[i % PALETTE.length];
  const win = makeWindow(3 + Math.random() * 2.5, 4 + Math.random() * 3, col);
  const side = i % 2 === 0 ? 1 : -1;
  win.position.set(side * (7 + Math.random() * 6), (Math.random() - 0.5) * 8, 6 - i * 15);
  win.rotation.y = side * -0.5 + (Math.random() - 0.5) * 0.3;
  win.userData.spin = (Math.random() - 0.5) * 0.0016;
  win.userData.bobPhase = Math.random() * Math.PI * 2;
  win.userData.baseY = win.position.y;
  windows.add(win);
}

// ---- Central icosahedron near the hero ----
const core = new THREE.Group();
const icoMat = new THREE.MeshBasicMaterial({ color: 0x4f8df9, wireframe: true, transparent: true, opacity: 0.28 });
core.add(new THREE.Mesh(new THREE.IcosahedronGeometry(4.2, 1), icoMat));
core.add(new THREE.Mesh(
  new THREE.IcosahedronGeometry(2.6, 0),
  new THREE.MeshBasicMaterial({ color: 0x2dd4bf, wireframe: true, transparent: true, opacity: 0.35 })));
core.position.set(0, 0, -4);
scene.add(core);

// ---- Scroll + pointer state ----
let scrollT = 0;          // 0..1 page progress
let targetScrollT = 0;
let mouseX = 0, mouseY = 0;
let targetMouseX = 0, targetMouseY = 0;

function readScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  targetScrollT = max > 0 ? window.scrollY / max : 0;
}
window.addEventListener('scroll', readScroll, { passive: true });
readScroll();

window.addEventListener('pointermove', (e) => {
  targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2;
  targetMouseY = (e.clientY / window.innerHeight - 0.5) * 2;
}, { passive: true });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Render loop ----
const clock = new THREE.Clock();
const TRAVEL = 120; // camera z-distance covered over the full page

function animate() {
  const t = clock.getElapsedTime();

  scrollT += (targetScrollT - scrollT) * 0.06;
  mouseX += (targetMouseX - mouseX) * 0.05;
  mouseY += (targetMouseY - mouseY) * 0.05;

  camera.position.z = 16 - scrollT * TRAVEL;
  camera.position.x = mouseX * 1.4;
  camera.position.y = -mouseY * 1.0;
  camera.lookAt(camera.position.x * 0.4, camera.position.y * 0.4, camera.position.z - 12);

  // gentle snowfall drift; recycle particles around the camera's z window
  const pos = particleGeo.attributes.position.array;
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3 + 1] -= speeds[i] * 0.012;
    if (pos[i * 3 + 1] < -26) pos[i * 3 + 1] = 26;
    const z = pos[i * 3 + 2];
    if (z > camera.position.z + 8) pos[i * 3 + 2] = z - DEPTH;
    else if (z < camera.position.z - DEPTH + 8) pos[i * 3 + 2] = z + DEPTH;
  }
  particleGeo.attributes.position.needsUpdate = true;

  windows.children.forEach((win) => {
    win.rotation.y += win.userData.spin;
    win.position.y = win.userData.baseY + Math.sin(t * 0.6 + win.userData.bobPhase) * 0.5;
  });

  core.rotation.y = t * 0.12;
  core.rotation.x = Math.sin(t * 0.18) * 0.2;
  core.position.y = Math.sin(t * 0.5) * 0.4;
  // fade the core out as the user scrolls past the hero
  const coreFade = Math.max(0, 1 - scrollT * 6);
  core.children.forEach((m) => { m.material.opacity = (m.material === icoMat ? 0.28 : 0.35) * coreFade; });

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

if (prefersReduced) {
  // static frame only
  renderer.render(scene, camera);
} else {
  animate();
}
