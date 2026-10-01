// Seventy Fifty — full-page 3D background.
// A neural constellation: nodes joined by edges, with signal pulses traveling
// between them. The camera drifts forward through the network as the page scrolls.

import * as THREE from 'three';
import { animate as anime, stagger, utils } from 'animejs';
import { getInstances } from 'animejs/adapters/three';

const canvas = document.getElementById('bg3d');
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05080f, 0.02);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0, 14);

const CYAN = 0x22d3ee, BLUE = 0x3b82f6, INDIGO = 0x818cf8;
const DEPTH = 150;   // z-extent of the network
const TRAVEL = 110;  // camera travel over full scroll

// ---- Network nodes ----
const NODE_COUNT = prefersReduced ? 90 : 220;
const nodes = [];
for (let i = 0; i < NODE_COUNT; i++) {
  nodes.push(new THREE.Vector3(
    (Math.random() - 0.5) * 46,
    (Math.random() - 0.5) * 30,
    18 - Math.random() * DEPTH,
  ));
}

const glowSprite = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

const nodeGeo = new THREE.BufferGeometry().setFromPoints(nodes);
const nodeColors = new Float32Array(NODE_COUNT * 3);
const palette = [CYAN, BLUE, INDIGO].map((h) => new THREE.Color(h));
for (let i = 0; i < NODE_COUNT; i++) {
  const c = palette[(Math.random() * 3) | 0];
  nodeColors[i * 3] = c.r; nodeColors[i * 3 + 1] = c.g; nodeColors[i * 3 + 2] = c.b;
}
nodeGeo.setAttribute('color', new THREE.BufferAttribute(nodeColors, 3));
scene.add(new THREE.Points(nodeGeo, new THREE.PointsMaterial({
  size: 0.5, map: glowSprite, vertexColors: true, transparent: true,
  opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
})));

// ---- Edges: connect each node to a few near neighbors ----
const edges = [];
const MAX_DIST = 9;
for (let i = 0; i < NODE_COUNT; i++) {
  let linked = 0;
  for (let j = i + 1; j < NODE_COUNT && linked < 3; j++) {
    if (nodes[i].distanceTo(nodes[j]) < MAX_DIST) { edges.push([i, j]); linked++; }
  }
}
const edgePts = [];
edges.forEach(([a, b]) => { edgePts.push(nodes[a], nodes[b]); });
scene.add(new THREE.LineSegments(
  new THREE.BufferGeometry().setFromPoints(edgePts),
  new THREE.LineBasicMaterial({ color: BLUE, transparent: true, opacity: 0.14 })));

// ---- Signal pulses traveling along random edges ----
const PULSE_COUNT = prefersReduced ? 0 : 42;
const pulses = [];
const pulseGeo = new THREE.BufferGeometry();
pulseGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PULSE_COUNT * 3), 3));
for (let i = 0; i < PULSE_COUNT; i++) {
  pulses.push({ edge: edges[(Math.random() * edges.length) | 0], t: Math.random(), speed: 0.004 + Math.random() * 0.01 });
}
const pulsePoints = new THREE.Points(pulseGeo, new THREE.PointsMaterial({
  size: 0.85, map: glowSprite, color: CYAN, transparent: true,
  opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending,
}));
if (PULSE_COUNT) scene.add(pulsePoints);

// ---- Hero centerpiece: instanced cube cluster (anime.js three adapter) ----
// A 4x4x4 grid of cubes that rotates continuously and periodically explodes
// outward and reassembles with grid-staggered timing, under a pulsing light.
const GRID = 4;
const CLUSTER_SIZE = 4.4;
const cell = CLUSTER_SIZE / GRID;
const clusterSpread = ((GRID - 1) / 2) * cell;
const cubeMat = new THREE.MeshLambertMaterial({ color: BLUE, transparent: true, opacity: 0.85 });
const cluster = new THREE.InstancedMesh(
  new THREE.BoxGeometry(cell * 0.8, cell * 0.8, cell * 0.8), cubeMat, GRID ** 3);
cluster.position.set(0, 0, -3);
scene.add(cluster);

scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(2, 3, 4);
scene.add(dirLight);
const pointLight = new THREE.PointLight(CYAN, 8, 20, 0.4);
pointLight.position.set(0, 0, 0);
scene.add(pointLight);

const cubes = getInstances(cluster);
utils.set(cubes, {
  x: stagger([-clusterSpread, clusterSpread], { grid: [GRID, GRID, GRID], axis: 'x' }),
  y: stagger([-clusterSpread, clusterSpread], { grid: [GRID, GRID, GRID], axis: 'y' }),
  z: stagger([-clusterSpread, clusterSpread], { grid: [GRID, GRID, GRID], axis: 'z' }),
});

if (!prefersReduced) {
  anime(cluster, {
    rotateY: { to: 360, duration: 9000 },
    rotateX: { to: 360, duration: 12000 },
    loop: true,
    ease: 'inOutQuad',
  });
  anime(pointLight, {
    intensity: [20, 2],
    duration: 2500,
    loop: true,
    loopDelay: 500,
    alternate: true,
    ease: 'out(3)',
  });
  anime(cubes, {
    x: (c) => c.x * 3.2,
    y: (c) => c.y * 3.2,
    z: (c) => c.z * 3.2,
    duration: 2000,
    delay: stagger([0, 500], { grid: true, from: 'center', reversed: true, ease: 'in(3)' }),
    loop: true,
    loopDelay: 500,
    alternate: true,
    ease: 'inOutExpo',
  });
}

// ---- Scroll + pointer ----
let scrollT = 0, targetScrollT = 0;
let mouseX = 0, mouseY = 0, targetMouseX = 0, targetMouseY = 0;

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

const clock = new THREE.Clock();

function animate() {
  const t = clock.getElapsedTime();

  scrollT += (targetScrollT - scrollT) * 0.06;
  mouseX += (targetMouseX - mouseX) * 0.05;
  mouseY += (targetMouseY - mouseY) * 0.05;

  camera.position.z = 14 - scrollT * TRAVEL;
  camera.position.x = mouseX * 1.3;
  camera.position.y = -mouseY * 0.9;
  camera.lookAt(camera.position.x * 0.4, camera.position.y * 0.4, camera.position.z - 12);

  // pulses travel node-to-node
  if (PULSE_COUNT) {
    const pos = pulseGeo.attributes.position.array;
    for (let i = 0; i < PULSE_COUNT; i++) {
      const p = pulses[i];
      p.t += p.speed;
      if (p.t >= 1) { p.t = 0; p.edge = edges[(Math.random() * edges.length) | 0]; }
      const a = nodes[p.edge[0]], b = nodes[p.edge[1]];
      pos[i * 3] = a.x + (b.x - a.x) * p.t;
      pos[i * 3 + 1] = a.y + (b.y - a.y) * p.t;
      pos[i * 3 + 2] = a.z + (b.z - a.z) * p.t;
    }
    pulseGeo.attributes.position.needsUpdate = true;
  }

  cubeMat.opacity = 0.85 * Math.max(0, 1 - scrollT * 6); // fade cluster past the hero

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

if (prefersReduced) renderer.render(scene, camera);
else animate();
