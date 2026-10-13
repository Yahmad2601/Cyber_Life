import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CELL, DISTRICTS, PLACES, ASO_ROCK, AIRPORT_ROAD, orgCells, orgCenter } from './orgs.js';

const UNIT = 3; // world units per window-texture tile
const PALETTE = ['#f4e1c1', '#e9c4a6', '#cfe0e8', '#d8d0e8', '#f2d7d9', '#c9dcc5', '#f0e6b8', '#e4e1dc'];
const CAR_COLORS = ['#e63946', '#f4a261', '#2a9d8f', '#264653', '#ffd166', '#ffffff'];

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2601);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const range = (a, b) => a + rand() * (b - a);

// ---------- textures & materials ----------

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#aebfcf';
  for (const [x, y] of [[6, 8], [36, 8], [6, 38], [36, 38]]) ctx.fillRect(x, y, 22, 20);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
const WIN = windowTexture();

const cache = new Map();
function sideMat(color, unique) {
  const make = () => new THREE.MeshStandardMaterial({ color, map: WIN, roughness: 0.8 });
  if (unique) return make();
  if (!cache.has('s' + color)) cache.set('s' + color, make());
  return cache.get('s' + color);
}
function flatMat(color, unique) {
  const make = () => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  if (unique) return make();
  if (!cache.has('f' + color)) cache.set('f' + color, make());
  return cache.get('f' + color);
}
const darker = (hex, amt = 0.08) => '#' + new THREE.Color(hex).offsetHSL(0, 0, -amt).getHexString();

function mesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// Box sitting on y=0 with UVs scaled so windows keep a constant size.
function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / UNIT, (uv.getY(i) * dims[f][1]) / UNIT);
    }
  }
  g.translate(0, h / 2, 0);
  return g;
}

function box(w, h, d, color, roof = darker(color), unique = false) {
  const s = sideMat(color, unique);
  const r = flatMat(roof, unique);
  return mesh(boxGeo(w, h, d), [s, s, r, r, s, s]);
}

function tower(r, h, color, roof, unique) {
  const seg = 24;
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1);
  const uv = g.attributes.uv;
  const sideVerts = (seg + 1) * 2;
  for (let i = 0; i < sideVerts; i++) uv.setXY(i, (uv.getX(i) * 2 * Math.PI * r) / UNIT, (uv.getY(i) * h) / UNIT);
  g.translate(0, h / 2, 0);
  return mesh(g, [sideMat(color, unique), flatMat(roof, unique), flatMat(roof, unique)]);
}

