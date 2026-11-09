import * as THREE from './three.module.min.js';

const D = window.SAFARI || {};
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
let seed = 7; const srand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/* ------------------------------------------------------------------ renderer */
const canvas = $('layar');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('mulai').classList.add('sembunyi'); $('galat').classList.remove('sembunyi');
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const LANGIT = new THREE.Color('#bfe3f2');
scene.background = LANGIT;
scene.fog = new THREE.Fog('#cfe6ea', 90, 420);
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 900);

scene.add(new THREE.HemisphereLight('#e8f6ff', '#5d7a3a', 1.6));
const sun = new THREE.DirectionalLight('#fff3dc', 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera; sc.left = -32; sc.right = 32; sc.top = 32; sc.bottom = -32; sc.near = 1; sc.far = 160;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

/* ------------------------------------------------------------------ helpers */
const matCache = new Map();
function mat(c, o = {}) {
  const k = c + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o }));
  return matCache.get(k);
}
const G = {};
const geo = (k, f) => G[k] || (G[k] = f());
const sph = (r, w = 10, h = 8) => geo(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h));
const cyl = (a, b, h, s = 8) => geo(`c${a},${b},${h},${s}`, () => new THREE.CylinderGeometry(a, b, h, s));
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cone = (r, h, s = 8) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const limbDown = (a, b, L, s = 7) => geo(`ld${a},${b},${L},${s}`, () => { const g = new THREE.CylinderGeometry(a, b, L, s); g.translate(0, -L / 2, 0); return g; });
const limbUp = (a, b, L, s = 7) => geo(`lu${a},${b},${L},${s}`, () => { const g = new THREE.CylinderGeometry(a, b, L, s); g.translate(0, L / 2, 0); return g; });

function mesh(g, m, x = 0, y = 0, z = 0, parent, shadow = true) {
  const me = new THREE.Mesh(g, (typeof m === 'string') ? mat(m) : m);
  me.position.set(x, y, z);
  me.castShadow = shadow; me.receiveShadow = true;
  if (parent) parent.add(me);
  return me;
}
function tex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
function noiseFill(ctx, w, h, base, cols, n, size) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = cols[i % cols.length];
    ctx.globalAlpha = rand(0.15, 0.5);
    const s = rand(size[0], size[1]);
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s * rand(1, 3));
  }
  ctx.globalAlpha = 1;
}
function textTex(lines, opt = {}) {
  const w = opt.w || 512, h = opt.h || 256;
  return tex(w, h, (c) => {
    c.fillStyle = opt.bg || '#6b4a2b'; c.fillRect(0, 0, w, h);
    c.strokeStyle = opt.border || '#e9d29a'; c.lineWidth = 14; c.strokeRect(10, 10, w - 20, h - 20);
    c.fillStyle = opt.fg || '#fffaf0'; c.textAlign = 'center'; c.textBaseline = 'middle';
    lines.forEach((t, i) => {
      const fs = (i === 0 ? opt.size || 64 : (opt.size2 || 40));
      c.font = `600 ${fs}px Fredoka, system-ui, sans-serif`;
      c.fillText(t, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (fs + 14));
    });
  });
}

/* ------------------------------------------------------------------ colliders */
const circles = [], segs = [];
const CELL = 8, grid = new Map();
const addCircle = (x, z, r) => circles.push({ x, z, r });
const addSeg = (x1, z1, x2, z2) => segs.push({ x1, z1, x2, z2 });
function buildGrid() {
  const put = (cx, cz, item) => { const k = cx + ',' + cz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(item); };
  for (const c of circles) {
    for (let x = Math.floor((c.x - c.r) / CELL); x <= Math.floor((c.x + c.r) / CELL); x++)
      for (let z = Math.floor((c.z - c.r) / CELL); z <= Math.floor((c.z + c.r) / CELL); z++) put(x, z, c);
  }
  for (const s of segs) {
    for (let x = Math.floor(Math.min(s.x1, s.x2) / CELL); x <= Math.floor(Math.max(s.x1, s.x2) / CELL); x++)
      for (let z = Math.floor(Math.min(s.z1, s.z2) / CELL); z <= Math.floor(Math.max(s.z1, s.z2) / CELL); z++) put(x, z, s);
  }
}
const BATAS = { x1: -148, x2: 88, z1: -238, z2: 132 };
function resolve(p, r) {
  for (let it = 0; it < 2; it++) {
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
      const list = grid.get(gx + ',' + gz); if (!list) continue;
      for (const o of list) {
        if (o.r !== undefined) {
          const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), m = o.r + r;
          if (d < m && d > 1e-4) { p.x = o.x + dx / d * m; p.z = o.z + dz / d * m; }
        } else {
          const vx = o.x2 - o.x1, vz = o.z2 - o.z1, L2 = vx * vx + vz * vz;
          const t = clamp(((p.x - o.x1) * vx + (p.z - o.z1) * vz) / L2, 0, 1);
          const qx = o.x1 + vx * t, qz = o.z1 + vz * t, dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz);
          if (d < r && d > 1e-4) { p.x = qx + dx / d * r; p.z = qz + dz / d * r; }
        }
      }
    }
  }
  p.x = clamp(p.x, BATAS.x1, BATAS.x2); p.z = clamp(p.z, BATAS.z1, BATAS.z2);
}

