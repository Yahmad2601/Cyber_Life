import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { DISTRICTS, ORGS } from './orgs.js';
import { buildCity } from './city.js';
import { openDrill } from './drill.js';
import './style.css';

// ---------- renderer / scene / camera ----------
const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const VIEW = 120;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
camera.position.set(140, 125, 140);

const controls = new MapControls(camera, canvas);
controls.enableDamping = true;
controls.minZoom = 0.6;
controls.maxZoom = 4;
controls.minPolarAngle = 0.7;
controls.maxPolarAngle = 1.05;
controls.autoRotateSpeed = 0.35;

scene.add(new THREE.HemisphereLight('#fff6e8', '#9cc3d1', 1.6));
const sun = new THREE.DirectionalLight('#ffe2b8', 2.2);
sun.position.set(90, 140, 50);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 1, far: 400 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun);

const { orgEntries, update } = buildCity(scene);

function resize() {
  const w = innerWidth, h = innerHeight;
  const aspect = w / h;
  const view = aspect < 1 ? VIEW * 1.4 : VIEW;
  Object.assign(camera, { left: (-view * aspect) / 2, right: (view * aspect) / 2, top: view / 2, bottom: -view / 2 });
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
addEventListener('resize', resize);
resize();

// Title-sequence drift: slowly orbit until the user touches the controls.
let idle = 0;
controls.addEventListener('start', () => { idle = 0; controls.autoRotate = false; });

// ---------- labels ----------
const labelLayer = document.querySelector('#labels');
const labels = new Map();
for (const o of ORGS) {
  const el = document.createElement('button');
  el.className = 'label';
  el.innerHTML = `<i></i>${o.short}`;
  el.addEventListener('click', () => select(o.id));
  labelLayer.appendChild(el);
  labels.set(o.id, el);
}
const postureColor = (p) => (p >= 70 ? 'var(--good)' : p >= 55 ? 'var(--ok)' : 'var(--bad)');
function refreshLabel(o) {
  labels.get(o.id).querySelector('i').style.background = postureColor(o.posture);
}
ORGS.forEach(refreshLabel);

const tmp = new THREE.Vector3();
function placeLabels() {
  for (const [id, entry] of orgEntries) {
    tmp.set(entry.group.position.x, entry.top + 5, entry.group.position.z).project(camera);
    const el = labels.get(id);
    el.style.transform = `translate(-50%, -100%) translate(${((tmp.x + 1) / 2) * innerWidth}px, ${((1 - tmp.y) / 2) * innerHeight}px)`;
  }
}

// ---------- picking / highlight ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null;
let selected = null;

function orgMaterials(entry) {
  const mats = [];
  entry.group.traverse((m) => {
    if (!m.isMesh) return;
    for (const mat of [].concat(m.material)) if (mat.isMeshStandardMaterial && !m.userData.blink) mats.push(mat);
  });
  return mats;
}
function glow(id, color, intensity) {
  if (!id) return;
  for (const mat of orgMaterials(orgEntries.get(id))) {
    mat.emissive.set(color);
    mat.emissiveIntensity = intensity;
  }
}
function restGlow(id) {
  if (id === selected) glow(id, '#4a7cff', 0.25);
  else glow(id, '#000000', 0);
}

function pickOrg(ev) {
  pointer.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const groups = [...orgEntries.values()].map((e) => e.group);
  const hit = raycaster.intersectObjects(groups, true)[0];
  return hit ? hit.object.userData.orgId : null;
}

canvas.addEventListener('pointermove', (ev) => {
  const id = pickOrg(ev);
  if (id === hovered) return;
  const prev = hovered;
  hovered = id;
  restGlow(prev);
  if (id) glow(id, '#ffffff', 0.18);
  canvas.style.cursor = id ? 'pointer' : '';
});

let downAt = null;
canvas.addEventListener('pointerdown', (ev) => (downAt = [ev.clientX, ev.clientY]));
canvas.addEventListener('pointerup', (ev) => {
  if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return;
  const id = pickOrg(ev);
  if (id) select(id);
  else closePanel();
});

// ---------- side panel ----------
const panel = document.querySelector('#panel');
let drilling = false;

function select(id) {
  const prev = selected;
  selected = id;
  restGlow(prev);
  restGlow(id);
  renderPanel(ORGS.find((o) => o.id === id));
}
function closePanel() {
  const prev = selected;
  selected = null;
  restGlow(prev);
  panel.hidden = true;
}

function renderPanel(o) {
  panel.hidden = false;
  panel.innerHTML = `
    <button class="close" aria-label="Close">×</button>
    <div class="swatch" style="background:${o.color}"></div>
    <h2>${o.name}</h2>
    <p class="meta">${o.sector} · ${DISTRICTS[o.district].name}</p>
    <dl class="stats">
      <div><dt>Staff enrolled</dt><dd>${o.staff.toLocaleString()}</dd></div>
      <div><dt>Mail domain</dt><dd>${o.domain}</dd></div>
    </dl>
    <div class="posture">
      <div class="posture-head"><span>Human-risk posture</span><b>${o.posture}</b></div>
      <div class="bar"><span style="width:${o.posture}%;background:${postureColor(o.posture)}"></span></div>
      ${o.lastDrill ? `<p class="last">Last drill: ${o.lastDrill.kind} · you scored ${o.lastDrill.score}</p>` : ''}
    </div>
    <p class="cta">Simulate an attack on this tower</p>
    <div class="drills">
      <button data-drill="phishing"><b>Phishing</b><span>Credential-harvest email</span></button>
      <button data-drill="bec"><b>BEC</b><span>CEO payment fraud</span></button>
    </div>`;
  panel.querySelector('.close').addEventListener('click', closePanel);
  panel.querySelectorAll('[data-drill]').forEach((b) => b.addEventListener('click', () => runDrill(o, b.dataset.drill)));
}

async function runDrill(o, kind) {
  if (drilling) return;
  drilling = true;
  panel.querySelectorAll('[data-drill]').forEach((b) => (b.disabled = true));
  await launchAttack(orgEntries.get(o.id));
  const score = await openDrill(o, kind);
  o.posture = Math.round(o.posture * 0.8 + score * 0.2);
  o.lastDrill = { kind: kind === 'bec' ? 'BEC' : 'Phishing', score };
  refreshLabel(o);
  drilling = false;
  if (selected === o.id) renderPanel(o);
}

// ---------- attack visual: red packet arcs in, tower flashes ----------
const animations = [];

function launchAttack(entry) {
  return new Promise((resolve) => {
    const end = new THREE.Vector3(entry.group.position.x, entry.top + 2, entry.group.position.z);
    const a = Math.random() * Math.PI * 2;
    const start = new THREE.Vector3(Math.cos(a) * 160, 20, Math.sin(a) * 160);
    const ctrl = start.clone().lerp(end, 0.5).setY(90);
    const curve = new THREE.QuadraticBezierCurve3(start, ctrl, end);

    const packet = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), new THREE.MeshBasicMaterial({ color: '#ff3b3b' }));
    const pts = curve.getPoints(80);
    const trailGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const trail = new THREE.Line(trailGeo, new THREE.LineDashedMaterial({ color: '#ff3b3b', dashSize: 2, gapSize: 1.5 }));
    trail.computeLineDistances();
    trailGeo.setDrawRange(0, 0);
    scene.add(packet, trail);

    const DUR = 2;
    let t = 0;
    animations.push((dt) => {
      t += dt;
      const k = Math.min(t / DUR, 1);
      packet.position.copy(curve.getPoint(k));
      trailGeo.setDrawRange(0, Math.floor(k * pts.length));
      if (k < 1) return true;
      scene.remove(packet, trail);
      impact(entry, end, resolve);
      return false;
    });
  });
}

function impact(entry, at, done) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1.2, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, side: THREE.DoubleSide }),
  );
  ring.position.copy(at);
  scene.add(ring);
  let t = 0;
  animations.push((dt) => {
    t += dt;
    ring.scale.setScalar(1 + t * 12);
    ring.material.opacity = Math.max(0, 1 - t / 0.9);
    glow(entry.org.id, '#ff2a2a', Math.sin(t * 18) > 0 ? 0.55 : 0.1);
    if (t < 1) return true;
    scene.remove(ring);
    restGlow(entry.org.id);
    done();
    return false;
  });
}

// ---------- loop ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  idle += dt;
  if (idle > 6 && !selected && !drilling) controls.autoRotate = true;
  controls.update(dt);
  update(dt, t);
  for (let i = animations.length - 1; i >= 0; i--) if (!animations[i](dt)) animations.splice(i, 1);
  renderer.render(scene, camera);
  placeLabels();
});