function signTexture(text, bg) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 38px "Space Grotesk", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function flagTexture() {
  const c = document.createElement('canvas');
  c.width = 48; c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#008751'; ctx.fillRect(0, 0, 48, 32);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(16, 0, 16, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- landmark archetypes (placeholders until Blender models land) ----------

const ARCHETYPES = {
  slab(o, g) {
    g.add(box(8, o.height, 6, o.color, darker(o.color), true));
    const crown = box(6, 2.5, 4, o.accent, o.accent, true);
    crown.position.y = o.height;
    g.add(crown);
    return o.height + 2.5;
  },
  stepped(o, g) {
    const tiers = [[9, 0.5], [7, 0.3], [5, 0.2]];
    let y = 0;
    for (const [w, f] of tiers) {
      const b = box(w, o.height * f, w, o.color, darker(o.color), true);
      b.position.y = y;
      g.add(b);
      y += o.height * f;
    }
    const cap = box(3, 1.5, 3, o.accent, o.accent, true);
    cap.position.y = y;
    g.add(cap);
    return y + 1.5;
  },
  cylinder(o, g) {
    g.add(tower(4, o.height, o.color, darker(o.color), true));
    const ringMat = flatMat(o.accent, true);
    for (let y = 6; y < o.height; y += 8) {
      const ring = mesh(new THREE.CylinderGeometry(4.25, 4.25, 0.5, 24), ringMat);
      ring.position.y = y;
      g.add(ring);
    }
    return o.height;
  },
  twin(o, g) {
    const a = box(3.6, o.height, 5, o.color, darker(o.color), true);
    const b = box(3.6, o.height * 0.85, 5, o.color, darker(o.color), true);
    a.position.x = -2.4;
    b.position.x = 2.4;
    const bridge = box(1.4, 1.4, 2.5, o.accent, o.accent, true);
    bridge.position.y = o.height * 0.6;
    g.add(a, b, bridge);
    return o.height;
  },
  prism(o, g) {
    g.add(box(8, o.height, 8, o.color, darker(o.color), true));
    const shape = new THREE.Shape([new THREE.Vector2(-4, 0), new THREE.Vector2(4, 0), new THREE.Vector2(-4, 7)]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 8, bevelEnabled: false });
    geo.translate(0, 0, -4);
    const wedge = mesh(geo, flatMat(o.accent, true));
    wedge.position.y = o.height;
    g.add(wedge);
    return o.height + 7;
  },
  spire(o, g) {
    g.add(box(7, o.height, 7, o.color, darker(o.color), true));
    const mid = box(4, 6, 4, o.accent, o.accent, true);
    mid.position.y = o.height;
    const antenna = mesh(new THREE.CylinderGeometry(0.2, 0.3, 10), flatMat('#dddddd', true));
    antenna.position.y = o.height + 11;
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 12, 8),
      new THREE.MeshStandardMaterial({ color: '#ff4d4d', emissive: '#ff2020', emissiveIntensity: 1 }),
    );
    tip.position.y = o.height + 16;
    tip.userData.blink = true;
    g.add(mid, antenna, tip);
    return o.height + 6;
  },
  civic(o, g) {
    const podium = box(13, 1, 10, '#efe8dc', '#e4dccd', true);
    const body = box(11, 5, 8, o.color, darker(o.color, 0.05), true);
    body.position.y = 1;
    g.add(podium, body);
    const colMat = flatMat('#fbf8f2', true);
    for (let k = 0; k < 6; k++) {
      const col = mesh(new THREE.CylinderGeometry(0.35, 0.35, 4, 10), colMat);
      col.position.set(-4 + k * 1.6, 3, 4.6);
      g.add(col);
    }
    const portico = box(10, 0.8, 2, '#fbf8f2', '#efe8dc', true);
    portico.position.set(0, 5, 4.6);
    const drum = tower(3, 1.2, '#fbf8f2', '#fbf8f2', true);
    drum.position.y = 6;
    const dome = mesh(new THREE.SphereGeometry(3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), flatMat(o.accent, true));
    dome.position.y = 7.2;
    const pole = mesh(new THREE.CylinderGeometry(0.1, 0.1, 6), flatMat('#cccccc', true));
    pole.position.set(5, 9, -3);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshStandardMaterial({ map: flagTexture(), side: THREE.DoubleSide }));
    flag.position.set(6.2, 11.2, -3);
    flag.userData.wave = true;
    g.add(portico, drum, dome, pole, flag);
    return o.height;
  },
};

function cellToWorld(i, j) {
  return new THREE.Vector3(i * CELL, 0.3, j * CELL);
}

function buildOrg(o) {
  const g = new THREE.Group();
  const [x, z] = orgCenter(o);
  g.position.set(x, o.position ? o.position[1] : 0.3, z);
  // Landmarks have no procedural stand-in; they appear once their model loads.
  if (o.landmark) return { org: o, group: g, top: 10, sign: null };
  const top = ARCHETYPES[o.type](o, g);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 1.5),
    new THREE.MeshBasicMaterial({ map: signTexture(o.short, o.accent === '#f4f1de' ? '#3a5a40' : o.accent), side: THREE.DoubleSide }),
  );
  sign.position.y = top + 1.4;
  sign.rotation.y = Math.PI / 4;
  g.add(sign);
  g.traverse((m) => (m.userData.orgId = o.id));
  return { org: o, group: g, top, sign };
}

// ---------- city ----------