/* ------------------------------------------------------------------ textures */
const tGrass = tex(256, 256, (c, w, h) => noiseFill(c, w, h, '#86b65a', ['#6fa047', '#9ac56a', '#7aab4e', '#a8cf72'], 2600, [1, 3]), [140, 140]);
const tAspal = tex(128, 128, (c, w, h) => noiseFill(c, w, h, '#6f7276', ['#5f6266', '#81848a', '#74777b'], 900, [1, 2]), [1, 1]);
const tPaving = tex(128, 128, (c, w, h) => {
  noiseFill(c, w, h, '#d9c49a', ['#cbb487', '#e4d2ac'], 400, [1, 3]);
  c.strokeStyle = 'rgba(120,95,60,.35)'; c.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); }
  for (let j = 0; j < 4; j++) for (let i = 0; i <= 4; i++) { const x = i * 32 + (j % 2) * 16; c.beginPath(); c.moveTo(x, j * 32); c.lineTo(x, j * 32 + 32); c.stroke(); }
});
const tTanah = tex(128, 128, (c, w, h) => noiseFill(c, w, h, '#c9a66b', ['#b8925a', '#d8b87e', '#a98450'], 900, [1, 3]), [6, 6]);
const tAir = tex(128, 128, (c, w, h) => {
  const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#5fb3c9'); g.addColorStop(1, '#3d8fae');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2;
  for (let i = 0; i < 26; i++) { const x = Math.random() * w, y = Math.random() * h; c.beginPath(); c.arc(x, y, rand(4, 12), 0.2, 2.2); c.stroke(); }
}, [4, 4]);
const tTerjun = tex(64, 256, (c, w, h) => {
  c.fillStyle = '#9fd4e6'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(255,255,255,${rand(0.3, 0.9)})`; c.fillRect(Math.random() * w, Math.random() * h, rand(1, 3), rand(20, 90)); }
}, [3, 1]);
const tZebra = tex(256, 128, (c, w, h) => { c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; for (let i = 0; i < 18; i++) { const x = i * w / 18; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 7, 0); c.lineTo(x + 4 + rand(-3, 3), h); c.lineTo(x - 3, h); c.fill(); } });
const tZebraKaki = tex(64, 128, (c, w, h) => { c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; for (let i = 0; i < 9; i++) c.fillRect(0, i * 14, w, 6); });
const tJerapah = tex(256, 256, (c, w, h) => { c.fillStyle = '#f5deb0'; c.fillRect(0, 0, w, h); c.fillStyle = '#b8732f'; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.beginPath(); const cx = x * 32 + 16 + rand(-4, 4), cy = y * 32 + 16 + rand(-4, 4); for (let a = 0; a < 6; a++) { const an = a / 6 * Math.PI * 2, r = rand(10, 14); c.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); } c.fill(); } });
const tMacan = tex(256, 128, (c, w, h) => { c.fillStyle = '#e48a2c'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a1a10'; for (let i = 0; i < 14; i++) { const x = i * w / 14 + rand(-3, 3); c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 6, 0); c.lineTo(x + rand(-8, 8), h * 0.42); c.fill(); c.beginPath(); c.moveTo(x, h); c.lineTo(x + 6, h); c.lineTo(x + rand(-8, 8), h * 0.58); c.fill(); } });
const tParkir = tex(256, 128, (c, w, h) => { noiseFill(c, w, h, '#6f7276', ['#5f6266', '#81848a'], 700, [1, 2]); c.fillStyle = '#f2f2ee'; for (let i = 0; i <= 12; i++) { c.fillRect(i * w / 12, 0, 3, h * 0.36); c.fillRect(i * w / 12, h * 0.64, 3, h * 0.36); } });

const mZebra = new THREE.MeshLambertMaterial({ map: tZebra });
const mZebraKaki = new THREE.MeshLambertMaterial({ map: tZebraKaki });
const mJerapah = new THREE.MeshLambertMaterial({ map: tJerapah });
const mMacan = new THREE.MeshLambertMaterial({ map: tMacan });

/* ------------------------------------------------------------------ ground, sky, hills */
{
  const g = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshLambertMaterial({ map: tGrass }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 12), new THREE.MeshBasicMaterial({
    side: THREE.BackSide, fog: false,
    map: tex(8, 256, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5aa7dc'); gr.addColorStop(0.45, '#a9d6ef'); gr.addColorStop(0.55, '#d7ecf0'); gr.addColorStop(1, '#d7ecf0'); c.fillStyle = gr; c.fillRect(0, 0, w, h); })
  }));
  scene.add(sky);
  // awan
  const mAwan = new THREE.MeshLambertMaterial({ color: '#ffffff', fog: false, emissive: '#bcd6e6' });
  for (let i = 0; i < 18; i++) {
    const cl = new THREE.Group(); const a = srand() * Math.PI * 2, r = 380 + srand() * 200;
    cl.position.set(Math.cos(a) * r, 120 + srand() * 70, Math.sin(a) * r);
    for (let j = 0; j < 5; j++) { const s = new THREE.Mesh(sph(1, 8, 6), mAwan); s.scale.set(18 + srand() * 14, 8 + srand() * 5, 14); s.position.set(j * 16 - 32, srand() * 6, srand() * 10); cl.add(s); }
    cl.lookAt(0, cl.position.y, 0); scene.add(cl);
  }
  // perbukitan di kejauhan
  const warna = ['#5f8f4a', '#6c9c55', '#527f44', '#7aa862'];
  for (let i = 0; i < 46; i++) {
    const a = i / 46 * Math.PI * 2 + srand() * 0.05, r = 330 + srand() * 140;
    const h = mesh(sph(1, 9, 6), warna[i % 4], Math.cos(a) * r - 30, -10, Math.sin(a) * r - 50, scene, false);
    h.scale.set(60 + srand() * 60, 40 + srand() * 70, 60 + srand() * 50);
  }
}

/* ------------------------------------------------------------------ roads */
const roadPts = []; // {x,z,w}
const mapRoads = []; // for map drawing {pts,w,color}
function ribbon(points, width, y, material, closed = false, mapColor) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], 0, p[1])), closed, 'catmullrom', 0.5);
  const n = Math.max(2, Math.ceil(curve.getLength() / 1.5));
  const pos = [], uv = [], idx = [], samp = [];
  let dist = 0, prev = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPointAt(t), tg = curve.getTangentAt(t);
    const nx = -tg.z, nz = tg.x;
    if (prev) dist += p.distanceTo(prev); prev = p;
    pos.push(p.x + nx * width / 2, y, p.z + nz * width / 2, p.x - nx * width / 2, y, p.z - nz * width / 2);
    uv.push(0, dist / width, 1, dist / width);
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    roadPts.push({ x: p.x, z: p.z, w: width / 2 }); samp.push([p.x, p.z]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.receiveShadow = true; scene.add(m);
  if (mapColor) mapRoads.push({ pts: samp, w: width, color: mapColor });
  return curve;
}
const mAspal = new THREE.MeshLambertMaterial({ map: tAspal, polygonOffset: true, polygonOffsetFactor: -2 });
const mPaving = new THREE.MeshLambertMaterial({ map: tPaving, polygonOffset: true, polygonOffsetFactor: -2 });
const mTepi = new THREE.MeshLambertMaterial({ color: '#b7a888', polygonOffset: true, polygonOffsetFactor: -1 });

const JALAN_UTAMA = [[30, 100], [30, 72], [26, 45], [18, 15], [12, -20], [9, -60], [6, -100], [3, -140], [0, -170], [0, -194]];
const JALUR_SAFARI = [[16, 42], [-10, 60], [-45, 64], [-76, 52], [-96, 25], [-101, -5], [-93, -36], [-70, -56], [-40, -50], [-20, -25], [-4, 12]];
const CABANG = [
  [[24, 38], [44, 36]],
  [[14, -8], [36, -14]],
  [[10, -64], [33, -68]],
  [[7, -96], [-16, -97]],
  [[4, -126], [-25, -146], [-46, -165], [-55, -173]],
  [[-25, -146], [-50, -139], [-66, -136]]
];
ribbon(JALAN_UTAMA, 8.6, 0.03, mTepi);
ribbon(JALAN_UTAMA, 7, 0.05, mPaving, false, '#e6d3a8');
const kurvaSafari = ribbon(JALUR_SAFARI, 8.4, 0.03, mTepi, true);
ribbon(JALUR_SAFARI, 7, 0.05, mAspal, true, '#55585c');
for (const c of CABANG) { ribbon(c, 4.6, 0.025, mTepi); ribbon(c, 3.6, 0.045, mPaving, false, '#e6d3a8'); }

/* parkir & gerbang */
const pakir = new THREE.Mesh(new THREE.PlaneGeometry(64, 30), new THREE.MeshLambertMaterial({ map: tParkir, polygonOffset: true, polygonOffsetFactor: -2 }));
pakir.rotation.x = -Math.PI / 2; pakir.position.set(30, 0.04, 116); pakir.receiveShadow = true; scene.add(pakir);
tParkir.repeat.set(2, 1); tParkir.wrapS = tParkir.wrapT = THREE.RepeatWrapping;

function mobil(x, z, rot, warna) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot;
  mesh(box(1.9, 0.75, 4.2), warna, 0, 0.75, 0, g);
  mesh(box(1.7, 0.6, 2.2), '#d9eef5', 0, 1.42, -0.2, g);
  mesh(box(1.75, 0.08, 2.3), warna, 0, 1.75, -0.2, g);
  for (const sx of [-0.95, 0.95]) for (const sz of [-1.35, 1.35]) { const r = mesh(cyl(0.38, 0.38, 0.3, 10), '#222', sx, 0.38, sz, g); r.rotation.z = Math.PI / 2; }
  scene.add(g);
  const s = Math.sin(rot), c = Math.cos(rot);
  addCircle(x + s * 1.2, z + c * 1.2, 1.2); addCircle(x - s * 1.2, z - c * 1.2, 1.2);
  return g;
}
['#d64545', '#3b6fb6', '#f0f0f0', '#2d2d2d', '#e3b23c', '#6aa86a', '#9a9aa0', '#f0f0f0', '#3b6fb6'].forEach((w, i) => {
  const kol = i % 9; if (kol === 4) return;
  mobil(5 + kol * 5.3 + (kol > 4 ? 2 : 0), i % 2 ? 108 : 125, i % 2 ? Math.PI : 0, w);
});
{ // gerbang
  const gz = 90;
  const batu = '#8b7a66', kayu = '#6b4a2b';
  for (const sx of [-6.2, 6.2]) {
    mesh(box(2.2, 7.5, 2.2), batu, 30 + sx, 3.75, gz, scene);
    mesh(cone(1.7, 1.6, 4), '#a44b2c', 30 + sx, 8.3, gz, scene).rotation.y = Math.PI / 4;
    addCircle(30 + sx, gz, 1.6);
  }
  mesh(box(14.6, 0.7, 0.9), kayu, 30, 6.6, gz, scene);
  const papan = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.2), new THREE.MeshLambertMaterial({ map: textTex([D.namaGerbang || 'PETUALANGAN SAFARI', 'Selamat datang'], { w: 1024, h: 230, size: 86, size2: 44 }) }));
  papan.position.set(30, 5.2, gz + 0.48); scene.add(papan);
  const belakang = papan.clone(); belakang.rotation.y = Math.PI; belakang.position.z = gz - 0.48; scene.add(belakang);
  mesh(box(10.4, 2.5, 0.5), kayu, 30, 5.2, gz, scene);
  // loket
  for (const sx of [-12, 12]) {
    mesh(box(4, 2.8, 3), '#efe3c8', 30 + sx, 1.4, gz + 1, scene);
    mesh(cone(3.4, 1.6, 4), '#a44b2c', 30 + sx, 3.6, gz + 1, scene).rotation.y = Math.PI / 4;
    addCircle(30 + sx, gz + 1, 2.4);
  }
  // pagar batas depan
  for (const [a, b] of [[-148, 21], [39, 88]]) { addSeg(a, gz, b, gz); }
}

/* ------------------------------------------------------------------ fences & enclosures */
const ENCL = {};
const mapAreas = [];
const postGeo = cyl(0.09, 0.11, 1.3, 6);
const posts = [], rails = [];
function fencePath(pts, gaps = [], style = 'kayu') {
  const tinggi = style === 'tinggi';
  for (let i = 0; i < pts.length - 1; i++) {
    if (gaps.includes(i)) continue;
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const L = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(L / 2.4));
    for (let k = 0; k <= n; k++) posts.push([lerp(x1, x2, k / n), lerp(z1, z2, k / n), tinggi]);
    rails.push([x1, z1, x2, z2, tinggi]);
    addSeg(x1, z1, x2, z2);
  }
}
function enclosureRect(id, x, z, w, d, opt = {}) {
  const pts = [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2], [x - w / 2, z - d / 2]];
  fencePath(pts, [], opt.style);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: tTanah, color: opt.tanah || '#ffffff', polygonOffset: true, polygonOffsetFactor: -1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(x, 0.02, z); ground.receiveShadow = true; scene.add(ground);
  ENCL[id] = { type: 'rect', x, z, w, d };
  mapAreas.push({ id, type: 'rect', x, z, w, d });
  return ENCL[id];
}
function enclosureCircle(id, x, z, r, opt = {}) {
  const pts = []; const n = 22;
  for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; pts.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
  fencePath(pts, [], opt.style);
  ENCL[id] = { type: 'circle', x, z, r };
  mapAreas.push({ id, type: 'circle', x, z, r });
  return ENCL[id];
}
function insideEncl(e, x, z, m = 0) {
  if (e.type === 'rect') return Math.abs(x - e.x) < e.w / 2 - m && Math.abs(z - e.z) < e.d / 2 - m;
  return Math.hypot(x - e.x, z - e.z) < e.r - m;
}
function randomIn(e, m = 1.5) {
  if (e.type === 'rect') return [e.x + rand(-1, 1) * (e.w / 2 - m), e.z + rand(-1, 1) * (e.d / 2 - m)];
  const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * (e.r - m); return [e.x + Math.cos(a) * r, e.z + Math.sin(a) * r];
}
function clampIn(e, x, z, m) {
  if (e.type === 'rect') return [clamp(x, e.x - e.w / 2 + m, e.x + e.w / 2 - m), clamp(z, e.z - e.d / 2 + m, e.z + e.d / 2 - m)];
  const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz) || 1, r = Math.min(d, e.r - m); return [e.x + dx / d * r, e.z + dz / d * r];
}

enclosureCircle('flamingo', -28, 87, 10.5);
enclosureRect('gajah', -75, 83, 30, 20);
enclosureRect('singa', -50, 28, 30, 24, { style: 'tinggi' });
enclosureRect('unta', -125, 15, 24, 26, { tanah: '#f3dfb0' });
enclosureRect('bison', -125, -28, 24, 24, { tanah: '#d7e6b8' });
enclosureRect('jerapah', -62, -20, 30, 26, { tanah: '#e9e2b8' });
enclosureRect('zebra', -80, -80, 32, 20, { tanah: '#e6e4bc' });
enclosureRect('babyzoo', 58, 35, 26, 22, { tanah: '#d8eab8' });
enclosureRect('harimau', 48, -72, 26, 22, { style: 'tinggi', tanah: '#d9e6b0' });
enclosureRect('beruang', -30, -98, 24, 20, { style: 'tinggi' });
enclosureRect('panda', -55, -186, 26, 20, { tanah: '#cfe5a6' });

{ // instanced posts & rails
  const pl = posts.filter(p => !p[2]), ph = posts.filter(p => p[2]);
  const im1 = new THREE.InstancedMesh(postGeo, mat('#7a5634'), pl.length);
  const im2 = new THREE.InstancedMesh(cyl(0.07, 0.07, 2.6, 6), mat('#3f5a40'), ph.length);
  const m4 = new THREE.Matrix4();
  pl.forEach((p, i) => { m4.makeTranslation(p[0], 0.65, p[1]); im1.setMatrixAt(i, m4); });
  ph.forEach((p, i) => { m4.makeTranslation(p[0], 1.3, p[1]); im2.setMatrixAt(i, m4); });
  im1.castShadow = im2.castShadow = true; scene.add(im1, im2);
  const mRail = mat('#8b6440');
  const mJaring = new THREE.MeshLambertMaterial({ color: '#3f5a40', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  for (const [x1, z1, x2, z2, t] of rails) {
    const L = Math.hypot(x2 - x1, z2 - z1), a = Math.atan2(x2 - x1, z2 - z1);
    if (t) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(L, 2.5), mJaring);
      p.position.set((x1 + x2) / 2, 1.27, (z1 + z2) / 2); p.rotation.y = a + Math.PI / 2; scene.add(p);
      const top = mesh(box(0.08, 0.08, L), '#3f5a40', (x1 + x2) / 2, 2.55, (z1 + z2) / 2, scene, false); top.rotation.y = a;
    } else {
      for (const y of [0.55, 1.05]) { const r = mesh(box(0.08, 0.12, L), mRail, (x1 + x2) / 2, y, (z1 + z2) / 2, scene, false); r.rotation.y = a; }
    }
  }
}

/* ------------------------------------------------------------------ water, ponds */
const mAir = new THREE.MeshLambertMaterial({ map: tAir, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -3 });
function kolam(x, z, rx, rz) {
  const k = new THREE.Mesh(new THREE.CircleGeometry(1, 28), mAir); k.scale.set(rx, rz, 1);
  k.rotation.x = -Math.PI / 2; k.position.set(x, 0.06, z); scene.add(k);
  const tepi = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 28), mat('#a39a86')); tepi.scale.set(rx, rz, 1);
  tepi.rotation.x = -Math.PI / 2; tepi.position.set(x, 0.07, z); scene.add(tepi);
  return k;
}
kolam(-28, 87, 6.5, 5);
kolam(-82, 88, 4, 3);
kolam(42, -74, 3.5, 2.5);
kolam(-34, -102, 3, 2.2);

/* ------------------------------------------------------------------ waterfall */
const AIR_TERJUN = { x: 0, z: -212 };
let airTerjunMesh;
{
  const g = new THREE.Group(); scene.add(g);
  const rockC = ['#7d7a72', '#8d887c', '#6e6b64', '#999284'];
  for (let i = 0; i < 34; i++) {
    const x = -34 + i * 2.1 + rand(-1, 1); if (Math.abs(x) < 4.6) continue;
    const h = 16 + Math.sin(i * 0.7) * 4 + rand(0, 6);
    const r = mesh(new THREE.DodecahedronGeometry(1, 0), rockC[i % 4], x, h / 2 - 1, -224 + rand(-2, 2), g);
    r.scale.set(rand(3, 4.5), h / 2 + 1, rand(4, 6)); r.rotation.y = rand(0, 3);
    const top = mesh(new THREE.DodecahedronGeometry(1, 0), '#5f8f4a', x, h + 0.6, -224, g); top.scale.set(3.5, 1.4, 4.5);
  }
  for (let i = 0; i < 4; i++) { const r = mesh(new THREE.DodecahedronGeometry(1, 0), rockC[i], (i - 1.5) * 3, 21, -226, g); r.scale.set(2.5, 3, 3.5); }
  for (let i = 0; i < 30; i++) addCircle(-36 + i * 2.5, -224, 3.2);
  airTerjunMesh = new THREE.Mesh(new THREE.PlaneGeometry(9, 22), new THREE.MeshLambertMaterial({ map: tTerjun, transparent: true, opacity: 0.92, emissive: '#3b6f80' }));
  airTerjunMesh.position.set(0, 10.6, -220.5); g.add(airTerjunMesh);
  kolam(0, -208, 11, 9);
  addCircle(0, -209, 10.2);
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2; const r = mesh(new THREE.DodecahedronGeometry(1, 0), rockC[i % 4], Math.cos(a) * 11.6, 0.3, -208 + Math.sin(a) * 9.6, g);
    r.scale.set(rand(0.8, 1.6), rand(0.5, 1), rand(0.8, 1.4));
  }
  // percikan
  const mBuih = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, emissive: '#99b8c2' });
  window._buih = [];
  for (let i = 0; i < 14; i++) { const b = new THREE.Mesh(sph(1, 7, 5), mBuih); b.position.set(rand(-4, 4), 0.3, -217 + rand(-1, 2)); b.scale.setScalar(rand(0.5, 1.1)); g.add(b); window._buih.push(b); }
}

/* ------------------------------------------------------------------ trees */
const treeData = [];
function farFromRoad(x, z, m) { for (const p of roadPts) { if (Math.abs(p.x - x) > 12 || Math.abs(p.z - z) > 12) continue; if (Math.hypot(p.x - x, p.z - z) < p.w + m) return false; } return true; }
const AREA_BEBAS = [[30, 116, 36], [30, 90, 12], [55, -20, 22], [-80, -135, 16], [0, -208, 15], [-28, -150, 6]];
function bebasArea(x, z) { for (const [ax, az, r] of AREA_BEBAS) if (Math.hypot(x - ax, z - az) < r) return false; return true; }
function bolehPohon(x, z) {
  if (!farFromRoad(x, z, 3)) return false;
  if (!bebasArea(x, z)) return false;
  for (const k in ENCL) { const e = ENCL[k]; if (e.type === 'rect' ? insideEncl({ ...e, w: e.w + 5, d: e.d + 5 }, x, z) : insideEncl({ ...e, r: e.r + 3 }, x, z)) return false; }
  return true;
}
for (let i = 0; i < 2600 && treeData.length < 430; i++) {
  const x = rand(BATAS.x1 + 2, BATAS.x2 - 2), z = rand(BATAS.z1 + 14, BATAS.z2 - 2);
  if (z > 92 && z < 132 && x > -5 && x < 66) continue;
  if (!bolehPohon(x, z)) continue;
  treeData.push({ x, z, s: rand(0.8, 1.35), t: Math.random() < 0.22 ? 1 : 0, col: true });
}
// beberapa pohon di dalam kandang besar
for (const [k, n] of [['jerapah', 3], ['zebra', 2], ['singa', 2], ['unta', 1], ['bison', 2], ['gajah', 2], ['harimau', 2], ['beruang', 1]]) {
  for (let i = 0; i < n; i++) { const [x, z] = randomIn(ENCL[k], 3); treeData.push({ x, z, s: rand(0.9, 1.2), t: k === 'jerapah' ? 2 : 0, col: false }); }
}
// hutan tepi
for (let i = 0; i < 420; i++) {
  const side = i % 4; let x, z;
  if (side === 0) { x = rand(BATAS.x1 - 30, BATAS.x2 + 30); z = BATAS.z2 + rand(4, 30); if (x > 10 && x < 52) continue; }
  else if (side === 1) { x = rand(BATAS.x1 - 30, BATAS.x2 + 30); z = BATAS.z1 - rand(4, 30); }
  else if (side === 2) { x = BATAS.x1 - rand(4, 30); z = rand(BATAS.z1, BATAS.z2); }
  else { x = BATAS.x2 + rand(4, 30); z = rand(BATAS.z1, BATAS.z2); }
  treeData.push({ x, z, s: rand(1, 1.6), t: Math.random() < 0.3 ? 1 : 0, col: false });
}
{
  const kinds = [[], [], []];
  treeData.forEach(t => kinds[t.t].push(t));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const daunC = ['#4f8a3c', '#5c9a44', '#447a35', '#6aa64e'];
  // bulat
  const trunk = new THREE.InstancedMesh(cyl(0.22, 0.32, 3, 6), mat('#7a5634'), treeData.length);
  let ti = 0;
  const leaf = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2, 0), new THREE.MeshLambertMaterial({ flatShading: true }), kinds[0].length * 2);
  let li = 0; const col = new THREE.Color();
  for (const t of kinds[0]) {
    m4.compose(v.set(t.x, 1.5 * t.s, t.z), q.identity(), s.set(t.s, t.s, t.s)); trunk.setMatrixAt(ti++, m4);
    q.setFromAxisAngle(v.set(0, 1, 0), Math.random() * 3);
    m4.compose(v.set(t.x, 4 * t.s, t.z), q, s.set(t.s * 1.1, t.s * 0.95, t.s * 1.1)); leaf.setMatrixAt(li, m4); leaf.setColorAt(li++, col.set(daunC[li % 4]));
    m4.compose(v.set(t.x + 0.6 * t.s, 5.3 * t.s, t.z - 0.3 * t.s), q, s.set(t.s * 0.7, t.s * 0.7, t.s * 0.7)); leaf.setMatrixAt(li, m4); leaf.setColorAt(li++, col.set(daunC[(li + 1) % 4]));
  }
  // cemara / tropis tinggi
  const pine = new THREE.InstancedMesh(new THREE.ConeGeometry(1.9, 5.5, 7), mat('#3f7a3a'), kinds[1].length * 2);
  let pi = 0;
  for (const t of kinds[1]) {
    m4.compose(v.set(t.x, 1.5 * t.s, t.z), q.identity(), s.set(t.s, t.s, t.s)); trunk.setMatrixAt(ti++, m4);
    m4.compose(v.set(t.x, 4.2 * t.s, t.z), q, s.set(t.s, t.s, t.s)); pine.setMatrixAt(pi++, m4);
    m4.compose(v.set(t.x, 6.6 * t.s, t.z), q, s.set(t.s * 0.75, t.s * 0.7, t.s * 0.75)); pine.setMatrixAt(pi++, m4);
  }
  // akasia (payung) untuk kandang jerapah
  const acacia = new THREE.InstancedMesh(cyl(3.4, 2.6, 1.1, 9), mat('#5c8f3e'), kinds[2].length);
  let ai = 0;
  for (const t of kinds[2]) {
    m4.compose(v.set(t.x, 2.6 * t.s, t.z), q.identity(), s.set(t.s * 0.8, t.s * 1.75, t.s * 0.8)); trunk.setMatrixAt(ti++, m4);
    m4.compose(v.set(t.x, 5.5 * t.s, t.z), q, s.set(t.s, t.s, t.s)); acacia.setMatrixAt(ai++, m4);
  }
  trunk.count = ti;
  for (const im of [trunk, leaf, pine, acacia]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }
  for (const t of treeData) if (t.col) addCircle(t.x, t.z, 0.45 * t.s);
}
// semak & bunga kecil di tepi jalan
{
  const n = 260; const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.8, 0), new THREE.MeshLambertMaterial({ flatShading: true }), n);
  const flower = new THREE.InstancedMesh(sph(0.16, 5, 4), new THREE.MeshLambertMaterial({ flatShading: true }), n * 3);
  const m4 = new THREE.Matrix4(), col = new THREE.Color(); let bi = 0, fi = 0;
  const fC = ['#f2d14b', '#ef7d8e', '#ffffff', '#d98ad6', '#f29b4b'];
  for (let i = 0; i < 4000 && bi < n; i++) {
    const p = roadPts[Math.floor(Math.random() * roadPts.length)];
    const a = rand(0, Math.PI * 2), x = p.x + Math.cos(a) * (p.w + 1.6), z = p.z + Math.sin(a) * (p.w + 1.6);
    if (!farFromRoad(x, z, 1.1) || !bebasArea(x, z)) continue;
    let ok = true; for (const k in ENCL) if (insideEncl(ENCL[k], x, z, -1.5)) ok = false; if (!ok) continue;
    const s = rand(0.6, 1.2);
    m4.makeScale(s * 1.2, s * 0.8, s); m4.setPosition(x, 0.45 * s, z); bush.setMatrixAt(bi, m4); bush.setColorAt(bi++, col.set(['#5c9a44', '#4f8a3c', '#6aa64e'][bi % 3]));
    for (let j = 0; j < 3; j++) { m4.makeTranslation(x + rand(-0.8, 0.8), 0.75 * s, z + rand(-0.6, 0.6)); flower.setMatrixAt(fi, m4); flower.setColorAt(fi++, col.set(fC[(bi + j) % 5])); }
  }
  bush.count = bi; flower.count = fi; bush.receiveShadow = true; scene.add(bush, flower);
}
// lampu taman di sepanjang jalan utama
{
  const c = new THREE.CatmullRomCurve3(JALAN_UTAMA.map(p => new THREE.Vector3(p[0], 0, p[1])));
  const n = 22; const pole = new THREE.InstancedMesh(cyl(0.07, 0.09, 3.6, 6), mat('#2f3a33'), n);
  const lamp = new THREE.InstancedMesh(sph(0.25, 8, 6), new THREE.MeshLambertMaterial({ color: '#fff4c9', emissive: '#7a6a3a' }), n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, p = c.getPointAt(t), tg = c.getTangentAt(t), side = i % 2 ? 1 : -1;
    const x = p.x - tg.z * 4.6 * side, z = p.z + tg.x * 4.6 * side;
    m4.makeTranslation(x, 1.8, z); pole.setMatrixAt(i, m4); m4.makeTranslation(x, 3.7, z); lamp.setMatrixAt(i, m4); addCircle(x, z, 0.2);
  }
  pole.castShadow = true; scene.add(pole, lamp);
}

/* ------------------------------------------------------------------ interactables & signs */
const interactables = [];
function addInteract(obj, kind, data, radius = 9) { const it = { obj, kind, data, radius }; obj.userData.inter = it; interactables.push(it); return it; }

const INFO = {
  zebra: { nama: 'Zebra', emoji: '🦓', fakta: ['Setiap zebra punya pola belang yang berbeda, seperti sidik jari.', 'Belangnya membantu membingungkan lalat dan pemangsa.', 'Zebra hidup berkelompok dan saling menjaga.'], makan: true },
  jerapah: { nama: 'Jerapah', emoji: '🦒', fakta: ['Hewan tertinggi di dunia, bisa mencapai 5,5 meter.', 'Lidahnya panjang sekitar 45 cm dan berwarna gelap.', 'Jerapah hanya tidur sekitar 30 menit sampai 2 jam sehari.'], makan: true },
  singa: { nama: 'Singa', emoji: '🦁', fakta: ['Singa jantan punya surai, makin gelap surainya makin dewasa.', 'Aumannya bisa terdengar sampai 8 km.', 'Singa tidur hampir 20 jam sehari.'], larang: 'Jangan beri makan, ya. Singa adalah karnivora dan pagarnya tinggi demi keamananmu.' },
  gajah: { nama: 'Gajah', emoji: '🐘', fakta: ['Gajah bisa minum sekitar 150 liter air sehari.', 'Belalainya punya puluhan ribu otot.', 'Gajah bisa mengenali dirinya di cermin.'], makan: true },
  unta: { nama: 'Unta', emoji: '🐫', fakta: ['Punuk unta menyimpan lemak, bukan air.', 'Bulu matanya berlapis dua untuk melindungi mata dari pasir.', 'Unta bisa minum lebih dari 100 liter air dalam 15 menit.'], makan: true },
  bison: { nama: 'Bison', emoji: '🦬', fakta: ['Bison bisa berlari sampai 55 km per jam.', 'Punuk di bahunya adalah otot yang sangat kuat.', 'Bison berkubang di debu untuk mengusir serangga.'], makan: true },
  flamingo: { nama: 'Flamingo', emoji: '🦩', fakta: ['Warna pink flamingo berasal dari makanannya: udang kecil dan alga.', 'Sering berdiri dengan satu kaki untuk menghemat panas tubuh.', 'Saat makan, kepalanya terbalik di dalam air.'], larang: 'Flamingo makan udang kecil dan alga, bukan wortel.' },
  harimau: { nama: 'Harimau', emoji: '🐅', fakta: ['Belang harimau juga ada di kulitnya, bukan hanya di bulunya.', 'Tidak seperti kucing rumahan, harimau suka berenang.', 'Harimau Sumatra adalah harimau asli Indonesia.'], larang: 'Harimau adalah karnivora. Cukup dilihat dari balik pagar ya.' },
  beruang: { nama: 'Beruang Madu', emoji: '🐻', fakta: ['Beruang madu adalah jenis beruang terkecil di dunia.', 'Ada tanda oranye berbentuk huruf U di dadanya.', 'Lidahnya panjang untuk mengambil madu dan rayap.'], larang: 'Beruang tidak boleh diberi makan pengunjung.' },
  panda: { nama: 'Panda', emoji: '🐼', fakta: ['Panda makan bambu hingga 12 jam sehari.', 'Bayi panda lahir sangat kecil, hanya sekitar 100 gram.', 'Panda punya "jempol palsu" untuk memegang bambu.'], larang: 'Panda punya menu bambu khusus dari perawatnya.' },
  kelinci: { nama: 'Kelinci', emoji: '🐰', fakta: ['Kelinci bisa melompat sampai 1 meter tingginya.', 'Giginya terus tumbuh seumur hidup.'], makan: true },
  kambing: { nama: 'Kambing', emoji: '🐐', fakta: ['Pupil mata kambing berbentuk persegi panjang.', 'Kambing sangat pandai memanjat.'], makan: true }
};
const LANDMARK = {
  airterjun: { nama: 'Air Terjun', emoji: '💦', fakta: ['Air terjun ini ada di ujung utara taman.', 'Udara di sini sejuk dan segar. Tempat yang pas untuk istirahat berdua.'] },
  bianglala: { nama: 'Bianglala', emoji: '🎡', fakta: ['Dari puncaknya kelihatan seluruh taman.', 'Paling seru dinaiki saat sore hari.'] },
  komidi: { nama: 'Komidi Putar', emoji: '🎠', fakta: ['Kuda-kudanya berputar pelan sambil naik turun.'] },
  kemah: { nama: 'Bumi Perkemahan', emoji: '⛺', fakta: ['Tempat berkemah di tengah hutan.', 'Api unggun menyala setiap malam.'] },
  jip: { nama: 'Jip Safari', emoji: '🚙', fakta: ['Jip ini berkeliling jalur safari.', 'Hewan-hewan di sini sudah terbiasa dengan kendaraan.'] },
  gerbang: { nama: 'Gerbang Masuk', emoji: '🎟️', fakta: ['Selamat datang! Ikuti jalan utama ke utara.', 'Jalur safari ada di sisi barat, area rekreasi di timur, dan air terjun di paling utara.'] },
  jajan: { nama: 'Kios Jajanan', emoji: '🍦', fakta: ['Es krim, jagung bakar, dan minuman dingin.', 'Waktunya istirahat sebentar.'] }
};

function papanZona(x, z, rot, teks, sub, key) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot;
  mesh(cyl(0.08, 0.08, 2.4, 6), '#6b4a2b', -0.9, 1.2, 0, g); mesh(cyl(0.08, 0.08, 2.4, 6), '#6b4a2b', 0.9, 1.2, 0, g);
  const p = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.1), [mat('#6b4a2b'), mat('#6b4a2b'), mat('#6b4a2b'), mat('#6b4a2b'),
    new THREE.MeshLambertMaterial({ map: textTex([teks, sub || ''], { w: 512, h: 240, size: 70, size2: 38 }) }), new THREE.MeshLambertMaterial({ map: textTex([teks, sub || ''], { w: 512, h: 240, size: 70, size2: 38 }) })]);
  p.position.y = 2; p.castShadow = true; g.add(p);
  scene.add(g); addCircle(x, z, 0.9);
  addInteract(g, 'papan', key, 6);
  return g;
}

/* ------------------------------------------------------------------ characters */
const DOWN = new THREE.Vector3(0, -1, 0);
function makeArm(parent, x, y, len, sleeveCol, skin, r) {
  const pivot = new THREE.Group(); pivot.position.set(x, y, 0); parent.add(pivot);
  const inner = new THREE.Group(); pivot.add(inner);
  mesh(limbDown(r * 1.45, r * 1.3, len * 0.36), sleeveCol, 0, 0, 0, inner);
  mesh(limbDown(r, r * 0.85, len), skin, 0, 0, 0, inner);
  const hand = mesh(sph(r * 1.25, 7, 5), skin, 0, -len, 0, pivot);
  return { pivot, inner, hand, len };
}
function makePerson(cewek) {
  const g = new THREE.Group();
  const skin = cewek ? '#f1c7a5' : '#d9a57d';
  const P = { group: g, legs: [], arms: [], headParts: [], cewek };
  if (cewek) {
    const baju = D.bajuKamu || '#e8836f';
    for (const sx of [-0.085, 0.085]) {
      const leg = new THREE.Group(); leg.position.set(sx, 0.8, 0); g.add(leg);
      mesh(limbDown(0.055, 0.045, 0.76), skin, 0, 0, 0, leg);
      mesh(box(0.11, 0.07, 0.2), '#f4f1ea', 0, -0.77, 0.03, leg);
      P.legs.push(leg);
    }
    mesh(cyl(0.16, 0.34, 0.52, 10), baju, 0, 0.87, 0, g);
    mesh(cyl(0.135, 0.165, 0.27, 10), baju, 0, 1.24, 0, g);
    mesh(cyl(0.05, 0.05, 0.1, 6), skin, 0, 1.4, 0, g);
    const head = new THREE.Group(); head.position.set(0, 1.53, 0); g.add(head); P.headParts.push(head);
    mesh(sph(0.14, 12, 10), skin, 0, 0, 0, head);
    for (const sx of [-0.05, 0.05]) { mesh(sph(0.018, 6, 4), '#2a1d16', sx, 0.005, 0.128, head, false); mesh(sph(0.025, 6, 4), '#f2a7a0', sx * 1.6, -0.04, 0.11, head, false); }
    const hair = mesh(sph(0.152, 12, 10), '#3b2417', 0, 0.025, -0.02, head); hair.scale.set(1, 0.95, 1.02);
    const ekor = mesh(sph(1, 10, 8), '#3b2417', 0, -0.12, -0.09, head); ekor.scale.set(0.15, 0.24, 0.08);
    mesh(cyl(0.3, 0.3, 0.02, 16), '#e9d29a', 0, 0.1, 0, head);
    mesh(cyl(0.135, 0.15, 0.11, 12), '#e9d29a', 0, 0.16, 0, head);
    mesh(cyl(0.152, 0.152, 0.035, 12), '#d65f5f', 0, 0.125, 0, head, false);
    P.arms.push(makeArm(g, -0.19, 1.34, 0.56, baju, skin, 0.042));
    P.arms.push(makeArm(g, 0.19, 1.34, 0.56, baju, skin, 0.042));
    P.eye = 1.55;
  } else {
    const baju = D.bajuPasangan || '#4f7d6b', celana = D.celanaPasangan || '#c9b28a';
    for (const sx of [-0.1, 0.1]) {
      const leg = new THREE.Group(); leg.position.set(sx, 0.9, 0); g.add(leg);
      mesh(limbDown(0.075, 0.062, 0.86), celana, 0, 0, 0, leg);
      mesh(box(0.13, 0.08, 0.26), '#3a3330', 0, -0.87, 0.04, leg);
      P.legs.push(leg);
    }
    mesh(cyl(0.2, 0.175, 0.6, 10), baju, 0, 1.18, 0, g);
    mesh(cyl(0.205, 0.205, 0.1, 10), celana, 0, 0.9, 0, g);
    mesh(cyl(0.06, 0.06, 0.1, 6), '#d9a57d', 0, 1.52, 0, g);
    const head = new THREE.Group(); head.position.set(0, 1.67, 0); g.add(head); P.headParts.push(head);
    mesh(sph(0.15, 12, 10), skin, 0, 0, 0, head);
    for (const sx of [-0.055, 0.055]) mesh(sph(0.019, 6, 4), '#2a1d16', sx, 0.01, 0.138, head, false);
    const hair = mesh(sph(0.158, 12, 10), '#221712', 0, 0.045, -0.025, head); hair.scale.set(1.02, 0.8, 1.02);
    mesh(box(0.06, 0.012, 0.012), '#5a3b2a', 0, -0.06, 0.145, head, false);
    P.arms.push(makeArm(g, -0.25, 1.44, 0.62, baju, skin, 0.05));
    P.arms.push(makeArm(g, 0.25, 1.44, 0.62, baju, skin, 0.05));
    P.eye = 1.68;
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
  return P;
}
const kamu = makePerson(true);
const dia = makePerson(false);
addInteract(dia.group, 'pasangan', null, 4);

/* ------------------------------------------------------------------ animals */
const animals = [];
function quad(o) {
  const g = new THREE.Group();
  const bm = o.bodyMat || mat(o.color);
  const legM = o.legMat || bm;
  const bodyY = o.legH + o.bh * 0.45;
  const body = mesh(sph(1, 12, 9), bm, 0, bodyY, 0, g); body.scale.set(o.bw, o.bh, o.bl);
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = new THREE.Group(); leg.position.set(sx * o.bw * 0.55, o.legH + o.bh * 0.15, sz * o.bl * 0.6); g.add(leg);
    const L = o.legH + o.bh * 0.15;
    mesh(limbDown(o.legR, o.legR * 0.8, L), legM, 0, 0, 0, leg);
    if (o.hoof) mesh(cyl(o.legR * 0.85, o.legR * 0.95, 0.08, 6), o.hoof, 0, -L + 0.04, 0, leg, false);
    legs.push(leg);
  }
  const neck = new THREE.Group(); neck.position.set(0, bodyY + o.bh * 0.35, o.bl * 0.78); neck.rotation.x = o.neckTilt; g.add(neck);
  if (o.neckL > 0) mesh(limbUp(o.neckR * 0.8, o.neckR, o.neckL), o.neckMat || bm, 0, 0, 0, neck);
  const head = new THREE.Group(); head.position.set(0, o.neckL, 0); head.rotation.x = -o.neckTilt + (o.headTilt || 0.3); neck.add(head);
  const hm = mesh(sph(1, 10, 8), o.headMat || mat(o.headColor || o.color), 0, 0, o.hl * 0.45, head); hm.scale.set(o.hw, o.hh, o.hl);
  for (const sx of [-1, 1]) mesh(sph(o.hw * 0.14, 5, 4), '#1d1712', sx * o.hw * 0.75, o.hh * 0.3, o.hl * 0.55, head, false);
  let tail = null;
  if (o.tailL) {
    tail = new THREE.Group(); tail.position.set(0, bodyY + o.bh * 0.3, -o.bl * 0.95); tail.rotation.x = -0.5; g.add(tail);
    mesh(limbDown(0.025, 0.02, o.tailL), o.tailColor || o.color, 0, 0, 0, tail, false);
    if (o.tailTuft) mesh(sph(0.07, 6, 4), o.tailTuft, 0, -o.tailL, 0, tail, false);
  }
  const A = { group: g, legs, neck, head, tail, body, baseNeck: o.neckTilt, bodyY, opt: o };
  if (o.extra) o.extra(A, g, neck, head);
  scene.add(g);
  return A;
}
const ear = (head, x, y, z, r, c, flat = 0.4) => { const e = mesh(sph(r, 6, 5), c, x, y, z, head, false); e.scale.z = flat; return e; };
const SPESIES = {
  zebra: () => quad({ bw: 0.36, bh: 0.45, bl: 0.82, legH: 0.85, legR: 0.07, bodyMat: mZebra, legMat: mZebraKaki, hoof: '#222', neckL: 0.62, neckR: 0.15, neckTilt: 0.55, neckMat: mZebra, hw: 0.14, hh: 0.16, hl: 0.34, headColor: '#efece4', headTilt: 0.9, tailL: 0.55, tailColor: '#eee', tailTuft: '#222', speed: 1.6,
    extra: (A, g, neck, head) => { mesh(box(0.05, 0.62, 0.12), '#222', 0, 0.32, -0.08, neck, false); ear(head, -0.09, 0.15, 0.08, 0.06, '#efece4'); ear(head, 0.09, 0.15, 0.08, 0.06, '#efece4'); mesh(sph(0.09, 6, 5), '#2a2a2a', 0, -0.03, 0.48, head, false); } }),
  jerapah: () => quad({ bw: 0.42, bh: 0.52, bl: 0.86, legH: 1.75, legR: 0.08, bodyMat: mJerapah, legMat: mat('#f0d6a3'), hoof: '#4a3524', neckL: 2.0, neckR: 0.17, neckTilt: 0.28, neckMat: mJerapah, hw: 0.14, hh: 0.16, hl: 0.32, headColor: '#e7c58c', headTilt: 1.2, tailL: 0.8, tailColor: '#c9a26a', tailTuft: '#3a2a1a', speed: 1.3, graze: 0.45,
    extra: (A, g, neck, head) => { for (const sx of [-0.05, 0.05]) { mesh(cyl(0.02, 0.025, 0.16, 5), '#7a5634', sx, 0.2, 0.05, head, false); mesh(sph(0.035, 5, 4), '#3a2a1a', sx, 0.28, 0.05, head, false); } ear(head, -0.13, 0.12, 0.02, 0.06, '#e7c58c'); ear(head, 0.13, 0.12, 0.02, 0.06, '#e7c58c'); mesh(box(0.05, 2, 0.08), '#8a5a2b', 0, 1, -0.14, neck, false); } }),
  singa: (jantan) => quad({ bw: 0.38, bh: 0.42, bl: 0.82, legH: 0.6, legR: 0.09, color: '#d6a75e', neckL: 0.25, neckR: 0.2, neckTilt: 0.9, hw: 0.24, hh: 0.24, hl: 0.26, headColor: '#d9ab62', headTilt: 0.7, tailL: 0.75, tailColor: '#d6a75e', tailTuft: '#5a3b1e', speed: 1.4,
    extra: (A, g, neck, head) => { if (jantan) { const m = mesh(sph(0.42, 10, 8), '#7a4a22', 0, 0.02, 0.0, head); m.scale.set(1, 1.05, 0.7); } ear(head, -0.17, 0.2, 0.08, 0.07, '#c9984f'); ear(head, 0.17, 0.2, 0.08, 0.07, '#c9984f'); mesh(sph(0.1, 6, 5), '#e8c590', 0, -0.08, 0.38, head, false); mesh(sph(0.04, 5, 4), '#3a2416', 0, -0.03, 0.47, head, false); } }),
  harimau: () => quad({ bw: 0.38, bh: 0.4, bl: 0.92, legH: 0.6, legR: 0.09, bodyMat: mMacan, legMat: mat('#e48a2c'), neckL: 0.25, neckR: 0.2, neckTilt: 0.95, hw: 0.24, hh: 0.23, hl: 0.25, headColor: '#e48a2c', headTilt: 0.7, tailL: 0.9, tailColor: '#e48a2c', tailTuft: '#2a1a10', speed: 1.4,
    extra: (A, g, neck, head) => { ear(head, -0.16, 0.2, 0.06, 0.07, '#e48a2c'); ear(head, 0.16, 0.2, 0.06, 0.07, '#e48a2c'); mesh(sph(0.12, 6, 5), '#f6efe2', 0, -0.08, 0.36, head, false); mesh(sph(0.04, 5, 4), '#3a2416', 0, -0.02, 0.47, head, false); for (const sx of [-1, 1]) { const s = mesh(box(0.02, 0.12, 0.03), '#2a1a10', sx * 0.08, 0.14, 0.22, head, false); s.rotation.z = sx * 0.3; } } }),
  gajah: () => quad({ bw: 0.88, bh: 0.92, bl: 1.3, legH: 1.25, legR: 0.27, color: '#8f8a86', hoof: '#cfc6b8', neckL: 0.2, neckR: 0.5, neckTilt: 0.7, hw: 0.55, hh: 0.58, hl: 0.55, headTilt: 0.5, tailL: 0.8, tailColor: '#7d7874', tailTuft: '#333', speed: 0.9, graze: 0.25,
    extra: (A, g, neck, head) => {
      for (const sx of [-1, 1]) { const e = mesh(sph(1, 8, 6), '#9c9692', sx * 0.55, 0.05, 0.1, head); e.scale.set(0.08, 0.55, 0.45); e.rotation.y = sx * -0.35; mesh(cone(0.07, 0.55, 6), '#f4efe2', sx * 0.2, -0.38, 0.6, head, false).rotation.x = 2.3; }
      let seg = head; const segs = []; for (let i = 0; i < 5; i++) { const s = new THREE.Group(); s.position.set(0, i === 0 ? -0.15 : -0.28, i === 0 ? 0.62 : 0); s.rotation.x = i === 0 ? -0.25 : 0.12; seg.add(s); mesh(limbDown(0.16 - i * 0.022, 0.15 - i * 0.022, 0.3), '#8f8a86', 0, 0, 0, s, false); seg = s; segs.push(s); }
      A.trunk = segs;
    } }),
  unta: () => quad({ bw: 0.45, bh: 0.5, bl: 0.9, legH: 1.35, legR: 0.08, color: '#c9a26a', hoof: '#8a6d48', neckL: 1.0, neckR: 0.13, neckTilt: 1.05, hw: 0.14, hh: 0.16, hl: 0.36, headTilt: 1.6, tailL: 0.5, tailTuft: '#6a4d2a', speed: 1.1,
    extra: (A, g) => { const h = mesh(sph(0.4, 9, 7), '#c39a60', 0, A.bodyY + 0.45, 0, g); h.scale.set(0.9, 1, 1.1); ear(A.head, -0.08, 0.12, 0.02, 0.045, '#c9a26a'); ear(A.head, 0.08, 0.12, 0.02, 0.045, '#c9a26a'); } }),
  bison: () => quad({ bw: 0.55, bh: 0.6, bl: 1.0, legH: 0.65, legR: 0.12, color: '#5a3b26', hoof: '#222', neckL: 0.2, neckR: 0.35, neckTilt: 1.4, hw: 0.3, hh: 0.32, hl: 0.34, headColor: '#3e2818', headTilt: 1.0, tailL: 0.5, tailTuft: '#2a1a10', speed: 1.1,
    extra: (A, g, neck, head) => { const h = mesh(sph(0.65, 9, 7), '#4a2f1d', 0, A.bodyY + 0.35, 0.45, g); h.scale.set(0.95, 0.9, 0.9); for (const sx of [-1, 1]) { const ho = mesh(cone(0.05, 0.25, 6), '#e9e2d0', sx * 0.3, 0.18, 0.1, head, false); ho.rotation.z = -sx * 1.1; } mesh(sph(0.2, 6, 5), '#2a1a10', 0, -0.3, 0.25, head, false); } }),
  beruang: () => quad({ bw: 0.48, bh: 0.5, bl: 0.75, legH: 0.42, legR: 0.14, color: '#2a211c', neckL: 0.15, neckR: 0.3, neckTilt: 1.1, hw: 0.28, hh: 0.27, hl: 0.28, headTilt: 0.5, speed: 1.0,
    extra: (A, g, neck, head) => { for (const sx of [-1, 1]) mesh(sph(0.08, 6, 5), '#2a211c', sx * 0.2, 0.22, 0.05, head, false); mesh(sph(0.13, 7, 5), '#c9a26a', 0, -0.07, 0.36, head, false); const u = mesh(sph(0.2, 7, 5), '#f0a640', 0, A.bodyY + 0.05, 0.62, g, false); u.scale.set(1, 0.8, 0.4); } }),
  panda: () => quad({ bw: 0.5, bh: 0.5, bl: 0.72, legH: 0.4, legR: 0.15, color: '#f4f2ec', legMat: mat('#1f1f1f'), neckL: 0.12, neckR: 0.3, neckTilt: 1.1, hw: 0.3, hh: 0.28, hl: 0.28, headColor: '#f6f4ef', headTilt: 0.45, speed: 0.6, graze: 0.6,
    extra: (A, g, neck, head) => { const s = mesh(sph(1, 10, 8), '#1f1f1f', 0, A.bodyY, 0.28, g); s.scale.set(0.52, 0.52, 0.3); for (const sx of [-1, 1]) { mesh(sph(0.09, 6, 5), '#1f1f1f', sx * 0.21, 0.23, 0.05, head, false); const p = mesh(sph(0.075, 6, 5), '#1f1f1f', sx * 0.11, 0.04, 0.3, head, false); p.scale.set(0.8, 1.2, 0.5); } mesh(sph(0.05, 5, 4), '#1f1f1f', 0, -0.06, 0.42, head, false); } }),
  kambing: () => quad({ bw: 0.2, bh: 0.24, bl: 0.38, legH: 0.42, legR: 0.04, color: ['#f2efe6', '#8a6a4a', '#dcd2c0'][Math.floor(Math.random() * 3)], hoof: '#333', neckL: 0.22, neckR: 0.08, neckTilt: 0.5, hw: 0.09, hh: 0.1, hl: 0.18, headTilt: 1.1, tailL: 0.1, speed: 1.2,
    extra: (A, g, neck, head) => { for (const sx of [-1, 1]) { const h = mesh(cone(0.025, 0.14, 5), '#7a6a58', sx * 0.04, 0.13, 0.0, head, false); h.rotation.x = -0.5; ear(head, sx * 0.1, 0.05, 0.05, 0.04, A.opt.color); } mesh(cone(0.025, 0.08, 5), '#ccc', 0, -0.1, 0.16, head, false).rotation.x = Math.PI; } }),
  kelinci: () => quad({ bw: 0.14, bh: 0.13, bl: 0.2, legH: 0.06, legR: 0.035, color: ['#ffffff', '#c9a68a', '#8c8c8c'][Math.floor(Math.random() * 3)], neckL: 0.04, neckR: 0.06, neckTilt: 0.3, hw: 0.09, hh: 0.09, hl: 0.1, headTilt: 0.2, speed: 1.4, hop: true,
    extra: (A, g, neck, head) => { for (const sx of [-1, 1]) { const e = mesh(sph(1, 6, 5), A.opt.color, sx * 0.035, 0.14, -0.01, head, false); e.scale.set(0.025, 0.1, 0.012); e.rotation.z = sx * -0.15; } mesh(sph(0.04, 5, 4), '#fff', 0, A.bodyY, -0.2, g, false); } }),
  flamingo: () => {
    const g = new THREE.Group(); const pink = '#f08aa0';
    const body = mesh(sph(1, 10, 8), pink, 0, 1.0, 0, g); body.scale.set(0.2, 0.18, 0.32);
    const legs = [];
    for (const sx of [-0.05, 0.05]) { const l = new THREE.Group(); l.position.set(sx, 0.95, 0); g.add(l); mesh(limbDown(0.018, 0.015, 0.95), '#e06c84', 0, 0, 0, l, false); legs.push(l); }
    const neck = new THREE.Group(); neck.position.set(0, 1.05, 0.25); g.add(neck);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.25, 0.1), new THREE.Vector3(0, 0.45, -0.05), new THREE.Vector3(0, 0.62, 0.05)]);
    mesh(geo('flneck', () => new THREE.TubeGeometry(curve, 10, 0.035, 5)), pink, 0, 0, 0, neck, false);
    const head = new THREE.Group(); head.position.set(0, 0.64, 0.06); neck.add(head);
    mesh(sph(0.06, 7, 5), pink, 0, 0, 0, head, false);
    const bk = mesh(cone(0.03, 0.14, 5), '#222', 0, -0.03, 0.1, head, false); bk.rotation.x = 2.0;
    const tail = new THREE.Group();
    scene.add(g);
    return { group: g, legs, neck, head, tail: null, body, baseNeck: 0, bodyY: 1, opt: { speed: 0.5, graze: 0.9, flamingo: true } };
  }
};
function spawn(kind, encl, n, opt) {
  for (let i = 0; i < n; i++) {
    const A = SPESIES[kind](opt && i === 0);
    const [x, z] = randomIn(ENCL[encl], 2);
    A.group.position.set(x, 0, z); A.yaw = rand(0, 6.28); A.group.rotation.y = A.yaw;
    A.kind = kind; A.encl = ENCL[encl]; A.state = 'idle'; A.timer = rand(0, 4); A.phase = rand(0, 6); A.graze = 0; A.target = null;
    A.speed = A.opt.speed || 1; A.oneLeg = A.opt.flamingo && Math.random() < 0.5;
    animals.push(A);
    addInteract(A.group, 'hewan', kind, 12);
  }
}
spawn('flamingo', 'flamingo', 10);
spawn('gajah', 'gajah', 3);
spawn('singa', 'singa', 3, true);
spawn('unta', 'unta', 3);
spawn('bison', 'bison', 4);
spawn('jerapah', 'jerapah', 4);
spawn('zebra', 'zebra', 6);
spawn('kelinci', 'babyzoo', 5);
spawn('kambing', 'babyzoo', 4);
spawn('harimau', 'harimau', 2);
spawn('beruang', 'beruang', 2);
spawn('panda', 'panda', 2);
// flamingo berdiri di kolam
for (const a of animals) if (a.kind === 'flamingo') { a.encl = { type: 'circle', x: -28, z: 87, r: 6.8 }; const [x, z] = randomIn(a.encl, 1); a.group.position.set(x, 0, z); }

/* ------------------------------------------------------------------ props per area */
const putar = [];
{ // baby zoo hut + jerami
  mesh(box(4, 2.4, 3), '#d9b77e', 66, 1.2, 42, scene);
  mesh(cone(3.4, 1.8, 4), '#9b4a2a', 66, 3.3, 42, scene).rotation.y = Math.PI / 4;
  for (let i = 0; i < 4; i++) mesh(cyl(0.5, 0.5, 0.7, 10), '#e7cf7a', 50 + i * 1.2, 0.35, 27, scene).rotation.z = Math.PI / 2;
}
{ // rekreasi: bianglala, komidi putar, kios jajan
  const bg = new THREE.Group(); bg.position.set(64, 0, -26); scene.add(bg);
  for (const sz of [-1.2, 1.2]) for (const sx of [-1, 1]) { const k = mesh(cyl(0.18, 0.22, 13.5, 6), '#d8d8d8', sx * 3.2, 6.3, sz, bg); k.rotation.z = sx * 0.25; }
  const roda = new THREE.Group(); roda.position.set(0, 12.5, 0); bg.add(roda);
  for (const sz of [-1.1, 1.1]) { const t = mesh(new THREE.TorusGeometry(9, 0.15, 6, 32), '#e8836f', 0, 0, sz, roda, false); }
  const gondola = [];
  const warnaG = ['#f2d14b', '#5aa7dc', '#e8836f', '#6aa64e', '#d98ad6', '#f29b4b', '#5aa7dc', '#f2d14b', '#e8836f', '#6aa64e'];
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const sp = mesh(box(0.12, 9, 0.12), '#eeeeee', Math.cos(a) * 4.5, Math.sin(a) * 4.5, 0, roda, false); sp.rotation.z = a - Math.PI / 2;
    const gd = new THREE.Group(); gd.position.set(Math.cos(a) * 9, Math.sin(a) * 9, 0); roda.add(gd);
    mesh(box(1.4, 1.1, 1.3), warnaG[i], 0, -0.9, 0, gd, false); mesh(box(1.6, 0.12, 1.5), '#ffffff', 0, -0.3, 0, gd, false);
    gondola.push(gd);
  }
  putar.push((dt) => { roda.rotation.z += dt * 0.12; for (const gd of gondola) gd.rotation.z = -roda.rotation.z; });
  addCircle(64 - 3.5, -26, 1.8); addCircle(64 + 3.5, -26, 1.8); addCircle(64, -26, 1.5);
  addInteract(bg, 'landmark', 'bianglala', 14);

  const kp = new THREE.Group(); kp.position.set(46, 0, -14); scene.add(kp);
  mesh(cyl(5, 5.2, 0.5, 18), '#f4e3c3', 0, 0.25, 0, kp);
  mesh(cyl(0.3, 0.3, 4.5, 8), '#d8b34a', 0, 2.5, 0, kp);
  const atap = mesh(cone(5.6, 2.2, 18), '#e8836f', 0, 5.6, 0, kp);
  const pt = new THREE.Group(); kp.add(pt); const kuda = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2; const h = new THREE.Group(); h.position.set(Math.cos(a) * 3.6, 1.2, Math.sin(a) * 3.6); h.rotation.y = -a; pt.add(h);
    mesh(cyl(0.05, 0.05, 3.8, 5), '#d8b34a', 0, 1.6, 0, h, false);
    mesh(box(0.35, 0.5, 1.1), ['#ffffff', '#f2d14b', '#5aa7dc', '#d98ad6'][i % 4], 0, 0.6, 0, h);
    mesh(box(0.3, 0.5, 0.3), ['#ffffff', '#f2d14b', '#5aa7dc', '#d98ad6'][i % 4], 0, 1.0, 0.5, h);
    kuda.push(h);
  }
  putar.push((dt, t) => { pt.rotation.y += dt * 0.5; kuda.forEach((h, i) => h.position.y = 1.2 + Math.sin(t * 2 + i) * 0.25); });
  addCircle(46, -14, 5.3);
  addInteract(kp, 'landmark', 'komidi', 12);

  for (let i = 0; i < 3; i++) {
    const k = new THREE.Group(); k.position.set(40 + i * 7, 0, -36); scene.add(k);
    mesh(box(3, 2.2, 2.2), '#f4e3c3', 0, 1.1, 0, k);
    for (let j = 0; j < 6; j++) mesh(box(0.5, 0.1, 2.8), j % 2 ? '#ffffff' : ['#e8836f', '#5aa7dc', '#6aa64e'][i], -1.25 + j * 0.5, 2.5, 0.4, k, false).rotation.x = -0.25;
    addCircle(40 + i * 7, -36, 1.8); addInteract(k, 'landmark', 'jajan', 6);
    const meja = new THREE.Group(); meja.position.set(40 + i * 7, 0, -30); scene.add(meja);
    mesh(cyl(0.7, 0.7, 0.08, 10), '#ffffff', 0, 0.75, 0, meja); mesh(cyl(0.05, 0.05, 2.4, 5), '#888', 0, 1.2, 0, meja, false); mesh(cone(1.5, 0.6, 8), ['#e8836f', '#5aa7dc', '#6aa64e'][i], 0, 2.5, 0, meja);
    addCircle(40 + i * 7, -30, 0.8);
  }
}
{ // perkemahan
  const warnaT = ['#e8836f', '#5aa7dc', '#f2d14b', '#6aa64e', '#d98ad6'];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, x = -80 + Math.cos(a) * 9, z = -135 + Math.sin(a) * 7;
    const t = mesh(cone(1.7, 2, 4), warnaT[i % 5], x, 1, z, scene); t.rotation.y = a + Math.PI / 4; addCircle(x, z, 1.5);
  }
  const api = new THREE.Group(); api.position.set(-80, 0, -135); scene.add(api);
  for (let i = 0; i < 5; i++) { const k = mesh(cyl(0.08, 0.08, 1.2, 5), '#6b4a2b', 0, 0.15, 0, api); k.rotation.set(Math.PI / 2, i / 5 * Math.PI, 0); }
  const nyala = [mesh(cone(0.35, 0.9, 6), new THREE.MeshLambertMaterial({ color: '#f29b4b', emissive: '#e0601a' }), 0, 0.6, 0, api, false), mesh(cone(0.2, 0.6, 6), new THREE.MeshLambertMaterial({ color: '#f2d14b', emissive: '#e0b01a' }), 0, 0.55, 0, api, false)];
  putar.push((dt, t) => { nyala.forEach((n, i) => { n.scale.y = 1 + Math.sin(t * 13 + i * 2) * 0.18; n.rotation.y = t * (i ? -2 : 3); }); });
  addCircle(-80, -135, 0.8);
  addInteract(api, 'landmark', 'kemah', 12);
}
{ // panda: rumah + bambu
  mesh(box(6, 3, 4), '#c9b28a', -55, 1.5, -193, scene);
  mesh(cone(5, 2, 4), '#3f5a40', -55, 4, -193, scene).rotation.y = Math.PI / 4;
  for (let i = 0; i < 7; i++) {
    const x = -66 + srand() * 22, z = -194 + srand() * 14;
    for (let j = 0; j < 5; j++) { const b = mesh(cyl(0.06, 0.07, 4 + srand() * 2, 5), '#7fae4a', x + srand() * 0.8, 2.2, z + srand() * 0.8, scene); b.rotation.z = (srand() - 0.5) * 0.25; }
  }
  // halte bus
  const h = new THREE.Group(); h.position.set(-20, 0, -152); h.rotation.y = 0.6; scene.add(h);
  mesh(box(4, 0.15, 2), '#e8836f', 0, 2.6, 0, h); for (const sx of [-1.8, 1.8]) mesh(cyl(0.06, 0.06, 2.6, 5), '#666', sx, 1.3, 0.8, h, false);
  mesh(box(3.4, 0.1, 0.6), '#7a5634', 0, 0.5, -0.4, h);
  addCircle(-20, -152, 1.6);
}
{ // batu & bangku di area-area
  const rc = ['#8d887c', '#7d7a72'];
  for (const [k, n] of [['singa', 5], ['harimau', 3], ['beruang', 3], ['zebra', 2], ['bison', 2]]) {
    for (let i = 0; i < n; i++) { const [x, z] = randomIn(ENCL[k], 3); const r = mesh(new THREE.DodecahedronGeometry(1, 0), rc[i % 2], x, 0.4, z, scene); r.scale.set(rand(1, 2.4), rand(0.6, 1.4), rand(1, 2)); }
  }
  for (const [x, z, r] of [[22, 60, 1.6], [16, 0, 1.4], [11, -40, 1.6], [7, -110, 1.6], [4, -180, 0.4], [-6, -185, -0.4]]) {
    const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = r; scene.add(b);
    mesh(box(1.8, 0.1, 0.5), '#8b6440', 0, 0.5, 0, b); mesh(box(1.8, 0.4, 0.08), '#8b6440', 0, 0.8, -0.25, b);
    for (const sx of [-0.75, 0.75]) mesh(box(0.08, 0.5, 0.45), '#333', sx, 0.25, 0, b, false);
    addCircle(x, z, 0.8);
  }
}
// jip safari
const jip = (() => {
  const g = new THREE.Group();
  mesh(box(1.9, 0.9, 3.8), '#e3b23c', 0, 0.85, 0, g);
  mesh(box(1.9, 0.08, 2.4), '#5c4a2a', 0, 2.05, -0.4, g);
  for (const sx of [-0.9, 0.9]) for (const sz of [-1.5, 0.7]) mesh(cyl(0.04, 0.04, 0.8, 4), '#333', sx, 1.65, sz, g, false);
  mesh(box(1.7, 0.6, 0.06), '#d9eef5', 0, 1.6, 1.0, g);
  for (const sx of [-0.95, 0.95]) for (const sz of [-1.2, 1.2]) { const r = mesh(cyl(0.42, 0.42, 0.3, 10), '#222', sx, 0.42, sz, g); r.rotation.z = Math.PI / 2; }
  mesh(cyl(0.4, 0.4, 0.25, 10), '#222', 0, 1.0, -2.0, g).rotation.x = Math.PI / 2;
  scene.add(g);
  addInteract(g, 'landmark', 'jip', 8);
  return { group: g, u: 0.15 };
})();

/* papan nama setiap area */
const ZONES = [
  { id: 'parkir', nama: 'Parkir & Pintu Masuk', x: 30, z: 112, r: 30 },
  { id: 'gerbang', nama: 'Gerbang Masuk', x: 30, z: 86, r: 10 },
  { id: 'flamingo', nama: 'Danau Flamingo', x: -28, z: 87, r: 20, sign: [-14, 74, 0.6] },
  { id: 'gajah', nama: 'Zona Gajah', x: -75, z: 83, r: 22, sign: [-60, 68, 0.2] },
  { id: 'singa', nama: 'Zona Singa', x: -50, z: 28, r: 22, sign: [-32, 38, -1.2] },
  { id: 'unta', nama: 'Zona Unta', x: -125, z: 15, r: 20, sign: [-110, 30, 1.4] },
  { id: 'bison', nama: 'Zona Bison', x: -125, z: -28, r: 20, sign: [-110, -12, 1.4] },
  { id: 'jerapah', nama: 'Zona Jerapah', x: -62, z: -20, r: 22, sign: [-44, -3, -0.8] },
  { id: 'zebra', nama: 'Zona Zebra', x: -80, z: -80, r: 22, sign: [-62, -66, -0.6] },
  { id: 'babyzoo', nama: 'Kebun Binatang Mini', x: 58, z: 35, r: 20, sign: [43, 30, -1.4] },
  { id: 'rekreasi', nama: 'Area Rekreasi', x: 54, z: -20, r: 24, sign: [33, -8, -1.4] },
  { id: 'harimau', nama: 'Zona Harimau', x: 48, z: -72, r: 20, sign: [32, -62, -1.4] },
  { id: 'beruang', nama: 'Zona Beruang Madu', x: -30, z: -98, r: 18, sign: [-15, -91, 1.4] },
  { id: 'kemah', nama: 'Bumi Perkemahan', x: -80, z: -135, r: 18 },
  { id: 'panda', nama: 'Rumah Panda', x: -55, z: -186, r: 20, sign: [-52, -172, 0.2] },
  { id: 'airterjun', nama: 'Air Terjun', x: 0, z: -206, r: 24 },
  { id: 'safari', nama: 'Jalur Safari', x: -55, z: 5, r: 60 },
  { id: 'jalan', nama: 'Jalan Utama', x: 14, z: -40, r: 400 }
];
const SPES_ZONA = { flamingo: 'flamingo', gajah: 'gajah', singa: 'singa', unta: 'unta', bison: 'bison', jerapah: 'jerapah', zebra: 'zebra', babyzoo: 'kelinci', harimau: 'harimau', beruang: 'beruang', panda: 'panda' };
for (const z of ZONES) if (z.sign) { const sp = INFO[SPES_ZONA[z.id]]; papanZona(z.sign[0], z.sign[1], z.sign[2], z.nama.replace('Zona ', ''), sp ? sp.emoji + ' ' + (z.id === 'babyzoo' ? 'kelinci & kambing' : '') : '', z.id); }
papanZona(22, 80, 0, 'Peta Taman', 'Ketuk untuk lihat', 'peta');
addInteract(airTerjunMesh, 'landmark', 'airterjun', 22);

buildGrid();

/* ------------------------------------------------------------------ state */
const player = { x: 30, z: 106, yaw: 0, speed: 0, phase: 0 };
const partner = { x: 30.7, z: 106, phase: 0, speed: 0 };
let camYaw = 0, camPitch = 0.22;
let mode = 'tpp';
try { mode = localStorage.getItem('safari_mode') || 'tpp'; } catch (e) {}
let modeT = mode === 'tpp' ? 1 : 0;
let started = false, paused = false;
const visited = new Set();

/* ------------------------------------------------------------------ input */
const keys = {};
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const look = new Map();
const joyEl = $('joy'), joyBase = $('joy-dasar'), joyKnob = $('joy-tuas');
function placeJoy(x, y) { joyBase.style.left = x + 'px'; joyBase.style.top = y + 'px'; joyBase.style.bottom = 'auto'; joyKnob.style.left = x + 'px'; joyKnob.style.top = y + 'px'; }
function resetJoy() { const h = window.innerHeight; placeJoy(95, h - 120); }
resetJoy();
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (!started || paused) return;
  if (e.code === 'KeyV') toggleMode();
  if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); if (nearest) openInter(nearest); }
  if (e.code === 'KeyM') bukaPeta();
});
addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('pointerdown', e => {
  if (!started || paused) return;
  canvas.setPointerCapture(e.pointerId);
  const isJoy = e.pointerType !== 'mouse' && e.clientX < innerWidth * 0.5 && e.clientY > innerHeight * 0.45 && joy.id === null;
  if (isJoy) { joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0; placeJoy(e.clientX, e.clientY); }
  else look.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 });
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId === joy.id) {
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const d = Math.hypot(dx, dy), R = 55;
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    joy.x = dx / R; joy.y = -dy / R;
    joyKnob.style.left = joy.ox + dx + 'px'; joyKnob.style.top = joy.oy + dy + 'px';
    return;
  }
  const l = look.get(e.pointerId); if (!l) return;
  const dx = e.clientX - l.x, dy = e.clientY - l.y; l.x = e.clientX; l.y = e.clientY; l.moved += Math.abs(dx) + Math.abs(dy);
  const sens = e.pointerType === 'mouse' ? 0.005 : 0.0065;
  camYaw -= dx * sens; camPitch = clamp(camPitch + dy * sens * 0.8, -1.1, 1.15);
});
function endPointer(e) {
  if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; resetJoy(); return; }
  const l = look.get(e.pointerId); if (!l) return; look.delete(e.pointerId);
  if (l.moved < 10 && performance.now() - l.t < 350) tapAt(e.clientX, e.clientY);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', e => e.preventDefault());

const ray = new THREE.Raycaster();
function tapAt(cx, cy) {
  ray.setFromCamera(new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1), camera);
  ray.far = 45;
  const hits = ray.intersectObjects(interactables.map(i => i.obj), true);
  for (const h of hits) {
    let o = h.object; while (o && !o.userData.inter) o = o.parent;
    if (o && o.userData.inter) { if (o.userData.inter.kind === 'pasangan' && modeT < 0.5 && h.distance > 3) continue; openInter(o.userData.inter); return; }
  }
}

/* ------------------------------------------------------------------ UI */
const ui = { zona: $('zona').querySelector('span'), aksi: $('btn-aksi'), gelembung: $('gelembung'), petunjuk: $('petunjuk') };
function setModeLabel() { $('btn-mode').querySelector('b').textContent = mode.toUpperCase(); }
function toggleMode() {
  mode = mode === 'tpp' ? 'fpp' : 'tpp';
  try { localStorage.setItem('safari_mode', mode); } catch (e) {}
  setModeLabel();
  camPitch = mode === 'tpp' ? Math.max(camPitch, 0.18) : clamp(camPitch, -0.2, 0.35);
  hint(mode === 'tpp' ? 'Mode TPP: kamera di belakang kalian berdua' : 'Mode FPP: lihat dari mata kamu, dia menuntunmu');
}
$('btn-mode').onclick = toggleMode;
let hintTimer;
function hint(t, ms = 2600) { ui.petunjuk.textContent = t; ui.petunjuk.classList.remove('sembunyi'); clearTimeout(hintTimer); hintTimer = setTimeout(() => ui.petunjuk.classList.add('sembunyi'), ms); }

let bubbleTimer = 0;
function bicara(t, s = 4) { ui.gelembung.textContent = t; ui.gelembung.classList.remove('sembunyi'); bubbleTimer = s; }
let kataIdx = 0;
$('btn-pasangan').onclick = () => { const k = D.kataPasangan || ['Aku senang jalan sama kamu.']; bicara(k[kataIdx++ % k.length]); };

let kartuAksi = null;
function openInter(it) {
  if (it.kind === 'pasangan') { $('btn-pasangan').onclick(); return; }
  if (it.kind === 'papan' && it.data === 'peta') { bukaPeta(); return; }
  let info, key;
  if (it.kind === 'hewan') { key = it.data; info = INFO[key]; }
  else if (it.kind === 'papan') { key = SPES_ZONA[it.data]; info = INFO[key]; if (!info) return; if (it.data === 'babyzoo') info = { nama: 'Kebun Binatang Mini', emoji: '🐰🐐', fakta: [...INFO.kelinci.fakta, ...INFO.kambing.fakta], makan: true }; }
  else { info = LANDMARK[it.data]; }
  if (!info) return;
  paused = true;
  $('k-emoji').textContent = info.emoji; $('k-judul').textContent = info.nama;
  $('k-isi').innerHTML = '<ul>' + info.fakta.map(f => `<li>${f}</li>`).join('') + '</ul>' + (info.larang ? `<div class="catatan">⚠️ ${info.larang}</div>` : '');
  const btn = $('k-aksi');
  if (info.makan) {
    btn.classList.remove('sembunyi');
    kartuAksi = () => beriMakan(it.kind === 'hewan' ? it.obj : null, it.kind === 'papan' && it.data === 'babyzoo' ? 'kelinci' : key);
  } else { btn.classList.add('sembunyi'); kartuAksi = null; }
  $('kartu').classList.remove('sembunyi');
}
function tutupKartu() { $('kartu').classList.add('sembunyi'); paused = false; }
$('k-tutup').onclick = tutupKartu;
$('k-aksi').onclick = () => { const f = kartuAksi; tutupKartu(); if (f) f(); };

function beriMakan(obj, key) {
  let A = obj ? animals.find(a => a.group === obj) : null;
  const cand = animals.filter(a => a.kind === key || (key === 'kelinci' && a.kind === 'kambing'));
  if (!A) { let best = 1e9; for (const a of cand) { const d = Math.hypot(a.group.position.x - player.x, a.group.position.z - player.z); if (d < best) { best = d; A = a; } } }
  if (!A) return;
  const dPagar = Math.hypot(A.group.position.x - player.x, A.group.position.z - player.z);
  if (dPagar > 40) { hint('Dekati pagarnya dulu ya, lalu beri wortel.'); return; }
  const [tx, tz] = clampIn(A.encl, player.x, player.z, A.kind === 'gajah' || A.kind === 'jerapah' ? 1.6 : 0.9);
  A.state = 'feed'; A.target = [tx, tz]; A.timer = 12;
  hint(`${INFO[A.kind].nama} datang mendekat… 🥕`);
}

function hearts(worldPos, n = 5, emo = '💛') {
  const v = worldPos.clone().project(camera);
  if (v.z > 1) return;
  const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
  for (let i = 0; i < n; i++) {
    const h = document.createElement('div'); h.className = 'hati'; h.textContent = emo;
    h.style.left = x + rand(-30, 30) + 'px'; h.style.top = y + rand(-10, 10) + 'px'; h.style.animationDelay = i * 0.12 + 's';
    document.body.appendChild(h); setTimeout(() => h.remove(), 2200);
  }
}

/* peta */
const W0 = BATAS.x1 - 8, W1 = BATAS.x2 + 8, H0 = BATAS.z1 - 8, H1 = BATAS.z2 + 8, PX = 2.2;
const petaBase = document.createElement('canvas');
petaBase.width = Math.round((W1 - W0) * PX); petaBase.height = Math.round((H1 - H0) * PX);
const wx = x => (x - W0) * PX, wz = z => (z - H0) * PX;
function gambarPeta() {
  const c = petaBase.getContext('2d');
  c.fillStyle = '#86b65a'; c.fillRect(0, 0, petaBase.width, petaBase.height);
  c.fillStyle = '#5f8f4a'; for (const t of treeData) { if (t.x < W0 || t.x > W1 || t.z < H0 || t.z > H1) continue; c.beginPath(); c.arc(wx(t.x), wz(t.z), 2.6 * t.s, 0, 7); c.fill(); }
  c.fillStyle = '#7d7a72'; c.fillRect(wx(-38), wz(-232), 76 * PX, 16 * PX);
  c.fillStyle = '#5fb3c9'; c.beginPath(); c.ellipse(wx(0), wz(-208), 11 * PX, 9 * PX, 0, 0, 7); c.fill();
  c.fillRect(wx(-4.5), wz(-224), 9 * PX, 14 * PX);
  c.fillStyle = '#6f7276'; c.fillRect(wx(-2), wz(101), 64 * PX, 30 * PX);
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const r of mapRoads) { c.strokeStyle = r.color; c.lineWidth = r.w * PX; c.beginPath(); r.pts.forEach((p, i) => i ? c.lineTo(wx(p[0]), wz(p[1])) : c.moveTo(wx(p[0]), wz(p[1]))); c.stroke(); }
  for (const a of mapAreas) {
    c.fillStyle = a.id === 'flamingo' ? '#bfe0c8' : '#d9c08a'; c.strokeStyle = '#7a5634'; c.lineWidth = 2;
    c.beginPath(); if (a.type === 'rect') c.rect(wx(a.x - a.w / 2), wz(a.z - a.d / 2), a.w * PX, a.d * PX); else c.arc(wx(a.x), wz(a.z), a.r * PX, 0, 7);
    c.fill(); c.stroke();
  }
  c.fillStyle = '#5fb3c9'; c.beginPath(); c.ellipse(wx(-28), wz(87), 6.5 * PX, 5 * PX, 0, 0, 7); c.fill();
  c.strokeStyle = '#555'; c.lineWidth = 3; c.beginPath(); c.moveTo(wx(-148), wz(90)); c.lineTo(wx(21), wz(90)); c.moveTo(wx(39), wz(90)); c.lineTo(wx(88), wz(90)); c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const lab = [['🦩', -28, 87], ['🐘', -75, 83], ['🦁', -50, 28], ['🐫', -125, 15], ['🦬', -125, -28], ['🦒', -62, -20], ['🦓', -80, -80], ['🐰', 58, 35], ['🎡', 60, -22], ['🐅', 48, -72], ['🐻', -30, -98], ['⛺', -80, -135], ['🐼', -55, -186], ['💦', 0, -214], ['🅿️', 30, 116], ['🎟️', 30, 90], ['🚙', -100, 40]];
  c.font = `${Math.round(13 * PX)}px system-ui, sans-serif`;
  for (const [e, x, z] of lab) c.fillText(e, wx(x), wz(z));
}
gambarPeta();
const mini = $('minimap'), mctx = mini.getContext('2d');
function gambarMini() {
  const W = mini.width, s = 1.5;
  mctx.save(); mctx.clearRect(0, 0, W, W);
  mctx.beginPath(); mctx.arc(W / 2, W / 2, W / 2, 0, 7); mctx.clip();
  mctx.fillStyle = '#86b65a'; mctx.fillRect(0, 0, W, W);
  mctx.translate(W / 2, W / 2); mctx.scale(s, s);
  mctx.drawImage(petaBase, -wx(player.x), -wz(player.z));
  mctx.restore();
  panah(mctx, W / 2, W / 2, player.yaw, 11);
}
function panah(c, x, y, yaw, r) {
  c.save(); c.translate(x, y); c.rotate(-yaw);
  c.fillStyle = '#ff5e8a'; c.strokeStyle = '#fff'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(0, -r); c.lineTo(r * 0.75, r * 0.8); c.lineTo(0, r * 0.4); c.lineTo(-r * 0.75, r * 0.8); c.closePath(); c.stroke(); c.fill();
  c.restore();
}
const petaK = $('peta-kanvas');
function bukaPeta() {
  paused = true; $('peta').classList.remove('sembunyi');
  petaK.width = petaBase.width; petaK.height = petaBase.height;
  const c = petaK.getContext('2d'); c.drawImage(petaBase, 0, 0);
  panah(c, wx(player.x), wz(player.z), player.yaw, 16);
  petaK.style.maxHeight = (innerHeight - 140) + 'px'; petaK.style.width = 'auto'; petaK.style.maxWidth = '100%'; petaK.style.margin = '0 auto';
}
mini.onclick = bukaPeta;
$('peta-tutup').onclick = () => { $('peta').classList.add('sembunyi'); paused = false; };

/* foto */
$('btn-foto').onclick = () => {
  $('hud').classList.add('sembunyi');
  renderer.render(scene, camera);
  const url = canvas.toDataURL('image/png');
  $('hud').classList.remove('sembunyi');
  $('foto-img').src = url; $('foto-unduh').href = url;
  paused = true; $('hasil-foto').classList.remove('sembunyi');
};
$('foto-tutup').onclick = () => { $('hasil-foto').classList.add('sembunyi'); paused = false; };

/* ------------------------------------------------------------------ audio */
let actx = null, suaraOn = true, airGain = null, master = null;
function initAudio() {
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0.7; master.connect(actx.destination);
    const len = actx.sampleRate * 2, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    airGain = actx.createGain(); airGain.gain.value = 0;
    src.connect(f); f.connect(airGain); airGain.connect(master); src.start();
  } catch (e) { actx = null; }
}
function kicau() {
  if (!actx || !suaraOn) return;
  const t = actx.currentTime, n = 2 + Math.floor(Math.random() * 4), base = rand(2200, 3800);
  for (let i = 0; i < n; i++) {
    const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine';
    const t0 = t + i * rand(0.09, 0.16);
    o.frequency.setValueAtTime(base, t0); o.frequency.exponentialRampToValueAtTime(base * rand(1.2, 1.6), t0 + 0.07);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.05, t0 + 0.02); g.gain.linearRampToValueAtTime(0, t0 + 0.09);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.12);
  }
}
$('btn-suara').onclick = () => { suaraOn = !suaraOn; $('btn-suara').textContent = suaraOn ? '🔊' : '🔈'; if (master) master.gain.value = suaraOn ? 0.7 : 0; };

/* ------------------------------------------------------------------ start */
document.querySelectorAll('.mode').forEach(b => {
  b.classList.toggle('dipilih', b.dataset.mode === mode);
  b.onclick = () => { mode = b.dataset.mode; document.querySelectorAll('.mode').forEach(x => x.classList.toggle('dipilih', x === b)); };
});
if (D.judul) { $('judul').textContent = D.judul; document.title = D.judul; }
if (D.subjudul) $('subjudul').textContent = D.subjudul;
$('memuat').textContent = 'Siap!';
$('btn-mulai').onclick = () => {
  try { localStorage.setItem('safari_mode', mode); } catch (e) {}
  modeT = mode === 'tpp' ? 1 : 0; camPitch = mode === 'tpp' ? 0.22 : 0.1;
  setModeLabel();
  $('mulai').classList.add('sembunyi'); $('hud').classList.remove('sembunyi');
  started = true; initAudio();
  hint('Geser lingkaran kiri bawah untuk jalan · geser layar untuk melihat · ketuk hewan untuk info', 5200);
  setTimeout(() => bicara((D.komentarZona || {}).parkir || 'Yuk jalan!'), 1200);
  visited.add('parkir');
};

/* ------------------------------------------------------------------ update */
const tmpV = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
function aimArm(P, arm, target) {
  P.group.updateMatrixWorld(true);
  tmpC.copy(target); P.group.worldToLocal(tmpC);
  tmpC.sub(arm.pivot.position);
  const d = tmpC.length(); tmpC.normalize();
  arm.pivot.quaternion.setFromUnitVectors(DOWN, tmpC);
  const s = clamp(d / arm.len, 0.55, 1.35);
  arm.inner.scale.y = s; arm.hand.position.y = -arm.len * s;
}
function swingArm(arm, a, side) { arm.pivot.rotation.set(a, 0, side * 0.08); arm.inner.scale.y = 1; arm.hand.position.y = -arm.len; }
function animPerson(P, phase, amt) {
  P.legs[0].rotation.x = Math.sin(phase) * 0.55 * amt;
  P.legs[1].rotation.x = -Math.sin(phase) * 0.55 * amt;
  P.group.position.y = Math.abs(Math.sin(phase)) * 0.035 * amt;
}

let nearest = null, zonaSekarang = '', kicauT = 3;
function update(dt, t) {
  // gerak
  let jx = joy.x, jy = joy.y;
  if (keys.KeyW || keys.ArrowUp) jy = 1; if (keys.KeyS || keys.ArrowDown) jy = -1;
  if (keys.KeyA || keys.ArrowLeft) jx = -1; if (keys.KeyD || keys.ArrowRight) jx = 1;
  let mag = Math.min(1, Math.hypot(jx, jy));
  if (paused || !started) { jx = jy = 0; mag = 0; }
  const fwdX = -Math.sin(camYaw), fwdZ = -Math.cos(camYaw), rtX = Math.cos(camYaw), rtZ = -Math.sin(camYaw);
  let mx = fwdX * jy + rtX * jx, mz = fwdZ * jy + rtZ * jx; const ml = Math.hypot(mx, mz);
  const run = keys.ShiftLeft || keys.ShiftRight;
  const spd = (run ? 6.5 : 4.2) * mag;
  if (ml > 0.01) {
    mx /= ml; mz /= ml;
    player.x += mx * spd * dt; player.z += mz * spd * dt;
    const p = { x: player.x, z: player.z }; resolve(p, 0.38); player.x = p.x; player.z = p.z;
  }
  player.speed = lerp(player.speed, spd, Math.min(1, dt * 8));
  const targetT = mode === 'tpp' ? 1 : 0;
  modeT += clamp(targetT - modeT, -dt * 1.6, dt * 1.6);
  const e = ease(modeT);
  // arah badan
  if (modeT < 0.5 || mode === 'fpp') player.yaw += angDiff(player.yaw, camYaw) * Math.min(1, dt * 10);
  else if (ml > 0.01) player.yaw += angDiff(player.yaw, Math.atan2(-mx, -mz)) * Math.min(1, dt * 7);
  player.phase += player.speed * dt * 2.6;

  kamu.group.position.set(player.x, kamu.group.position.y, player.z);
  kamu.group.rotation.y = player.yaw + Math.PI;
  animPerson(kamu, player.phase, Math.min(1, player.speed / 3));

  // pasangan: di depan-kanan saat FPP (menuntun), di samping saat TPP
  const pf = lerp(1.5, 0.05, e), pr = lerp(0.42, 0.74, e);
  const fX = -Math.sin(player.yaw), fZ = -Math.cos(player.yaw), rX = Math.cos(player.yaw), rZ = -Math.sin(player.yaw);
  const tx = player.x + fX * pf + rX * pr, tz = player.z + fZ * pf + rZ * pr;
  const ox = partner.x, oz = partner.z;
  const k = Math.min(1, dt * 12);
  partner.x = lerp(partner.x, tx, k); partner.z = lerp(partner.z, tz, k);
  const pp = { x: partner.x, z: partner.z }; resolve(pp, 0.3); partner.x = pp.x; partner.z = pp.z;
  partner.speed = lerp(partner.speed, Math.hypot(partner.x - ox, partner.z - oz) / Math.max(dt, 1e-3), Math.min(1, dt * 6));
  partner.phase += partner.speed * dt * 2.3;
  dia.group.position.set(partner.x, dia.group.position.y, partner.z);
  dia.group.rotation.y = player.yaw + Math.PI;
  animPerson(dia, partner.phase, Math.min(1, partner.speed / 3));

  // tangan bergandengan
  kamu.arms[0].pivot.getWorldPosition(tmpA); dia.arms[1].pivot.getWorldPosition(tmpB);
  const hand = tmpV.copy(tmpA).lerp(tmpB, lerp(0.58, 0.5, e));
  hand.y = lerp(1.18, 0.86, e) + Math.sin(player.phase) * 0.02;
  aimArm(kamu, kamu.arms[0], hand); aimArm(dia, dia.arms[1], hand);
  swingArm(kamu.arms[1], -Math.sin(player.phase) * 0.5 * Math.min(1, player.speed / 3), 1);
  swingArm(dia.arms[0], Math.sin(partner.phase) * 0.5 * Math.min(1, partner.speed / 3), -1);
  for (const h of kamu.headParts) h.visible = modeT > 0.35;

  // kamera
  const cp = Math.cos(camPitch);
  const dX = -Math.sin(camYaw) * cp, dY = -Math.sin(camPitch), dZ = -Math.cos(camYaw) * cp;
  const pitchT = clamp(camPitch, -0.35, 1.15);
  const cpt = Math.cos(pitchT), dX2 = -Math.sin(camYaw) * cpt, dY2 = -Math.sin(pitchT), dZ2 = -Math.cos(camYaw) * cpt;
  const eyeX = player.x + fX * 0.13, eyeY = kamu.eye + kamu.group.position.y, eyeZ = player.z + fZ * 0.13;
  const midX = player.x + rX * 0.37, midZ = player.z + rZ * 0.37;
  const dist = 5.2;
  let tX = midX - dX2 * dist, tY = 1.45 - dY2 * dist, tZ = midZ - dZ2 * dist;
  tY = Math.max(0.4, tY);
  camera.position.set(lerp(eyeX, tX, e), lerp(eyeY, tY, e), lerp(eyeZ, tZ, e));
  const lX = lerp(dX, dX2, e), lY = lerp(dY, dY2, e), lZ = lerp(dZ, dZ2, e);
  camera.lookAt(camera.position.x + lX, camera.position.y + lY, camera.position.z + lZ);
  if (mode === 'tpp' && modeT > 0.9) camPitch = clamp(camPitch, -0.35, 1.15);

  // bayangan mengikuti pemain
  sun.position.set(player.x + 40, 70, player.z + 25); sun.target.position.set(player.x, 0, player.z);

  // hewan
  for (const A of animals) updateAnimal(A, dt, t);
  // jip
  {
    const ahead = kurvaSafari.getPointAt((jip.u + 0.006) % 1);
    const blocked = Math.hypot(ahead.x - player.x, ahead.z - player.z) < 5 || Math.hypot(ahead.x - partner.x, ahead.z - partner.z) < 5;
    if (!blocked) jip.u = (jip.u + dt * 4 / kurvaSafari.getLength()) % 1;
    const p = kurvaSafari.getPointAt(jip.u), tg = kurvaSafari.getTangentAt(jip.u);
    jip.group.position.set(p.x - tg.z * 1.6, 0, p.z + tg.x * 1.6);
    jip.group.rotation.y = Math.atan2(tg.x, tg.z);
  }
  for (const f of putar) f(dt, t);
  if (airTerjunMesh) airTerjunMesh.material.map.offset.y += dt * 1.2;
  tAir.offset.x += dt * 0.01; tAir.offset.y += dt * 0.006;
  if (window._buih) window._buih.forEach((b, i) => { b.position.y = 0.3 + Math.abs(Math.sin(t * 3 + i)) * 0.6; });

  // zona & komentar
  let zbest = null, zd = 1e9;
  for (const z of ZONES) { if (z.r > 50) continue; const d = Math.hypot(player.x - z.x, player.z - z.z); if (d < z.r && d / z.r < zd) { zd = d / z.r; zbest = z; } }
  if (!zbest) zbest = Math.hypot(player.x + 55, player.z - 5) < 60 ? ZONES[ZONES.length - 2] : ZONES[ZONES.length - 1];
  if (player.z > 92 && player.x > -5 && player.x < 66) zbest = ZONES[0];
  if (zbest && zbest.id !== zonaSekarang) {
    zonaSekarang = zbest.id; ui.zona.textContent = zbest.nama;
    if (!visited.has(zbest.id)) { visited.add(zbest.id); const km = (D.komentarZona || {})[zbest.id]; if (km && started) bicara(km); }
  }
  // interaksi terdekat
  nearest = null; let nd = 1e9;
  for (const it of interactables) {
    if (it.kind === 'pasangan') continue;
    it.obj.getWorldPosition(tmpA);
    const d = Math.hypot(tmpA.x - player.x, tmpA.z - player.z);
    if (d < it.radius && d < nd) { nd = d; nearest = it; }
  }
  if (nearest && started && !paused) {
    const nm = nearest.kind === 'hewan' ? INFO[nearest.data].nama : nearest.kind === 'papan' ? (nearest.data === 'peta' ? 'Peta' : (ZONES.find(z => z.id === nearest.data) || {}).nama) : LANDMARK[nearest.data].nama;
    ui.aksi.textContent = 'Lihat ' + nm; ui.aksi.classList.remove('sembunyi');
  } else ui.aksi.classList.add('sembunyi');

  // gelembung bicara
  if (bubbleTimer > 0) {
    bubbleTimer -= dt;
    tmpA.set(partner.x, 2.05, partner.z).project(camera);
    if (tmpA.z < 1 && Math.abs(tmpA.x) < 1.1) { ui.gelembung.style.left = clamp((tmpA.x + 1) / 2 * innerWidth, 90, innerWidth - 90) + 'px'; ui.gelembung.style.top = clamp((1 - tmpA.y) / 2 * innerHeight, 80, innerHeight - 40) + 'px'; }
    else { ui.gelembung.style.left = innerWidth / 2 + 'px'; ui.gelembung.style.top = innerHeight * 0.32 + 'px'; ui.gelembung.textContent = ui.gelembung.textContent.replace(/^(?!💬)/, '💬 '); }
    if (bubbleTimer <= 0) ui.gelembung.classList.add('sembunyi');
  }
  // suara
  if (actx && suaraOn) {
    kicauT -= dt; if (kicauT < 0) { kicau(); kicauT = rand(2, 6); }
    const dw = Math.hypot(player.x - AIR_TERJUN.x, player.z - AIR_TERJUN.z);
    airGain.gain.value = clamp(1 - (dw - 12) / 70, 0, 1) * 0.35;
  }
  if (started) gambarMini();
}

function updateAnimal(A, dt, t) {
  const g = A.group; let moving = false;
  if (A.state === 'idle') {
    A.timer -= dt;
    A.graze = lerp(A.graze, A.grazing ? 1 : 0, Math.min(1, dt * 2));
    if (A.timer <= 0) { A.target = randomIn(A.encl, 1.8); A.state = 'walk'; A.grazing = false; }
  }
  if ((A.state === 'walk' || A.state === 'feed') && A.target) {
    const dx = A.target[0] - g.position.x, dz = A.target[1] - g.position.z, d = Math.hypot(dx, dz);
    A.graze = lerp(A.graze, 0, Math.min(1, dt * 3));
    if (d < 0.4) {
      if (A.state === 'feed') { A.state = 'eat'; A.timer = 5; }
      else { A.state = 'idle'; A.timer = rand(2, 7); A.grazing = Math.random() < 0.6; }
    } else {
      const want = Math.atan2(dx, dz);
      A.yaw += angDiff(A.yaw, want) * Math.min(1, dt * 3);
      const sp = A.speed * (A.state === 'feed' ? 1.8 : 1) * clamp(1 - Math.abs(angDiff(A.yaw, want)) / 1.5, 0.15, 1);
      g.position.x += Math.sin(A.yaw) * sp * dt; g.position.z += Math.cos(A.yaw) * sp * dt;
      moving = true;
      if (A.state === 'feed') { A.timer -= dt; if (A.timer < 0) { A.state = 'idle'; A.timer = 1; } }
    }
  }
  if (A.state === 'eat') {
    const want = Math.atan2(player.x - g.position.x, player.z - g.position.z);
    A.yaw += angDiff(A.yaw, want) * Math.min(1, dt * 3);
    A.graze = 0.25 + Math.sin(t * 6) * 0.12;
    A.timer -= dt;
    if (Math.random() < dt * 1.5) { A.head.getWorldPosition(tmpB); hearts(tmpB, 1, Math.random() < 0.5 ? '💛' : '🥕'); }
    if (A.timer <= 0) { A.state = 'idle'; A.timer = rand(2, 5); A.head.getWorldPosition(tmpB); hearts(tmpB, 4, '💛'); hint(`${INFO[A.kind].nama} senang dengan wortelmu!`); }
  }
  g.rotation.y = A.yaw;
  A.phase += dt * (moving ? 6 * Math.max(0.6, A.speed) : 0);
  const amp = moving ? 0.5 : 0;
  if (A.opt.flamingo) {
    A.legs[0].rotation.x = Math.sin(A.phase) * amp;
    A.legs[1].rotation.x = A.oneLeg && !moving ? -1.6 : -Math.sin(A.phase) * amp;
    A.neck.rotation.x = A.graze * 1.9; A.head.rotation.x = A.graze * 0.8;
  } else {
    A.legs[0].rotation.x = Math.sin(A.phase) * amp; A.legs[3].rotation.x = Math.sin(A.phase) * amp;
    A.legs[1].rotation.x = -Math.sin(A.phase) * amp; A.legs[2].rotation.x = -Math.sin(A.phase) * amp;
    const gz = A.opt.graze != null ? A.opt.graze : 1;
    A.neck.rotation.x = A.baseNeck + A.graze * (1.25 - A.baseNeck * 0.4) * gz + Math.sin(t * 1.3 + A.phase) * 0.03;
    if (A.tail) A.tail.rotation.z = Math.sin(t * 3 + A.phase) * 0.35;
    if (A.opt.hop) g.position.y = moving ? Math.abs(Math.sin(A.phase * 1.2)) * 0.18 : 0;
    if (A.trunk) A.trunk.forEach((s, i) => s.rotation.z = Math.sin(t * 1.5 + i * 0.6) * 0.12);
  }
}

/* ------------------------------------------------------------------ loop */
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 72 : 62;
  camera.updateProjectionMatrix();
  if (joy.id === null) resetJoy();
}
addEventListener('resize', resize); resize();
ui.aksi.onclick = () => { if (nearest) openInter(nearest); };

const clock = new THREE.Clock();
let tt = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); tt += dt;
  update(dt, tt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
// intro: kamera memutar perlahan di layar mulai
camYaw = 0;
frame();
window.__safari = { player, setMode: (m) => { mode = m; setModeLabel(); }, get modeT() { return modeT; }, cam: (y, p) => { camYaw = y; camPitch = p; }, tp: (x, z, yaw) => { player.x = x; player.z = z; if (yaw != null) { player.yaw = yaw; camYaw = yaw; } partner.x = x + 0.7; partner.z = z; } };