export function buildCity(scene) {
  const tickers = [];
  const orgEntries = new Map();
  const occupied = new Set(PLACES.flatMap((o) => orgCells(o).map((c) => c.join(','))));
  const spans = PLACES.filter((o) => o.span);

  // Abuja is inland: savanna ground instead of water.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#d6cfa8', roughness: 1 }),
  );
  ground.position.y = -0.6;
  ground.receiveShadow = true;
  scene.add(ground);

  for (const d of Object.values(DISTRICTS)) {
    const [i0, i1] = d.i;
    const [j0, j1] = d.j;
    const w = (i1 - i0 + 1) * CELL + 2;
    const depth = (j1 - j0 + 1) * CELL + 2;
    const slab = mesh(new THREE.BoxGeometry(w, 1.6, depth), flatMat('#cdc6b8'));
    slab.position.set(((i0 + i1) / 2) * CELL, -0.8, ((j0 + j1) / 2) * CELL);
    scene.add(slab);

    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const plate = mesh(new THREE.BoxGeometry(10.4, 0.3, 10.4), flatMat(d.color));
        plate.position.set(i * CELL, 0.15, j * CELL);
        scene.add(plate);
        if (!occupied.has(`${i},${j}`)) fillBlock(scene, i, j, d);
      }
    }
    // Multi-block campuses pave over the roads inside them; keep cars off those roads.
    const blocked = { x: [], z: [] };
    for (const o of spans.filter((o) => DISTRICTS[o.district] === d)) {
      const [sx, sy] = o.span;
      const [cx, cz] = orgCenter(o);
      const plate = mesh(new THREE.BoxGeometry(sx * CELL - 3.6, 0.3, sy * CELL - 3.6), flatMat(d.color));
      plate.position.set(cx, 0.15, cz);
      scene.add(plate);
      for (let k = 0; k < sx - 1; k++) blocked.x.push((o.cell[0] + k + 0.5) * CELL);
      for (let k = 0; k < sy - 1; k++) blocked.z.push((o.cell[1] + k + 0.5) * CELL);
    }
    spawnCars(scene, d, tickers, blocked);
  }

  addOutskirts(scene);
  addAirportRoad(scene, tickers);

  for (const o of PLACES) {
    const entry = buildOrg(o);
    scene.add(entry.group);
    orgEntries.set(o.id, entry);
    trySwapModel(entry);
  }

  addSkyLife(scene, tickers);

  const update = (dt, t) => {
    for (const fn of tickers) fn(dt, t);
    for (const { group } of orgEntries.values()) {
      group.traverse((m) => {
        if (m.userData.blink) m.material.emissiveIntensity = Math.sin(t * 4) > 0 ? 1.5 : 0.2;
        if (m.userData.wave) m.rotation.y = Math.sin(t * 3) * 0.25;
      });
    }
  };
  return { orgEntries, update };
}

function fillBlock(scene, i, j, d) {
  const c = cellToWorld(i, j);
  if (rand() < (d.parks ?? 0.12)) {
    // pocket park
    for (let k = 0; k < 6; k++) {
      const x = c.x + range(-4, 4);
      const z = c.z + range(-4, 4);
      const trunk = mesh(new THREE.CylinderGeometry(0.15, 0.2, 1), flatMat('#8b6b4a'));
      trunk.position.set(x, c.y + 0.5, z);
      const crown = mesh(new THREE.ConeGeometry(1, 2.4, 7), flatMat(pick(['#6aa56a', '#7fb77e', '#5e9c76'])));
      crown.position.set(x, c.y + 2.1, z);
      scene.add(trunk, crown);
    }
    return;
  }
  const n = 1 + Math.floor(rand() * 4);
  const slots =
    n === 1 ? [[0, 0, range(6, 9)]] :
    n === 2 ? [[-2.5, 0, 4], [2.5, 0, 4]] :
    [[-2.5, -2.5, 4], [2.5, -2.5, 4], [-2.5, 2.5, 4], [2.5, 2.5, 4]].slice(0, n);
  for (const [dx, dz, w] of slots) {
    const h = range(...d.heights) * (n === 1 ? 1.2 : 1);
    const col = pick(PALETTE);
    const b = box(w, h, n === 2 ? 8 : w, col);
    b.position.set(c.x + dx, c.y, c.z + dz);
    scene.add(b);
  }
}

function spawnCars(scene, d, tickers, blocked = { x: [], z: [] }) {
  const [i0, i1] = d.i;
  const [j0, j1] = d.j;
  const xMin = (i0 - 0.5) * CELL, xMax = (i1 + 0.5) * CELL;
  const zMin = (j0 - 0.5) * CELL, zMax = (j1 + 0.5) * CELL;
  const xLines = [], zLines = [];
  for (let i = i0; i < i1; i++) if (!blocked.x.includes((i + 0.5) * CELL)) xLines.push((i + 0.5) * CELL);
  for (let j = j0; j < j1; j++) if (!blocked.z.includes((j + 0.5) * CELL)) zLines.push((j + 0.5) * CELL);

  for (let k = 0; k < 7; k++) {
    const alongX = rand() < 0.5 && zLines.length;
    const dir = rand() < 0.5 ? 1 : -1;
    const speed = range(6, 11) * dir;
    const lane = 0.9 * dir;
    const car = mesh(new THREE.BoxGeometry(1.6, 0.8, 0.9), flatMat(pick(CAR_COLORS)));
    const cab = mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), flatMat('#cfe3f0'));
    cab.position.y = 0.6;
    car.add(cab);
    const fixed = alongX ? pick(zLines) + lane : pick(xLines.length ? xLines : [0]) - lane;
    let p = alongX ? range(xMin, xMax) : range(zMin, zMax);
    if (!alongX) car.rotation.y = Math.PI / 2;
    car.position.y = 0.4;
    scene.add(car);
    tickers.push((dt) => {
      p += speed * dt;
      const [lo, hi] = alongX ? [xMin, xMax] : [zMin, zMax];
      if (p > hi) p = lo;
      if (p < lo) p = hi;
      if (alongX) car.position.set(p, 0.4, fixed);
      else car.position.set(fixed, 0.4, p);
    });
  }
}

function addSkyLife(scene, tickers) {
  // Blimp, a nod to the Silicon Valley title sequence.
  const blimp = new THREE.Group();
  const hull = mesh(new THREE.SphereGeometry(1, 24, 16), flatMat('#f7f3ea'));
  hull.scale.set(7, 2.2, 2.2);
  blimp.add(hull);
  for (const [rx, ry] of [[0, 0], [Math.PI / 2, 0]]) {
    const fin = mesh(new THREE.BoxGeometry(2.2, 3.4, 0.2), flatMat('#e63946'));
    fin.position.x = -6;
    fin.rotation.x = rx + ry;
    blimp.add(fin);
  }
  const gondola = mesh(new THREE.BoxGeometry(2, 0.7, 0.9), flatMat('#264653'));
  gondola.position.y = -2.3;
  blimp.add(gondola);
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 2),
    new THREE.MeshBasicMaterial({ map: signTexture('CYBER LIFE', '#264653'), side: THREE.DoubleSide }),
  );
  banner.position.z = 2.25;
  blimp.add(banner);
  const banner2 = banner.clone();
  banner2.position.z = -2.25;
  blimp.add(banner2);
  scene.add(blimp);
  tickers.push((dt, t) => {
    const a = t * 0.05;
    blimp.position.set(Math.cos(a) * 85, 52 + Math.sin(t * 0.7) * 1.2, Math.sin(a) * 70);
    blimp.rotation.y = -a - Math.PI / 2;
  });

  // Drifting clouds
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
  for (let k = 0; k < 9; k++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 3);
    for (let p = 0; p < puffs; p++) {
      const s = mesh(new THREE.SphereGeometry(range(2.5, 4.5), 12, 8), cloudMat);
      s.position.set(p * 3.2 - puffs * 1.6, range(-0.5, 1), range(-1.5, 1.5));
      s.receiveShadow = false;
      cloud.add(s);
    }
    cloud.position.set(range(-160, 160), range(62, 75), range(-120, 120));
    const v = range(2, 4);
    scene.add(cloud);
    tickers.push((dt) => {
      cloud.position.x += v * dt;
      if (cloud.position.x > 170) cloud.position.x = -170;
    });
  }
}

// ---------- Blender models ----------
// Models come from blender/build_landmarks.py and are authored in world
// units (1 Blender unit = 1 world unit), so they are used at scale 1.
const loader = new GLTFLoader();
async function loadModel(name) {
  const url = `${import.meta.env.BASE_URL}models/${name}.glb`;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || type.includes('text/html')) return null; // Vite serves index.html for missing files
    return (await loader.loadAsync(url)).scene;
  } catch {
    return null;
  }
}

function prepare(model, orgId) {
  model.traverse((m) => {
    if (orgId) m.userData.orgId = orgId;
    if (m.isMesh) m.castShadow = m.receiveShadow = true;
    if (/beacon/i.test(m.name)) m.userData.blink = true; // e.g. "savanna-tel_Beacon"
  });
  return model;
}

// Swap the procedural placeholder for public/models/<org-id>.glb when present.
async function trySwapModel(entry) {
  const model = await loadModel(entry.org.id);
  if (!model) return;
  prepare(model, entry.org.id);
  entry.top = new THREE.Box3().setFromObject(model).max.y; // measured before parenting, so local
  entry.group.clear();
  entry.group.add(model);
  // Real landmarks carry their own signage in the model.
  if (entry.sign && !entry.org.real) {
    entry.sign.position.y = entry.top + 1.4;
    entry.group.add(entry.sign);
  }
}

// Airport Road: dual carriageway out of the city's south edge, past the City Gate.
function addAirportRoad(scene, tickers) {
  const { x, z0, z1 } = AIRPORT_ROAD;
  const len = z1 - z0;
  const road = mesh(new THREE.BoxGeometry(6, 0.4, len), flatMat('#6b6e73'));
  road.position.set(x, -0.4, z0 + len / 2);
  scene.add(road);
  const median = mesh(new THREE.BoxGeometry(0.5, 0.5, len), flatMat('#cfc8b8'));
  median.position.set(x, -0.35, z0 + len / 2);
  scene.add(median);
  for (let k = 0; k < 6; k++) {
    const dir = k % 2 ? 1 : -1;
    const car = mesh(new THREE.BoxGeometry(0.9, 0.8, 1.6), flatMat(pick(CAR_COLORS)));
    const cab = mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), flatMat('#cfe3f0'));
    cab.position.y = 0.6;
    car.add(cab);
    let p = range(z0, z1);
    const speed = range(9, 14) * dir;
    scene.add(car);
    tickers.push((dt) => {
      p += speed * dt;
      if (p > z1) p = z0;
      if (p < z0) p = z1;
      car.position.set(x + dir * 1.5, 0.2, p);
    });
  }
}

// Savanna scrub around the city and Aso Rock on the horizon.
function addOutskirts(scene) {
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 1.4, 6);
  const crownGeo = new THREE.SphereGeometry(1.6, 7, 5);
  const trunkMat = flatMat('#8b6b4a');
  const crowns = ['#8fa65a', '#7d9a52', '#a3b06a'].map((c) => flatMat(c));
  for (let k = 0; k < 220; k++) {
    const a = rand() * Math.PI * 2;
    const r = range(105, 300);
    const x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r;
    if (Math.abs(x) < 85 && Math.abs(z) < 72) continue;
    if (Math.abs(x - AIRPORT_ROAD.x) < 6 && z > 60) continue; // road
    if (x > -26 && x < 8 && z > 84 && z < 116) continue; // City Gate plaza
    const s = range(0.7, 1.4);
    const trunk = mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 0.1, z);
    const crown = mesh(crownGeo, pick(crowns));
    crown.scale.set(s * 1.3, s * 0.6, s * 1.3); // flat-topped savanna trees
    crown.position.set(x, 1.3 + s * 0.5, z);
    scene.add(trunk, crown);
  }
  loadModel('aso-rock').then((rock) => {
    if (!rock) return;
    rock.position.set(...ASO_ROCK.position);
    rock.rotation.y = ASO_ROCK.rotationY;
    scene.add(prepare(rock));
  });
}
