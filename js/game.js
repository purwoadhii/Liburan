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

const hemi = new THREE.HemisphereLight('#e8f6ff', '#5d7a3a', 1.6); scene.add(hemi);
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

let langitMat, awanMat, lampuMat; const lampuGedung = [];
/* ------------------------------------------------------------------ ground, sky, hills */
{
  const g = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshLambertMaterial({ map: tGrass }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 12), langitMat = new THREE.MeshBasicMaterial({
    side: THREE.BackSide, fog: false,
    map: tex(8, 256, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5aa7dc'); gr.addColorStop(0.45, '#a9d6ef'); gr.addColorStop(0.55, '#d7ecf0'); gr.addColorStop(1, '#d7ecf0'); c.fillStyle = gr; c.fillRect(0, 0, w, h); })
  }));
  scene.add(sky);
  // awan
  const mAwan = awanMat = new THREE.MeshLambertMaterial({ color: '#ffffff', fog: false, emissive: '#bcd6e6' });
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
const jalurJalan = []; // sampel tiap jalan, untuk pengunjung
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
  if (mapColor && material !== mAspal) jalurJalan.push({ pts: samp, w: width, closed });
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
  [[10, -46], [38, -46], [64, -50]],
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
const LOKET_GRUP = [];
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
    const lk = new THREE.Group(); lk.position.set(30 + sx, 0, gz + 1); scene.add(lk);
    mesh(box(1.8, 1.0, 0.05), '#2a2a2a', 0, 1.6, 1.52, lk, false);
    mesh(box(2.2, 0.12, 0.5), '#8b6440', 0, 1.05, 1.7, lk, false);
    const tl = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshLambertMaterial({ map: textTex(['🎟️ LOKET MASUK'], { w: 512, h: 112, size: 60, bg: '#a44b2c', border: '#f2d14b' }), emissive: '#222' }));
    tl.position.set(0, 2.5, 1.53); lk.add(tl);
    LOKET_GRUP.push(lk);
    mesh(box(4, 2.8, 3), '#efe3c8', 30 + sx, 1.4, gz + 1, scene);
    mesh(cone(3.4, 1.6, 4), '#a44b2c', 30 + sx, 3.6, gz + 1, scene).rotation.y = Math.PI / 4;
    addCircle(30 + sx, gz + 1, 2.4);
  }
  // pagar batas depan

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

// pagar keliling taman: hanya bisa masuk lewat gerbang
fencePath([[-2, 90], [-2, 100], [BATAS.x1 + 1, 100], [BATAS.x1 + 1, BATAS.z1 + 1], [BATAS.x2 - 1, BATAS.z1 + 1], [BATAS.x2 - 1, 90], [37.4, 90]], [], 'tinggi');
fencePath([[-2, 90], [22.6, 90]], [], 'tinggi');
// pagar area air terjun, gerbang di ujung jalan utama (x=0, z=-188)
fencePath([[-4.5, -188], [-36, -188], [-36, -226]], [], 'kayu');
fencePath([[4.5, -188], [36, -188], [36, -226]], [], 'kayu');
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
const AREA_BEBAS = [[13, 71.5, 19], [76, -50, 14], [60, -48, 5], [50, 68, 16], [75, 68, 17], [62, 84, 12], [40, 80, 8], [30, 116, 36], [30, 90, 12], [55, -20, 22], [-80, -135, 16], [0, -208, 15], [-28, -150, 6]];
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
  const lamp = new THREE.InstancedMesh(sph(0.25, 8, 6), lampuMat = new THREE.MeshLambertMaterial({ color: '#fff4c9', emissive: '#7a6a3a' }), n);
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
  kambing: { nama: 'Kambing', emoji: '🐐', fakta: ['Pupil mata kambing berbentuk persegi panjang.', 'Kambing sangat pandai memanjat.'], makan: true },
  makaw: { nama: 'Burung Makaw', emoji: '🦜', fakta: ['Makaw adalah burung paruh bengkok yang besar dan warnanya mencolok.', 'Paruhnya sangat kuat, bisa memecahkan kulit kacang yang keras.', 'Makaw bisa hidup lebih dari 50 tahun.'], larang: 'Burung di sini tidak boleh diberi makan atau disentuh ya.' },
  kakatua: { nama: 'Kakatua', emoji: '🦜', fakta: ['Kakatua punya jambul yang bisa ditegakkan saat senang atau kaget.', 'Banyak jenis kakatua berasal dari Indonesia timur.', 'Kakatua pintar meniru suara.'], larang: 'Jangan memasukkan jari ke dekat paruhnya ya.' },
  lovebird: { nama: 'Lovebird', emoji: '🐦', fakta: ['Lovebird disebut burung cinta karena suka berpasangan dan saling merapikan bulu.', 'Ukurannya kecil, sekitar 15 cm.'], larang: 'Burungnya cukup dilihat saja.' },
  rangkong: { nama: 'Rangkong', emoji: '🐦', fakta: ['Rangkong punya paruh besar dengan tanduk (balung) di atasnya.', 'Rangkong dijuluki petani hutan karena menyebarkan biji buah.', 'Sepasang rangkong biasanya setia seumur hidup.'], larang: 'Rangkong dilindungi, cukup dilihat dan difoto.' },
  merak: { nama: 'Merak', emoji: '🦚', fakta: ['Merak jantan membuka ekornya seperti kipas untuk menarik perhatian betina.', 'Bulu ekornya punya pola seperti mata.'], larang: 'Beri jarak ya, merak bisa kaget.' }
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
function makePerson(cewek, o = {}) {
  const g = new THREE.Group();
  const skin = o.kulit || (cewek ? '#f1c7a5' : '#d9a57d');
  const P = { group: g, legs: [], arms: [], headParts: [], cewek, hip: cewek ? 0.8 : 0.9 };
  if (cewek) {
    const baju = o.baju || D.bajuKamu || '#e8836f';
    for (const sx of [-0.085, 0.085]) {
      const leg = new THREE.Group(); leg.position.set(sx, 0.8, 0); g.add(leg);
      mesh(limbDown(0.055, 0.045, 0.76), o.celana || skin, 0, 0, 0, leg);
      mesh(box(0.11, 0.07, 0.2), '#f4f1ea', 0, -0.77, 0.03, leg);
      P.legs.push(leg);
    }
    mesh(cyl(0.16, 0.34, 0.52, 10), baju, 0, 0.87, 0, g);
    mesh(cyl(0.135, 0.165, 0.27, 10), baju, 0, 1.24, 0, g);
    mesh(cyl(0.05, 0.05, 0.1, 6), skin, 0, 1.4, 0, g);
    const head = new THREE.Group(); head.position.set(0, 1.53, 0); g.add(head); P.headParts.push(head);
    mesh(sph(0.14, 12, 10), skin, 0, 0, 0, head);
    for (const sx of [-0.05, 0.05]) { mesh(sph(0.018, 6, 4), '#2a1d16', sx, 0.005, 0.128, head, false); mesh(sph(0.025, 6, 4), '#f2a7a0', sx * 1.6, -0.04, 0.11, head, false); }
    const hair = mesh(sph(0.152, 12, 10), o.rambut || '#3b2417', 0, 0.025, -0.02, head); hair.scale.set(1, 0.95, 1.02);
    const ekor = mesh(sph(1, 10, 8), o.rambut || '#3b2417', 0, -0.12, -0.09, head); ekor.scale.set(0.15, 0.24, 0.08);
    if (!o.npc) {
      const topi = new THREE.Group(); head.add(topi); P.topi = topi;
      mesh(cyl(0.3, 0.3, 0.02, 16), '#e9d29a', 0, 0.1, 0, topi);
      mesh(cyl(0.135, 0.15, 0.11, 12), '#e9d29a', 0, 0.16, 0, topi);
      mesh(cyl(0.152, 0.152, 0.035, 12), '#d65f5f', 0, 0.125, 0, topi, false);
    }
    P.arms.push(makeArm(g, -0.19, 1.34, 0.56, baju, skin, 0.042));
    P.arms.push(makeArm(g, 0.19, 1.34, 0.56, baju, skin, 0.042));
    P.eye = 1.55;
  } else {
    const baju = o.baju || D.bajuPasangan || '#4f7d6b', celana = o.celana || D.celanaPasangan || '#c9b28a';
    for (const sx of [-0.1, 0.1]) {
      const leg = new THREE.Group(); leg.position.set(sx, 0.9, 0); g.add(leg);
      mesh(limbDown(0.075, 0.062, 0.86), celana, 0, 0, 0, leg);
      mesh(box(0.13, 0.08, 0.26), '#3a3330', 0, -0.87, 0.04, leg);
      P.legs.push(leg);
    }
    mesh(cyl(0.2, 0.175, 0.6, 10), baju, 0, 1.18, 0, g);
    mesh(cyl(0.205, 0.205, 0.1, 10), celana, 0, 0.9, 0, g);
    mesh(cyl(0.06, 0.06, 0.1, 6), skin, 0, 1.52, 0, g);
    const head = new THREE.Group(); head.position.set(0, 1.67, 0); g.add(head); P.headParts.push(head);
    mesh(sph(0.15, 12, 10), skin, 0, 0, 0, head);
    for (const sx of [-0.055, 0.055]) mesh(sph(0.019, 6, 4), '#2a1d16', sx, 0.01, 0.138, head, false);
    const hair = mesh(sph(0.158, 12, 10), o.rambut || '#221712', 0, 0.045, -0.025, head); hair.scale.set(1.02, 0.8, 1.02);
    mesh(box(0.06, 0.012, 0.012), '#5a3b2a', 0, -0.06, 0.145, head, false);
    P.arms.push(makeArm(g, -0.25, 1.44, 0.62, baju, skin, 0.05));
    P.arms.push(makeArm(g, 0.25, 1.44, 0.62, baju, skin, 0.05));
    P.eye = 1.68;
  }
  g.traverse(m => { if (m.isMesh) m.castShadow = !o.npc; });
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
spawn('kelinci', 'babyzoo', 7);
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
{ // rekreasi: kios jajan (bianglala & komidi putar pindah ke taman bermain)

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
/* ---------- taman bermain (dekat food court): bianglala, roller coaster, histeria, komidi putar ---------- */
const TB = { x1: 2, x2: 24.5, z1: 55.5, z2: 87.5 };
const WAHANA = {};
{
  const tPaving2 = tex(128, 128, (c, w, h) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { c.fillStyle = (x + y) % 2 ? '#f3d9e4' : '#f8eadf'; c.fillRect(x * 32, y * 32, 32, 32); } }, [11, 16]);
  const lt = new THREE.Mesh(new THREE.PlaneGeometry(TB.x2 - TB.x1, TB.z2 - TB.z1), new THREE.MeshLambertMaterial({ map: tPaving2, polygonOffset: true, polygonOffsetFactor: -2 }));
  lt.rotation.x = -Math.PI / 2; lt.position.set((TB.x1 + TB.x2) / 2, 0.04, (TB.z1 + TB.z2) / 2); lt.receiveShadow = true; scene.add(lt);
  // gapura masuk dari jalan utama
  const gp = new THREE.Group(); gp.position.set(25.2, 0, 70); gp.rotation.y = Math.PI / 2; scene.add(gp);
  for (const sx of [-2.6, 2.6]) { mesh(cyl(0.22, 0.26, 4.6, 8), '#e8836f', sx, 2.3, 0, gp); mesh(sph(0.36, 8, 6), '#f2d14b', sx, 4.75, 0, gp); }
  const pp = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.1), new THREE.MeshLambertMaterial({ map: textTex(['🎢 TAMAN BERMAIN'], { w: 640, h: 130, size: 64, bg: '#d64579', border: '#f2d14b' }), side: THREE.DoubleSide }));
  pp.position.set(0, 4.1, 0); gp.add(pp);
  addCircle(25.2, 67.4, 0.3); addCircle(25.2, 72.6, 0.3);
}

// ---- bianglala ----
{
  const W = WAHANA.bianglala = { id: 'bianglala', nama: 'Bianglala', emoji: '🎡', x: 6, z: 70 };
  const bg = new THREE.Group(); bg.position.set(W.x, 0, W.z); bg.rotation.y = Math.PI / 2; scene.add(bg);
  for (const sz of [-1.5, 1.5]) for (const sx of [-1, 1]) { const k = mesh(cyl(0.2, 0.24, 13.8, 6), '#d8d8d8', sx * 3.3, 6.4, sz, bg); k.rotation.z = sx * 0.25; }
  mesh(box(9, 0.3, 4), '#9aa3ad', 0, 0.15, 0, bg);
  const roda = new THREE.Group(); roda.position.set(0, 13, 0); bg.add(roda);
  for (const sz of [-1.3, 1.3]) mesh(new THREE.TorusGeometry(9, 0.16, 6, 36), '#e8836f', 0, 0, sz, roda, false);
  mesh(cyl(0.5, 0.5, 3, 10), '#cccccc', 0, 0, 0, roda, false).rotation.x = Math.PI / 2;
  const warnaG = ['#f2d14b', '#5aa7dc', '#e8836f', '#6aa64e', '#d98ad6', '#f29b4b', '#5aa7dc', '#f2d14b', '#e8836f', '#6aa64e'];
  W.gondola = [];
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const sp = mesh(box(0.12, 9, 0.12), '#eeeeee', Math.cos(a) * 4.5, Math.sin(a) * 4.5, 0, roda, false); sp.rotation.z = a - Math.PI / 2;
    const gd = new THREE.Group(); gd.position.set(Math.cos(a) * 9, Math.sin(a) * 9, 0); roda.add(gd);
    mesh(box(0.1, 0.5, 0.1), '#888', 0, -0.25, 0, gd, false);
    mesh(box(1.7, 0.12, 1.5), '#ffffff', 0, -0.45, 0, gd, false);                       // atap
    for (const cx of [-0.8, 0.8]) for (const cz of [-0.68, 0.68]) mesh(box(0.06, 1.75, 0.06), '#eeeeee', cx, -1.35, cz, gd, false);
    mesh(box(1.7, 0.1, 1.5), warnaG[i], 0, -2.25, 0, gd, false);                        // lantai
    mesh(box(1.7, 0.55, 0.06), warnaG[i], 0, -1.95, 0.72, gd, false); mesh(box(1.7, 0.55, 0.06), warnaG[i], 0, -1.95, -0.72, gd, false);
    mesh(box(0.06, 0.55, 1.5), warnaG[i], -0.83, -1.95, 0, gd, false); mesh(box(0.06, 0.55, 1.5), warnaG[i], 0.83, -1.95, 0, gd, false);
    mesh(box(1.4, 0.08, 0.4), '#8b6440', 0, -1.78, -0.45, gd, false);                    // bangku
    W.gondola.push({ g: gd, a });
  }
  W.roda = roda; W.bg = bg; W.kecepatan = 0.11;
  putar.push((dt) => { roda.rotation.z += dt * W.kecepatan; for (const o of W.gondola) o.g.rotation.z = -roda.rotation.z; });
  addCircle(W.x, W.z - 3.4, 1.6); addCircle(W.x, W.z + 3.4, 1.6); addCircle(W.x, W.z, 1.4);
  W.pintu = [W.x + 2.6, W.z];
  // gondola paling bawah (sudut -90°)
  W.bawah = () => { let best = null, bd = 9; for (const o of W.gondola) { const d = Math.abs(angDiff(o.a + roda.rotation.z, -Math.PI / 2)); if (d < bd) { bd = d; best = o; } } return { o: best, d: bd }; };
  W.bisaNaik = () => W.bawah().d < 0.05;
  W.naik = () => { const b = W.bawah(); W.pakai = b.o; W.mulaiRot = roda.rotation.z; };
  W.kursi = (out) => {
    const g = W.pakai.g; g.updateMatrixWorld(true);
    tmpC.set(-0.32, -1.74, -0.45); g.localToWorld(tmpC); out.a = [tmpC.x, tmpC.z, tmpC.y];
    tmpC.set(0.32, -1.74, -0.45); g.localToWorld(tmpC); out.b = [tmpC.x, tmpC.z, tmpC.y];
    out.yaw = -Math.PI / 2;
  };
  W.selesai = () => roda.rotation.z - W.mulaiRot > Math.PI * 2 - 0.02;
  W.durasi = 'satu putaran penuh';
}

// ---- komidi putar ----
{
  const W = WAHANA.komidi = { id: 'komidi', nama: 'Komidi Putar', emoji: '🎠', x: 15, z: 78.5 };
  const kp = new THREE.Group(); kp.position.set(W.x, 0, W.z); scene.add(kp);
  mesh(cyl(5, 5.2, 0.5, 18), '#f4e3c3', 0, 0.25, 0, kp);
  mesh(cyl(0.3, 0.3, 4.5, 8), '#d8b34a', 0, 2.5, 0, kp);
  mesh(cone(5.6, 2.2, 18), '#e8836f', 0, 5.6, 0, kp);
  const pt = new THREE.Group(); kp.add(pt); W.kuda = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2; const h = new THREE.Group(); h.position.set(Math.cos(a) * 3.6, 0.9, Math.sin(a) * 3.6); h.rotation.y = -a; pt.add(h);
    mesh(cyl(0.05, 0.05, 4.2, 5), '#d8b34a', 0, 1.6, 0, h, false);
    const w = ['#ffffff', '#f2d14b', '#5aa7dc', '#d98ad6'][i % 4];
    mesh(box(0.35, 0.45, 1.1), w, 0, 0.6, 0, h); mesh(box(0.3, 0.5, 0.3), w, 0, 1.0, 0.5, h);
    for (const lz of [-0.4, 0.4]) for (const lx of [-0.12, 0.12]) mesh(box(0.08, 0.45, 0.08), w, lx, 0.2, lz, h, false);
    W.kuda.push(h);
  }
  W.pt = pt; W.putaran = 0.5;
  putar.push((dt, t) => { pt.rotation.y += dt * W.putaran; W.kuda.forEach((h, i) => h.position.y = 0.9 + Math.sin(t * 2 + i * 1.3) * 0.25); });
  addCircle(W.x, W.z, 5.3);
  W.pintu = [W.x + 4, W.z - 4.3];
  W.bisaNaik = () => true;
  W.naik = () => { W.t0 = performance.now(); W.i = 0; };
  W.kursi = (out) => {
    for (const [k, i] of [['a', W.i], ['b', W.i + 1]]) { const h = W.kuda[i]; h.updateMatrixWorld(true); tmpC.set(0, 0.83, -0.05); h.localToWorld(tmpC); out[k] = [tmpC.x, tmpC.z, tmpC.y]; }
    W.kuda[W.i].getWorldQuaternion(_q); tmpC.set(0, 0, 1).applyQuaternion(_q); out.yaw = Math.atan2(tmpC.x, tmpC.z) - Math.PI;
    out.ngangkang = true;
  };
  W.selesai = () => performance.now() - W.t0 > 45000;
  W.durasi = 'sekitar 45 detik';
}
const _q = new THREE.Quaternion();

// ---- histeria (menara jatuh) ----
{
  const W = WAHANA.histeria = { id: 'histeria', nama: 'Histeria', emoji: '🗼', x: 16.5, z: 63.5 };
  const g = new THREE.Group(); g.position.set(W.x, 0, W.z); scene.add(g);
  mesh(cyl(1.6, 1.9, 0.5, 14), '#9aa3ad', 0, 0.25, 0, g);
  mesh(cyl(0.7, 0.8, 30, 10), '#5aa7dc', 0, 15, 0, g);
  for (let i = 0; i < 10; i++) mesh(cyl(0.75, 0.75, 0.25, 10), i % 2 ? '#ffffff' : '#e8836f', 0, 3 + i * 2.8, 0, g, false);
  mesh(cone(1.2, 1.6, 10), '#d64579', 0, 30.8, 0, g);
  const kereta = new THREE.Group(); g.add(kereta); W.kursiList = [];
  mesh(cyl(2.2, 2.2, 0.45, 18), '#f2d14b', 0, 0, 0, kereta, false);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2; const s = new THREE.Group(); s.position.set(Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4); s.rotation.y = Math.atan2(Math.cos(a), Math.sin(a)); kereta.add(s);
    mesh(box(0.55, 0.9, 0.1), '#d64579', 0, 0.35, -0.25, s, false); mesh(box(0.55, 0.1, 0.45), '#d64579', 0, -0.1, 0, s, false);
    const bar = mesh(new THREE.TorusGeometry(0.22, 0.04, 5, 10, Math.PI), '#ffffff', 0, 0.55, 0.05, s, false); bar.rotation.y = Math.PI / 2;
    W.kursiList.push(s);
  }
  W.kereta = kereta; W.siklus = 46;
  // tinggi kereta sepanjang satu siklus (detik): diam, naik pelan, tahan, jatuh, memantul, turun, diam
  W.tinggi = (s) => {
    const k = [[0, 0.6], [9, 0.6], [19, 24], [22, 24], [23.3, 5], [24.8, 13], [26.2, 4], [27.6, 9], [29.2, 3], [32, 0.6], [46, 0.6]];
    for (let i = 1; i < k.length; i++) if (s <= k[i][0]) { const [t0, y0] = k[i - 1], [t1, y1] = k[i]; let u = (s - t0) / (t1 - t0); u = y1 < y0 && y0 - y1 > 10 ? u * u : u * u * (3 - 2 * u); return lerp(y0, y1, u); }
    return 0.6;
  };
  W.fase = () => (performance.now() / 1000) % W.siklus;
  putar.push(() => { kereta.position.y = W.tinggi(W.fase()) + 0.5; });
  addCircle(W.x, W.z, 3.3);
  W.pintu = [W.x + 3.9, W.z + 0.3];
  W.bisaNaik = () => { const f = W.fase(); return f < 6 || f > 34; };
  W.naik = () => { W.sudahNaik = false; };
  W.kursi = (out) => {
    for (const [k, i] of [['a', 0], ['b', 11]]) { const s = W.kursiList[i]; s.updateMatrixWorld(true); tmpC.set(0, -0.05, 0); s.localToWorld(tmpC); out[k] = [tmpC.x, tmpC.z, tmpC.y]; }
    out.yaw = -Math.PI / 2 - Math.PI / 12;
  };
  W.selesai = () => { const f = W.fase(); if (f > 9 && f < 30) W.sudahNaik = true; return W.sudahNaik && f > 33; };
  W.durasi = 'satu kali naik-jatuh';
  W.kameraDepan = true;
  W.teriak = () => { const f = W.fase(); return f > 22.2 && f < 22.6; };
}

// ---- roller coaster ----
{
  const W = WAHANA.roller = { id: 'roller', nama: 'Roller Coaster', emoji: '🎢' };
  const titik = [[9, 1.7, 57.6], [14, 1.7, 57.6], [19, 3.8, 58.4], [22.6, 9, 61.5], [23.4, 15, 66.5], [23.2, 7.5, 72.5], [22.4, 3.6, 77], [21, 9, 83], [16, 12, 86.2], [9, 7.5, 85.8], [4, 3.8, 80.5], [2.6, 9.5, 72.5], [3, 6, 64.5], [5, 3.2, 59.4]];
  const kurva = new THREE.CatmullRomCurve3(titik.map(p => new THREE.Vector3(p[0], p[1], p[2])), true, 'catmullrom', 0.4);
  W.kurva = kurva; W.L = kurva.getLength();
  // rel: 2 pipa + bantalan + tiang
  const N = 360, rel = [[], []];
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = kurva.getPointAt(u % 1), tg = kurva.getTangentAt(u % 1);
    const sx = -tg.z, sz = tg.x, l = Math.hypot(sx, sz) || 1;
    rel[0].push(new THREE.Vector3(p.x + sx / l * 0.45, p.y, p.z + sz / l * 0.45)); rel[1].push(new THREE.Vector3(p.x - sx / l * 0.45, p.y, p.z - sz / l * 0.45));
  }
  for (const r of rel) scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(r, true), 360, 0.07, 5, true), mat('#d64545')));
  const nB = 180, bantal = new THREE.InstancedMesh(box(1.1, 0.08, 0.18), mat('#555555'), nB), m4 = new THREE.Matrix4(), o3 = new THREE.Object3D();
  for (let i = 0; i < nB; i++) { const u = i / nB, p = kurva.getPointAt(u); o3.position.copy(p).y -= 0.08; o3.lookAt(p.clone().add(kurva.getTangentAt(u))); o3.updateMatrix(); bantal.setMatrixAt(i, o3.matrix); }
  scene.add(bantal);
  const tiang = [];
  for (let i = 0; i < 46; i++) { const p = kurva.getPointAt(i / 46); if (p.y > 2.2) tiang.push(p); }
  const tg2 = new THREE.InstancedMesh(cyl(0.12, 0.15, 1, 6), mat('#f2f2f2'), tiang.length);
  tiang.forEach((p, i) => { o3.position.set(p.x, (p.y - 0.15) / 2, p.z); o3.rotation.set(0, 0, 0); o3.scale.set(1, p.y - 0.15, 1); o3.updateMatrix(); tg2.setMatrixAt(i, o3.matrix); addCircle(p.x, p.z, 0.2); });
  scene.add(tg2);
  // stasiun
  const st = new THREE.Group(); st.position.set(11.5, 0, 59.2); scene.add(st);
  mesh(box(7.5, 1.4, 2.2), '#c9b79a', 0, 0.7, 0, st);
  for (const sx of [-3.5, 3.5]) for (const sz of [-1.4, 1.4]) mesh(cyl(0.1, 0.1, 3.6, 6), '#e8836f', sx, 2.8, sz - 1.4, st, false);
  mesh(box(8.2, 0.2, 4.2), '#d64579', 0, 4.6, -1.4, st);
  const sp = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.8), new THREE.MeshLambertMaterial({ map: textTex(['🎢 ROLLER COASTER'], { w: 640, h: 112, size: 56, bg: '#2f5d3a', border: '#f2d14b' }), side: THREE.DoubleSide }));
  sp.position.set(0, 5.2, 0.6); st.add(sp);
  for (let k = 0; k < 3; k++) { const s = mesh(box(0.9, 0.2, 0.3), '#8b6440', -1.5 + k * 1.5, 1.5, 0.95, st, false); s.rotation.x = 0; }
  addCircle(9, 59.2, 1.2); addCircle(11.5, 59.2, 1.2); addCircle(14, 59.2, 1.2);
  // kereta: 3 gerbong, kalian di gerbong depan
  const warna = ['#d64545', '#f2d14b', '#5aa7dc'];
  W.gerbong = warna.map((w, i) => {
    const g = new THREE.Group(); scene.add(g);
    mesh(box(1.2, 0.36, 1.5), w, 0, 0.2, 0, g, false);
    mesh(box(1.2, 0.6, 0.12), w, 0, 0.62, -0.7, g, false);
    if (i === 0) { const d = mesh(box(1.2, 0.2, 0.4), w, 0, 0.3, 0.85, g, false); }
    for (const sx of [-0.3, 0.3]) { const b = mesh(new THREE.TorusGeometry(0.14, 0.03, 5, 10, Math.PI), '#ffffff', sx, 0.48, 0.3, g, false); b.rotation.x = -0.4; }
    return g;
  });
  const u0 = 0.0;
  let uTop = 0, yTop = 0; for (let k = 0; k < 400; k++) { const y = kurva.getPointAt(k / 400).y; if (k / 400 < 0.5 && y > yTop) { yTop = y; uTop = k / 400; } }
  W.u = u0; W.v = 0; W.status = 'stasiun'; W.tunggu = 8; W.uTop = uTop; W.yTop = yTop;
  const jarak = 1.75 / W.L;
  putar.push((dt) => {
    if (W.status === 'stasiun') { W.v = 0; W.tunggu -= dt; if (W.tunggu <= 0) { W.status = 'jalan'; W.mulaiU = W.u; W.putaranSelesai = false; } }
    else {
      const y = kurva.getPointAt(W.u).y;
      if (W.u < W.uTop) W.v = lerp(W.v, W.u < 0.05 ? 3 : 2.6, dt * 2);
      else W.v = Math.max(4, Math.sqrt(Math.max(0, 2.6 * 2.6 + 2 * 9.8 * (W.yTop - y))) * 0.9);
      if (W.u > 0.93) W.v = Math.min(W.v, lerp(2, 9, (1 - W.u) / 0.07));
      W.u += W.v * dt / W.L;
      if (W.u >= 1) { W.u = 0; W.status = 'stasiun'; W.tunggu = 9; W.putaranSelesai = true; }
    }
    W.gerbong.forEach((g, i) => {
      const u = ((W.u - i * jarak) % 1 + 1) % 1, p = kurva.getPointAt(u), tg = kurva.getTangentAt(u);
      g.position.copy(p); g.lookAt(p.x + tg.x, p.y + tg.y, p.z + tg.z);
    });
  });
  W.pintu = [11.5, 61.2];
  W.bisaNaik = () => W.status === 'stasiun' && W.tunggu > 1.5;
  W.naik = () => { W.tunggu = Math.max(W.tunggu, 3); W.putaranSelesai = false; };
  W.kursi = (out) => {
    const g = W.gerbong[0]; g.updateMatrixWorld(true);
    tmpC.set(0.3, 0.42, -0.15); g.localToWorld(tmpC); out.a = [tmpC.x, tmpC.z, tmpC.y];
    tmpC.set(-0.3, 0.42, -0.15); g.localToWorld(tmpC); out.b = [tmpC.x, tmpC.z, tmpC.y];
    const tg = kurva.getTangentAt(W.u); out.yaw = Math.atan2(tg.x, tg.z) - Math.PI; out.miring = Math.asin(clamp(tg.y, -1, 1));
  };
  W.selesai = () => W.putaranSelesai;
  W.durasi = 'satu putaran';
  W.teriak = () => W.u > W.uTop + 0.005 && W.u < W.uTop + 0.03;
}
for (const id in WAHANA) {
  const W = WAHANA[id];
  const o = new THREE.Object3D(); o.position.set(W.pintu[0], 1, W.pintu[1]); scene.add(o);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2, 1.4), new THREE.MeshBasicMaterial({ visible: false })); o.add(hit);
  // papan loket kecil di pintu wahana
  const pl = new THREE.Group(); pl.position.set(W.pintu[0], 0, W.pintu[1]); scene.add(pl);
  mesh(cyl(0.05, 0.05, 1.6, 5), '#555', 0, 0.8, 0, pl, false);
  const pm = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.55), new THREE.MeshLambertMaterial({ map: textTex([W.emoji + ' ' + W.nama.toUpperCase(), fmtRpAwal(hargaWahana(id)) + '/orang'], { w: 420, h: 180, size: 44, size2: 34, bg: '#2f5d3a', border: '#f2d14b' }), side: THREE.DoubleSide }));
  pm.position.set(0, 1.7, 0); pl.add(pm); pl.lookAt(TB.x2 + 10, 0, W.pintu[1]);
  const it = addInteract(o, 'wahana', id, 4.5); it.label = `${W.emoji} Naik ${W.nama}`;
}
function hargaWahana(id) { const h = (D.hargaWahana || {})[id]; return h != null ? h : ({ bianglala: 20000, roller: 35000, histeria: 30000, komidi: 15000 })[id] || 20000; }
function fmtRpAwal(n) { return 'Rp' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

let NAIK_W = null;
function tawarWahana(id) {
  const W = WAHANA[id], h = hargaWahana(id);
  if (NAIK_W) { hint(NAIK_W.tunggu ? 'Kalian sedang menunggu giliran naik.' : 'Kalian sedang naik wahana.'); return; }
  kartu(W.emoji, W.nama, `<p style="text-align:center">Tiket ${fmtRp(h)} per orang.<br>Untuk berdua: <b>${fmtRp(h * 2)}</b></p><div class="catatan">Lama main: ${W.durasi}. 💰 Uang kalian: ${fmtRp(DOMPET.sisa)}</div>`, 'Naik ' + fmtRp(h * 2), () => {
    if (!bayar(h * 2)) { hint(`Uangnya nggak cukup. Tiket ${W.nama} ${fmtRp(h)} per orang.`, 3500); return; }
    NAIK_W = { W, tunggu: true, sejak: performance.now() };
    if (!W.bisaNaik()) hint(id === 'roller' ? 'Tiket dibayar. Tunggu keretanya kembali ke stasiun ya 🎢' : id === 'histeria' ? 'Tiket dibayar. Tunggu sampai kursinya turun ya.' : 'Tiket dibayar. Tunggu giliran gondola berikutnya.', 4000);
  });
  $('k-tutup').textContent = 'Nanti dulu';
}
function naikWahana() {
  const W = NAIK_W.W; NAIK_W.tunggu = false; NAIK_W.yawLama = null;
  W.naik();
  const k = {}; W.kursi(k);
  duduk = { wahana: W, a: [k.a[0], k.a[1]], b: [k.b[0], k.b[1]], yaw: k.yaw, h: k.a[2] - 0.46, sejak: 0, ngangkang: k.ngangkang };
  tampilBerdiri(false); BALIK.sisa = 0; LIHAT.x = 0;
  camYaw = k.yaw + (W.kameraDepan && mode === 'tpp' ? Math.PI : 0); camPitch = mode === 'tpp' ? 0.25 : 0.05;
  const kata = { bianglala: 'Dari atas nanti kelihatan seluruh taman.', roller: 'Pegang tanganku yang kuat ya! 😆', histeria: 'Aduh, deg-degan… tapi seru!', komidi: 'Kayak anak kecil lagi, tapi seru!' }[W.id];
  hint(`Kalian naik ${W.nama}! 🎉`, 3000); setTimeout(() => bicara(kata, 4), 700);
}
function turunWahana() {
  const W = NAIK_W.W; NAIK_W = null; duduk = null;
  kamu.group.position.y = 0; dia.group.position.y = 0;
  player.x = W.pintu[0] + 0.6; player.z = W.pintu[1] + 0.6; partner.x = player.x + 0.7; partner.z = player.z;
  hint(`Seru! Selesai naik ${W.nama}.`, 3000);
  setTimeout(() => bicara(pick(['Lagi yuk! Eh, tapi coba yang lain juga.', 'Seru banget! Makasih ya sudah nemenin.', 'Kakiku masih gemetar, hehe.'])), 800);
}
putar.push((dt) => {
  const N = NAIK_W; if (!N) return;
  if (N.tunggu) {
    if (Math.hypot(N.W.pintu[0] - player.x, N.W.pintu[1] - player.z) > 25) { NAIK_W = null; hint('Kalian meninggalkan antrean wahana.', 3000); return; }
    if (N.W.bisaNaik() && !paused && !duduk) naikWahana();
    return;
  }
  if (!duduk || duduk.wahana !== N.W) { NAIK_W = null; return; }
  const k = {}; N.W.kursi(k);
  duduk.a = [k.a[0], k.a[1]]; duduk.b = [k.b[0], k.b[1]]; duduk.h = k.a[2] - 0.46;
  if (N.yawLama != null) camYaw += angDiff(N.yawLama, k.yaw);
  N.yawLama = k.yaw; duduk.yaw = k.yaw;
  if (N.W.kameraDepan) camYaw += angDiff(camYaw, k.yaw + (modeT > 0.5 ? Math.PI : 0)) * Math.min(1, dt * 3);
  if (mode === 'fpp' && k.miring != null) camPitch = lerp(camPitch, clamp(-k.miring * 0.9, -0.6, 0.9), Math.min(1, dt * 4));
  if (N.W.teriak && N.W.teriak() && !N.teriak) { N.teriak = true; tmpB.set(player.x, kamu.group.position.y + 1.8, player.z); hearts(tmpB, 6, pick(['😱', '🙀', '😆'])); bicara('Aaaaa! 😱', 2.5); }
  if (N.W.teriak && !N.W.teriak()) N.teriak = false;
  if (N.W.selesai()) turunWahana();
});
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
// tiga jip safari terbuka: bisa dinaiki di halte
const KACA_JIP = new THREE.MeshLambertMaterial({ color: '#d9eef5', transparent: true, opacity: 0.25, depthWrite: false });
function buatJip(warna, no) {
  const g = new THREE.Group();
  mesh(box(1.9, 0.5, 3.8), warna, 0, 0.65, 0, g);
  for (const sx of [-0.92, 0.92]) mesh(box(0.08, 0.5, 3.0), warna, sx, 1.15, -0.4, g, false);
  mesh(box(1.9, 0.5, 0.08), warna, 0, 1.15, -1.9, g, false);
  mesh(box(1.9, 0.55, 1.0), warna, 0, 1.17, 1.4, g, false);
  for (const z of [-0.9, 0.35]) { mesh(box(1.7, 0.16, 0.55), '#6b4a2b', 0, 1.02, z, g, false); mesh(box(1.7, z > 0 ? 0.3 : 0.5, 0.1), '#6b4a2b', 0, z > 0 ? 1.2 : 1.3, z - 0.3, g, false); }
  mesh(box(1.9, 0.08, 3.0), '#5c4a2a', 0, 2.62, -0.35, g);
  for (const sx of [-0.9, 0.9]) for (const sz of [-1.8, 0.85]) mesh(cyl(0.04, 0.04, 1.5, 4), '#333', sx, 1.9, sz, g, false);
  mesh(box(1.7, 0.45, 0.04), KACA_JIP, 0, 1.7, 0.9, g, false);
  for (const sx of [-0.95, 0.95]) for (const sz of [-1.2, 1.2]) { const r = mesh(cyl(0.42, 0.42, 0.3, 10), '#222', sx, 0.42, sz, g); r.rotation.z = Math.PI / 2; }
  mesh(cyl(0.4, 0.4, 0.25, 10), '#222', 0, 0.95, -2.05, g).rotation.x = Math.PI / 2;
  const nomor = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), new THREE.MeshLambertMaterial({ map: textTex(['SAFARI ' + no], { w: 256, h: 84, size: 48, bg: '#ffffff', border: '#26302a' }) }));
  for (const sx of [-1, 1]) { const n = nomor.clone(); n.position.set(sx * 0.97, 1.15, -0.4); n.rotation.y = sx * Math.PI / 2; g.add(n); }
  scene.add(g);
  addInteract(g, 'landmark', 'jip', 8);
  return g;
}
function supirJip(g) {
  const N = buatNpc([0, 0], { cewek: false, baju: '#c9b28a', celana: '#5a4a3a' });
  npcs.splice(npcs.indexOf(N), 1); scene.remove(N.P.group); g.add(N.P.group);
  N.P.group.position.set(-0.45, 1.1 - N.P.hip, 0.35);
  for (const l of N.P.legs) l.rotation.x = -1.45;
  for (const a of N.P.arms) swingArm(a, -1.0, 1);
}
const JIP = [['#e3b23c', 1], ['#6aa64e', 2], ['#e8836f', 3]].map(([w, no], i) => ({ group: buatJip(w, no), no, i, tunda: 0, u: 0, berhenti: -1 }));
const jip = JIP[0];
setTimeout(() => JIP.forEach(J => supirJip(J.group)), 0);

/* ------------------------------------------------------------------ food court & bioskop */
const F = window.FILM || { daftar: [] };
const GEDUNG = [];
let duduk = null, distCam = 5.2;
const npcs = [];
const atapList = [];
const WARNA_BAJU = ['#5aa7dc', '#e8836f', '#6aa64e', '#f2d14b', '#d98ad6', '#ffffff', '#3b3b46', '#c95b5b', '#7a6ad0', '#f29b4b', '#2f7f7a'];
const WARNA_CELANA = ['#2f3a4f', '#3b3b46', '#c9b28a', '#5a4a3a', '#7d8a99'];
const WARNA_RAMBUT = ['#221712', '#3b2417', '#1a1a1a', '#5a3b2a'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// gabungkan banyak bagian tubuh jadi satu mesh berwarna (lebih ringan di HP)
const mVertex = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4(), _c = new THREE.Color();
function gabung(meshes, ke) {
  if (!meshes.length) return null;
  ke.updateMatrixWorld(true); _inv.copy(ke.matrixWorld).invert();
  const pos = [], nor = [], col = [];
  for (const m of meshes) {
    m.updateMatrixWorld(true); _rel.multiplyMatrices(_inv, m.matrixWorld);
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(_rel);
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    _c.copy(m.material.color);
    for (let i = 0; i < pa.length; i++) { pos.push(pa[i]); nor.push(na[i]); }
    for (let i = 0; i < pa.length / 3; i++) col.push(_c.r, _c.g, _c.b);
    g.dispose();
    m.parent.remove(m);
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const out = new THREE.Mesh(bg, mVertex); ke.add(out);
  return out;
}
function ringankan(P) {
  P.group.updateMatrixWorld(true);
  for (const leg of P.legs) gabung(leg.children.filter(c => c.isMesh), leg);
  for (const a of P.arms) { gabung([...a.inner.children.filter(c => c.isMesh), a.hand], a.pivot); a.hand = new THREE.Object3D(); }
  for (const h of P.headParts) { const ms = []; h.traverse(o => { if (o.isMesh) ms.push(o); }); gabung(ms, h); }
  gabung(P.group.children.filter(c => c.isMesh), P.group);
}
function buatNpc(posisi, opsi = {}) {
  const cewek = opsi.cewek != null ? opsi.cewek : Math.random() < 0.5;
  const P = makePerson(cewek, { npc: true, ...opsi, baju: opsi.baju || pick(WARNA_BAJU), celana: opsi.celana || (cewek ? (Math.random() < 0.5 ? null : pick(WARNA_CELANA)) : pick(WARNA_CELANA)), rambut: pick(WARNA_RAMBUT), kulit: pick(['#f1c7a5', '#d9a57d', '#c68e64', '#e8b98f']) });
  ringankan(P);
  P.group.position.set(posisi[0], 0, posisi[1]);
  for (const a of P.arms) swingArm(a, 0, 1);
  const N = { P, x: posisi[0], z: posisi[1], yaw: 0, jalur: [], phase: Math.random() * 6, duduk: false, speed: rand(1.1, 1.5) };
  npcs.push(N);
  return N;
}
function npcDuduk(N, x, z, yaw) { N.duduk = true; N.x = x; N.z = z; N.yaw = yaw; }

function dinding(x1, z1, x2, z2, h, warna, tebal = 0.3) {
  const L = Math.hypot(x2 - x1, z2 - z1);
  const w = mesh(box(L, h, tebal), warna, (x1 + x2) / 2, h / 2, (z1 + z2) / 2, scene);
  w.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  addSeg(x1, z1, x2, z2);
  return w;
}
function gedung(id, x1, z1, x2, z2, h, warnaLuar, pintu, lantai, judul) {
  // pintu = [xa, xb] di dinding selatan (z2)
  const G0 = { id, x1, z1, x2, z2, h };
  dinding(x1, z1, x2, z1, h, warnaLuar);
  dinding(x1, z1, x1, z2, h, warnaLuar);
  dinding(x2, z1, x2, z2, h, warnaLuar);
  dinding(x1, z2, pintu[0], z2, h, warnaLuar);
  dinding(pintu[1], z2, x2, z2, h, warnaLuar);
  mesh(box(pintu[1] - pintu[0], h - 3.2, 0.3), warnaLuar, (pintu[0] + pintu[1]) / 2, 3.2 + (h - 3.2) / 2, z2, scene);
  const lt = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), new THREE.MeshLambertMaterial({ map: lantai, polygonOffset: true, polygonOffsetFactor: -3 }));
  lt.rotation.x = -Math.PI / 2; lt.position.set((x1 + x2) / 2, 0.06, (z1 + z2) / 2); lt.receiveShadow = true; scene.add(lt);
  const atap = new THREE.Group(); scene.add(atap);
  mesh(box(x2 - x1 + 1.2, 0.5, z2 - z1 + 1.2), '#8c8378', (x1 + x2) / 2, h + 0.25, (z1 + z2) / 2, atap);
  G0.atap = atap;
  const papan = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(12, (x2 - x1) * 0.7), 2), new THREE.MeshLambertMaterial({ map: textTex(judul, { w: 1024, h: 180, size: 96, size2: 40, bg: '#2f3a33', border: '#f2d14b' }), emissive: '#222' }));
  papan.position.set((x1 + x2) / 2, h - 1.3, z2 + 0.2); scene.add(papan);
  GEDUNG.push(G0);
  return G0;
}
function gedungDalam(x, z) { for (const b of GEDUNG) if (x > b.x1 && x < b.x2 && z > b.z1 && z < b.z2) return b; return null; }

const tLantaiFC = tex(128, 128, (c, w, h) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { c.fillStyle = (x + y) % 2 ? '#e9e2d4' : '#d8cdb8'; c.fillRect(x * 32, y * 32, 32, 32); } }, [12, 10]);
const tKarpet = tex(128, 128, (c, w, h) => { noiseFill(c, w, h, '#5a2430', ['#4a1c26', '#6a2c38', '#7a3a2a'], 600, [1, 3]); }, [8, 8]);

/* plaza & jalan menuju */
{
  const tP2 = tPaving.clone(); tP2.wrapS = tP2.wrapT = THREE.RepeatWrapping; tP2.repeat.set(12, 2); tP2.needsUpdate = true;
  const pz = new THREE.Mesh(new THREE.PlaneGeometry(50, 9), new THREE.MeshLambertMaterial({ map: tP2, polygonOffset: true, polygonOffsetFactor: -2 }));
  pz.rotation.x = -Math.PI / 2; pz.position.set(62, 0.045, 84.5); pz.receiveShadow = true; scene.add(pz);
}
ribbon([[30, 80], [36, 83], [40, 84]], 4.6, 0.025, mTepi);
ribbon([[30, 80], [36, 83], [40, 84]], 3.6, 0.045, mPaving, false, '#e6d3a8');

/* ---------- food court ---------- */
const KIOS = [
  { nama: 'Nasi Goreng', emoji: '🍳', warna: '#e8836f', menu: [['Nasi Goreng Spesial', 28], ['Nasi Goreng Seafood', 32], ['Nasi Goreng Kambing', 35], ['Kwetiau Goreng', 27], ['Mie Goreng Jawa', 25], ['Capcay Kuah', 26]] },
  { nama: 'Bakso', emoji: '🍜', warna: '#c95b5b', menu: [['Bakso Urat', 25], ['Bakso Beranak', 35], ['Bakso Mercon', 28], ['Mie Bakso', 27], ['Bihun Bakso', 25], ['Bakso Goreng', 15]] },
  { nama: 'Sate', emoji: '🍢', warna: '#f29b4b', menu: [['Sate Ayam (10 tusuk)', 30], ['Sate Kambing', 40], ['Sate Taichan', 28], ['Sate Padang', 32], ['Lontong', 6], ['Nasi Putih', 6]] },
  { nama: 'Mie Ayam', emoji: '🍜', warna: '#f2d14b', menu: [['Mie Ayam', 22], ['Mie Ayam Jamur', 25], ['Mie Ayam Bakso', 28], ['Mie Yamin', 24], ['Pangsit Goreng', 10], ['Pangsit Kuah', 12]] },
  { nama: 'Soto', emoji: '🥣', warna: '#e3b23c', menu: [['Soto Ayam', 24], ['Soto Betawi', 32], ['Soto Lamongan', 26], ['Rawon', 30], ['Sop Buntut', 45], ['Nasi Putih', 6]] },
  { nama: 'Ayam Geprek', emoji: '🍗', warna: '#d64545', menu: [['Ayam Geprek Sambal Bawang', 25], ['Ayam Geprek Keju', 30], ['Ayam Bakar Madu', 32], ['Ayam Penyet', 27], ['Tahu Tempe', 8], ['Es Teh', 6]] },
  { nama: 'Dimsum', emoji: '🥟', warna: '#6aa64e', menu: [['Siomay Ayam', 20], ['Hakau Udang', 24], ['Lumpia Kulit Tahu', 22], ['Ceker Ayam', 18], ['Bakpao Coklat', 15], ['Mantao Goreng', 16]] },
  { nama: 'Pempek', emoji: '🐟', warna: '#5aa7dc', menu: [['Pempek Kapal Selam', 22], ['Pempek Lenjer', 18], ['Pempek Adaan', 18], ['Pempek Kulit', 16], ['Tekwan', 20], ['Model', 22]] },
  { nama: 'Martabak', emoji: '🥞', warna: '#a0522d', menu: [['Martabak Manis Coklat Keju', 35], ['Martabak Manis Pandan', 38], ['Martabak Telur', 32], ['Martabak Mini', 15], ['Roti Bakar', 20], ['Pisang Bakar', 18]] },
  { nama: 'Masakan Jepang', emoji: '🍣', warna: '#d98ad6', menu: [['Ramen', 38], ['Sushi Roll', 35], ['Chicken Katsu', 33], ['Beef Teriyaki', 42], ['Takoyaki', 22], ['Ocha', 8]] },
  { nama: 'Kopi & Teh', emoji: '☕', warna: '#7a5634', menu: [['Es Kopi Susu', 20], ['Kopi Hitam', 12], ['Cappuccino', 25], ['Teh Tarik', 15], ['Es Teh Manis', 8], ['Coklat Panas', 18]] },
  { nama: 'Es Krim & Jus', emoji: '🍦', warna: '#2f7f7a', menu: [['Es Krim 2 Rasa', 18], ['Jus Alpukat', 20], ['Jus Mangga', 18], ['Es Campur', 18], ['Es Kelapa Muda', 15], ['Smoothie Stroberi', 22]] }
];
// harga paling murah per porsi (data.js hargaMakananMin), harga dalam ribuan
for (const k of KIOS) for (const m of k.menu) m[1] = Math.max(Math.round((D.hargaMakananMin || 15000) / 1000), m[1]);
const MEJA = [];
let pesanan = [];
{
  const fc = gedung('foodcourt', 38, 58, 62, 78, 6, '#efe3c8', [45, 55], tLantaiFC, ['FOOD COURT', 'Banyak pilihan makanan']);
  // kios: 6 di utara, 3 di barat, 3 di timur
  const slot = [];
  for (let i = 0; i < 6; i++) slot.push([40.6 + i * 3.75, 59.6, 0]);
  for (let i = 0; i < 3; i++) slot.push([39.6, 63.5 + i * 4.2, Math.PI / 2]);
  for (let i = 0; i < 3; i++) slot.push([60.4, 63.5 + i * 4.2, -Math.PI / 2]);
  KIOS.forEach((k, i) => {
    const [x, z, r] = slot[i];
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; scene.add(g);
    mesh(box(3.4, 1.05, 0.7), '#f8f4ea', 0, 0.52, 0.9, g);
    mesh(box(3.5, 0.08, 0.85), k.warna, 0, 1.08, 0.9, g);
    mesh(box(3.5, 3.2, 0.2), '#d8cdb8', 0, 1.6, -0.4, g);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.9), new THREE.MeshLambertMaterial({ map: textTex([k.emoji + ' ' + k.nama], { w: 512, h: 140, size: 58, bg: k.warna, border: '#ffffff' }), emissive: '#333' }));
    sign.position.set(0, 2.85, -0.28); g.add(sign);
    for (let j = 0; j < 7; j++) { const aw = mesh(box(0.5, 0.06, 1), j % 2 ? '#ffffff' : k.warna, -1.5 + j * 0.5, 2.25, 0.2, g, false); aw.rotation.x = 0.35; }
    for (let j = 0; j < 3; j++) mesh(cyl(0.16, 0.12, 0.12, 8), ['#ffffff', '#f2d14b', '#e8836f'][j], -0.9 + j * 0.9, 1.18, 0.9, g, false);
    const koki = buatNpc([0, 0]); g.add(koki.P.group); koki.P.group.position.set(0, 0, 0.1); koki.diam = true; koki.local = true;
    // tabrakan konter
    const c = Math.cos(r), sn = Math.sin(r);
    const wp = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
    const a = wp(-1.75, 1.3), b = wp(1.75, 1.3); addSeg(a[0], a[1], b[0], b[1]);
    const it = addInteract(g, 'kios', i, 3.6); it.label = 'Pesan di ' + k.nama; it.pusat = wp(0, 1.8); k.depan = wp(0, 2.1); k.posisi = [x, z];
  });
  // meja
  for (const tx of [43.5, 50, 56.5]) for (const tz of [65.5, 70, 74.5]) {
    const g = new THREE.Group(); g.position.set(tx, 0, tz); scene.add(g);
    mesh(box(1.8, 0.08, 1.0), '#8b6440', 0, 0.76, 0, g); mesh(cyl(0.08, 0.1, 0.74, 6), '#555', 0, 0.37, 0, g, false);
    for (const [cx, cz] of [[-0.45, 0.85], [0.45, 0.85], [-0.45, -0.85], [0.45, -0.85]]) {
      mesh(box(0.5, 0.06, 0.5), '#c95b5b', cx, 0.46, cz, g, false); mesh(box(0.5, 0.55, 0.06), '#c95b5b', cx, 0.75, cz + Math.sign(cz) * 0.24, g, false);
      mesh(cyl(0.04, 0.04, 0.44, 5), '#555', cx, 0.22, cz, g, false);
    }
    addCircle(tx - 0.5, tz, 0.55); addCircle(tx + 0.5, tz, 0.55);
    const m = { x: tx, z: tz, g, makanan: [], kursiU: [{ x: tx - 0.45, z: tz - 0.85, n: null }, { x: tx + 0.45, z: tz - 0.85, n: null }] };
    MEJA.push(m);
    const it = addInteract(g, 'meja', m, 2.4); it.label = 'Duduk di sini';
  }
  // pengunjung yang sedang makan
  MEJA.forEach((m, i) => {
    for (const k of m.kursiU) if (Math.random() < 0.3) { const N = npcGedung(buatNpc([k.x, k.z]), 'fc'); npcDuduk(N, k.x, k.z, Math.PI); N.makan = true; N.makanSisa = rand(10, 70); N.kursiFC = k; k.n = N; }
    if (i === 4) return;
    if (Math.random() < 0.1) { m.penuh = true; for (const sx of [-0.45, 0.45]) { const N = npcGedung(buatNpc([m.x + sx, m.z + 0.85]), 'fc'); npcDuduk(N, m.x + sx, m.z + 0.85, 0); N.makan = true; } }
    if (Math.random() < 0.5) mesh(cyl(0.16, 0.12, 0.1, 8), '#f8f4ea', m.x, 0.85, m.z - 0.2, scene, false);
  });
  // pengunjung yang berjalan di dalam
  for (let i = 0; i < 2; i++) { const N = npcGedung(buatNpc([rand(44, 56), rand(63, 76)]), 'fc'); N.keliling = fc; }
}

/* ---------- bioskop ---------- */
const BIOS = { x1: 64, z1: 56, x2: 86, z2: 80, kursi: [], film: null, video: null, status: 'kosong', penonton: [] };
{
  gedung('bioskop', 64, 56, 86, 80, 8, '#3a3550', [65, 69.5], tKarpet, ['BIOSKOP', 'Film pilihan hari ini']);
  // layar
  const bingkai = mesh(box(18.6, 8.2, 0.3), '#111', 76, 4.6, 56.4, scene, false);
  BIOS.layarMat = new THREE.MeshBasicMaterial({ color: '#ffffff', map: textTex(['Pilih film di loket', '🎬'], { w: 1024, h: 440, size: 80, size2: 120, bg: '#1d1d26', border: '#1d1d26' }) });
  BIOS.layar = new THREE.Mesh(new THREE.PlaneGeometry(18, 7.6), BIOS.layarMat);
  BIOS.layar.position.set(76, 4.6, 56.6); scene.add(BIOS.layar);
  // kursi
  const rows = [63.5, 66, 68.5, 71, 73.5];
  const xs = []; for (let x = 69; x <= 84.7; x += 1.3) xs.push(+x.toFixed(2));
  const n = rows.length * xs.length;
  const dudukan = new THREE.InstancedMesh(box(1.1, 0.45, 0.8), mat('#a3262f'), n);
  const sandaran = new THREE.InstancedMesh(box(1.1, 0.6, 0.16), mat('#a3262f'), n);
  const m4 = new THREE.Matrix4(); let i = 0;
  rows.forEach((z, r) => {
    const h = r * 0.32;
    if (h > 0) mesh(box(17.4, h, 2.5), '#4a1c26', 77, h / 2, z + 0.2, scene, false);
    for (const x of xs) {
      m4.makeTranslation(x, 0.23 + h, z); dudukan.setMatrixAt(i, m4);
      m4.makeTranslation(x, 0.62 + h, z + 0.38); sandaran.setMatrixAt(i, m4); i++;
      BIOS.kursi.push({ x, z, h, terisi: false });
    }
  });
  scene.add(dudukan, sandaran);
  for (const z of rows) addSeg(68.4, z + 0.5, 85.6, z + 0.5);
  BIOS.rows = rows; BIOS.xs = xs;
  // loket di depan
  const lk = new THREE.Group(); lk.position.set(72.5, 0, 83); scene.add(lk);
  mesh(box(3, 1.2, 1), '#3a3550', 0, 0.6, 0, lk);
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshLambertMaterial({ map: textTex(['🎟️ Loket Film', 'Ketuk untuk pilih'], { w: 512, h: 340, size: 62, size2: 40, bg: '#a3262f', border: '#f2d14b' }), emissive: '#333' }));
  poster.position.set(0, 2.2, 0.06); lk.add(poster); mesh(box(2.6, 1.8, 0.1), '#222', 0, 2.2, 0, lk, false);
  addCircle(72.5, 83, 1.5);
  const it = addInteract(lk, 'bioskop', null, 4); it.label = '🎟️ Pilih film';
  const it2 = addInteract(BIOS.layar, 'bioskop', null, 0); it2.label = '🎬 Pilih film';
}


/* ---------- antrean kios & loket, keramaian ---------- */
const ANTRIAN = [];
const FC_PINTU = [50, 79.2];
let antriPemain = null;
function buatAntrian(pos, dir, jenis, data, target) {
  const q = { pos, dir, jenis, data, list: [], layan: 0, target, dasar: target, waktuLayan: rand(3.5, 6) };
  ANTRIAN.push(q); return q;
}
const slotAntri = (q, n) => [q.pos[0] + q.dir[0] * n * 0.95, q.pos[1] + q.dir[1] * n * 0.95];
const arahAntri = (q) => Math.atan2(q.dir[0], q.dir[1]);
function npcGedung(N, id) { N.gedung = id; return N; }
function kursiKosong() {
  const bebas = [];
  for (const m of MEJA) for (const k of m.kursiU) if (!k.n) bebas.push(k);
  return bebas.length ? pick(bebas) : null;
}
function tambahKeAntrian(q, N) {
  q.list.push(N); N.antri = q; N.jalur = []; N.diamT = 0;
}
function spawnAntri(q) {
  let N;
  if (q.jenis === 'kios') { N = npcGedung(buatNpc([FC_PINTU[0] + rand(-3, 3), 82]), 'fc'); N.x = FC_PINTU[0] + rand(-3, 3); N.z = 82; }
  else if (q.jenis === 'masuk') { const x = rand(8, 52); N = buatNpc([x, 120]); N.x = x; N.z = 120; }
  else { N = npcGedung(buatNpc([rand(52, 84), 88.6]), 'bios'); }
  N.speed = rand(1.2, 1.6);
  tambahKeAntrian(q, N);
}
function selesaiLayan(q, N) {
  q.list.shift(); N.antri = null; q.layan = 0; q.waktuLayan = rand(3.5, 6.5);
  if (q.jenis === 'kios') {
    const k = kursiKosong();
    if (k && Math.random() < 0.8) {
      k.n = N; N.kursiFC = k;
      N.jalur = [[N.x, k.z - 1.3], [k.x, k.z - 1.3], [k.x, k.z]];
      N.onArrive = () => { npcDuduk(N, k.x, k.z, Math.PI); N.makan = true; N.makanSisa = rand(25, 50); };
    } else { N.jalur = [FC_PINTU, [rand(40, 85), 88]]; N.pergi = true; }
  } else if (q.jenis === 'masuk') {
    N.jalur = [[q.pos[0], 96], [30, 96], [30, 86], [30 + rand(-2, 2), 72], [26 + rand(-2, 2), 40]]; N.pergi = true;
  } else {
    N.jalur = [[67.3, 82], [67.3, 77]]; N.pergi = true;
  }
}
function updateAntrian(dt) {
  for (const q of ANTRIAN) {
    if (Math.hypot(q.pos[0] - player.x, q.pos[1] - player.z) > 45) continue;
    const npcN = q.list.filter(m => m !== 'pemain').length;
    if (npcN < q.target && Math.random() < dt * 0.25) spawnAntri(q);
    if (npcN > q.target + 1 && q.list.length && q.list[q.list.length - 1] !== 'pemain' && Math.random() < dt * 0.05) { const N = q.list.pop(); N.antri = null; N.jalur = q.jenis === 'kios' ? [FC_PINTU, [rand(40, 85), 88]] : q.jenis === 'masuk' ? [[rand(8, 52), 120]] : [[rand(52, 84), 89]]; N.pergi = true; }
    q.list.forEach((m, idx) => {
      if (m === 'pemain') return;
      const [tx, tz] = slotAntri(q, idx);
      const d = Math.hypot(tx - m.x, tz - m.z);
      if (d > 0.2) { if (!m.jalur.length || Math.hypot(m.jalur[m.jalur.length - 1][0] - tx, m.jalur[m.jalur.length - 1][1] - tz) > 0.1) m.jalur = [[tx, tz]]; }
      else { m.jalur = []; m.yaw += angDiff(m.yaw, arahAntri(q)) * 0.2; }
    });
    const depan = q.list[0];
    if (!depan) continue;
    const [fx, fz] = slotAntri(q, 0);
    const siap = depan === 'pemain' ? Math.hypot(player.x - fx, player.z - fz) < 0.35 : Math.hypot(depan.x - fx, depan.z - fz) < 0.3;
    if (!siap) continue;
    q.layan += dt;
    if (depan === 'pemain') {
      if (q.layan > 1.2 && !antriPemain.dilayani) {
        antriPemain.dilayani = true;
        if (q.jenis === 'kios') bukaKios(q.data); else if (q.jenis === 'masuk') bukaTiketMasuk(); else bukaFilm();
      }
    } else if (q.layan > q.waktuLayan) selesaiLayan(q, depan);
  }
}
function tawarAntri(q, langsung, judul) {
  const di = q.list.filter(m => m !== 'pemain').length;
  if (!di) { langsung(); return; }
  kartu('🧍', judul, `<p style="text-align:center">Ada <b>${di} orang</b> sedang antre.<br>Mau ikut antre? Kalian akan maju sendiri setiap ada tempat kosong di depan, dan bisa keluar antrean kapan saja.</p>`, 'Antri', () => masukAntrian(q));
  $('k-tutup').textContent = 'Nanti saja';
}
function masukAntrian(q) {
  const di = q.list.filter(m => m !== 'pemain').length;
  if (!di) return false;
  q.list.push('pemain'); antriPemain = { q, dilayani: false };
  hint(`Antre dulu ya, ada ${di} orang di depan kalian.`, 3200);
  setTimeout(() => bicara(pick(['Nggak apa-apa antre, yang penting sama kamu.', 'Ramai banget ya. Kita antre bareng.', 'Sabar ya, sebentar lagi giliran kita.'])), 1400);
  $('btn-antri').classList.remove('sembunyi');
  $('btn-antri').textContent = 'Keluar antrean';
  return true;
}
function keluarAntrian() {
  if (!antriPemain) return;
  const q = antriPemain.q, i = q.list.indexOf('pemain');
  if (i >= 0) q.list.splice(i, 1);
  if (i === 0) q.layan = 0;
  antriPemain = null; $('btn-antri').classList.add('sembunyi');
}
function gerakAntri(dt) {
  const q = antriPemain.q, idx = q.list.indexOf('pemain');
  const [tx, tz] = slotAntri(q, idx);
  const dx = tx - player.x, dz = tz - player.z, d = Math.hypot(dx, dz);
  if (d > 0.05) { const st = Math.min(d, 2 * dt); player.x += dx / d * st; player.z += dz / d * st; }
  player.yaw += angDiff(player.yaw, arahAntri(q)) * Math.min(1, dt * 6);
  return d > 0.05 ? 2 : 0;
}
// antrean tiap kios & loket tiket
KIOS.forEach((k, i) => {
  const dx = k.depan[0] - k.posisi[0], dz = k.depan[1] - k.posisi[1], L = Math.hypot(dx, dz);
  k.antrian = buatAntrian(k.depan, [dx / L, dz / L], 'kios', i, Math.random() < 0.5 ? 1 : (Math.random() < 0.6 ? 0 : 2));
  for (let n = 0; n < k.antrian.target; n++) { const [x, z] = slotAntri(k.antrian, n); const N = npcGedung(buatNpc([x, z]), 'fc'); N.x = x; N.z = z; N.yaw = arahAntri(k.antrian); tambahKeAntrian(k.antrian, N); }
});
BIOS.antrian = buatAntrian([72.5, 84.7], [0, 1], 'tiket', null, 2);
for (let n = 0; n < 2; n++) { const [x, z] = slotAntri(BIOS.antrian, n); const N = npcGedung(buatNpc([x, z]), 'bios'); N.x = x; N.z = z; tambahKeAntrian(BIOS.antrian, N); }
// antrean loket masuk: ramai saat taman baru buka dan siang hari
const LOKET_MASUK = [0, 1].map(i => { const q = buatAntrian([i ? 42 : 18, 93.6], [0, 1], 'masuk', i, 4); q.ramaiFn = h => clamp(Math.exp(-((h - 9) ** 2) / 1.6) + 0.7 * Math.exp(-((h - 13.5) ** 2) / 2) + 0.15, 0, 1) * (h < 7.5 || h > 17 ? 0.1 : 1); return q; });
LOKET_GRUP.forEach((lk, i) => { const it = addInteract(lk, 'loketMasuk', i, 4.2); it.label = '🎟️ Beli tiket masuk'; });
setTimeout(() => { for (const q of LOKET_MASUK) { const n = Math.round(q.dasar * q.ramaiFn(WAKTU.jam)); for (let i = 0; i < n; i++) { const [x, z] = slotAntri(q, i); const N = buatNpc([x, z]); N.x = x; N.z = z; N.yaw = arahAntri(q); tambahKeAntrian(q, N); } } }, 0);
$('btn-antri').onclick = () => { keluarAntrian(); hint('Kalian keluar dari antrean.'); };

/* ---------- lihat hidangan dari dekat ---------- */
let pratinjau = null;
function lihatHidangan(p) {
  const html = `<canvas id="pratinjau" width="520" height="340"></canvas><p class="ket-hidangan">${KET_MENU[p.jenis] || ''}</p><div class="catatan">${p.emoji} ${p.nama}${p.harga ? ' · ' + rupiah(p.harga) : ''}${p.sisa < 0.98 ? ` · sisa ${Math.round(p.sisa * 100)}%` : ''}</div>`;
  kartu(p.emoji, p.nama, html, p.sisa > 0.02 && duduk && duduk.meja === p.meja ? (p.minum ? 'Minum 🥤' : 'Makan 🍽️') : null, () => mulaiMakan());
  try {
    if (!pratinjau) {
      pratinjau = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(35, 520 / 340, 0.01, 10) };
      pratinjau.scene.add(new THREE.HemisphereLight('#ffffff', '#b8a68a', 2.2));
      const dl = new THREE.DirectionalLight('#fff3dc', 2); dl.position.set(1, 2, 1.5); pratinjau.scene.add(dl);
      const alas = mesh(cyl(0.4, 0.4, 0.02, 32), '#8b6440', 0, -0.012, 0, pratinjau.scene, false);
    }
    const cv = $('pratinjau');
    if (pratinjau.r) pratinjau.r.dispose();
    pratinjau.r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    pratinjau.r.setPixelRatio(1);
    if (pratinjau.obj) pratinjau.scene.remove(pratinjau.obj);
    const salin = { ...p }; const obj = modelMenu(salin); salin.sisa = p.sisa; aturSisa(salin);
    pratinjau.scene.add(obj); pratinjau.obj = obj;
    const t0 = performance.now();
    const loop = () => {
      if ($('kartu').classList.contains('sembunyi') || !document.body.contains(cv)) { pratinjau.r.dispose(); pratinjau.r = null; return; }
      const a = (performance.now() - t0) / 2400;
      pratinjau.cam.position.set(Math.sin(a) * 0.42, 0.34, Math.cos(a) * 0.42); pratinjau.cam.lookAt(0, 0.06, 0);
      pratinjau.r.render(pratinjau.scene, pratinjau.cam);
      requestAnimationFrame(loop);
    };
    loop();
  } catch (e) {}
}

/* ---------- waktu: pagi, siang, sore, malam ---------- */
// waktu game ikut jam global: semua pemain melihat jam yang sama, berjalan walau game ditutup
const WAKTU = { jam: 9, menitHari: D.menitPerHari || 60, geser: 0 };
const jamAbs = () => Date.now() / (WAKTU.menitHari * 60000) * 24 + WAKTU.geser;
WAKTU.jam = jamAbs() % 24;
const fmtRp = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID');
const DOMPET = { harian: D.uangHarian || 200000, jamReset: D.jamReset != null ? D.jamReset : 7, hari: null, sisa: 0 };
const uangEl = document.createElement('div'); uangEl.id = 'uang'; uangEl.title = 'Uang jajan hari ini, kembali penuh setiap jam ' + DOMPET.jamReset + ' pagi';
$('hud').appendChild(uangEl);
function simpanDompet() { try { localStorage.setItem('safari_uang', JSON.stringify({ hari: DOMPET.hari, sisa: DOMPET.sisa })); } catch (e) {} uangEl.textContent = '💰 ' + fmtRp(DOMPET.sisa); }
function cekDompet() {
  const h = Math.floor((jamAbs() - DOMPET.jamReset) / 24);
  if (DOMPET.hari === h) return;
  let sv = null; try { sv = JSON.parse(localStorage.getItem('safari_uang')); } catch (e) {}
  const lanjut = DOMPET.hari !== null;
  if (!lanjut && sv && sv.hari === h) DOMPET.sisa = sv.sisa;
  else { DOMPET.sisa = DOMPET.harian; if (lanjut) { hint(`Sudah jam ${DOMPET.jamReset} pagi. Uang jajan hari ini ${fmtRp(DOMPET.harian)} lagi!`, 4000); } }
  DOMPET.hari = h; simpanDompet();
}
cekDompet();
function bayar(n) { cekDompet(); if (n > DOMPET.sisa) return false; DOMPET.sisa -= n; simpanDompet(); return true; }
const BINTANG = (() => {
  const n = 600, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, e = Math.asin(Math.random() * 0.95 + 0.05), r = 700; pos[i * 3] = Math.cos(a) * Math.cos(e) * r; pos[i * 3 + 1] = Math.sin(e) * r; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }));
  scene.add(p); return p;
})();
const BULAN = mesh(sph(14, 16, 12), new THREE.MeshBasicMaterial({ color: '#f4f0dc', fog: false, transparent: true, opacity: 0 }), 0, 0, 0, scene, false);
const cLangitSiang = new THREE.Color('#ffffff'), cLangitMalam = new THREE.Color('#1b2340'), cLangitSenja = new THREE.Color('#ffb48a');
const cKabutSiang = new THREE.Color('#cfe6ea'), cKabutMalam = new THREE.Color('#141b2e'), cKabutSenja = new THREE.Color('#e8b49a');
const cMatahari = new THREE.Color('#fff3dc'), cMatahariSenja = new THREE.Color('#ffb070');
const tmpCol = new THREE.Color();
function infoWaktu(h) {
  const elev = Math.sin((h - 6) / 12 * Math.PI); // >0 siang
  const terang = clamp(elev * 1.6 + 0.15, 0, 1); // 0 malam .. 1 siang
  const senja = clamp(1 - Math.abs(elev) * 4, 0, 1) * (h > 4 && h < 20 ? 1 : 0);
  return { elev, terang, senja };
}
function namaWaktu(h) { return h < 4 ? 'Dini hari' : h < 10 ? 'Pagi' : h < 15 ? 'Siang' : h < 18.5 ? 'Sore' : 'Malam'; }
function ikonWaktu(h) { return h >= 6 && h < 18 ? (h >= 11 && h < 14 ? '☀️' : '🌤️') : h >= 18 && h < 19 ? '🌇' : '🌙'; }
function jamTeks(h) { const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); }
function keramaian(h) {
  // ramai saat makan siang & malam, sepi pagi dan larut malam
  const k = Math.exp(-((h - 12.3) ** 2) / 3) + 0.85 * Math.exp(-((h - 19) ** 2) / 2.5) + 0.25 * Math.exp(-((h - 16) ** 2) / 3);
  return clamp(k, 0, 1) * (h < 8 || h > 22 ? 0.2 : 1);
}
let terangSekarang = 1;
function updateWaktu(dt, dalam) {
  WAKTU.jam = ((jamAbs() % 24) + 24) % 24; cekDompet();
  const h = WAKTU.jam, w = infoWaktu(h);
  terangSekarang = w.terang;
  tmpCol.copy(cLangitMalam).lerp(cLangitSiang, w.terang).lerp(cLangitSenja, w.senja * 0.6);
  langitMat.color.copy(tmpCol);
  tmpCol.copy(cKabutMalam).lerp(cKabutSiang, w.terang).lerp(cKabutSenja, w.senja * 0.5);
  scene.fog.color.copy(tmpCol); scene.background = scene.fog.color;
  awanMat.color.setScalar(0.25 + 0.75 * w.terang); awanMat.emissive.copy(tmpCol).multiplyScalar(0.6);
  BINTANG.material.opacity = clamp(1 - w.terang * 2.2, 0, 1);
  // arah matahari / bulan
  const a = (h - 6) / 12 * Math.PI;
  const dx = Math.cos(a), dy = Math.max(0.15, Math.abs(Math.sin(a)));
  sun.position.set(player.x + dx * 60, dy * 80, player.z + 30); sun.target.position.set(player.x, 0, player.z);
  sun.color.copy(cMatahari).lerp(cMatahariSenja, w.senja);
  BULAN.position.set(player.x - dx * 500, 260, player.z - 300); BULAN.material.opacity = clamp(1 - w.terang * 2, 0, 1);
  // lampu taman menyala saat gelap
  lampuMat.emissive.setScalar(0).lerp(tmpCol.set('#ffe9a8'), clamp(1.2 - w.terang * 1.6, 0.15, 1));
  for (const m of lampuGedung) m.emissiveIntensity = clamp(1.2 - w.terang, 0.2, 1);
  // cahaya: di dalam gedung tetap terang karena lampu
  const gelapBios = dalam && dalam.id === 'bioskop' ? (BIOS.status === 'putar' ? 1 : 0.35) : 0;
  let hT = 0.35 + 1.25 * w.terang, sT = 2.2 * w.terang + 0.15;
  if (dalam) { hT = Math.max(hT, 1.35); sT = Math.min(sT, 0.6); }
  if (gelapBios) { hT = 1.6 - gelapBios * 1.35; sT = 0.2 * (1 - gelapBios); }
  hemi.intensity = lerp(hemi.intensity, hT, Math.min(1, dt * 2));
  sun.intensity = lerp(sun.intensity, sT, Math.min(1, dt * 2));
  hemi.color.set(w.terang > 0.3 ? '#e8f6ff' : '#9fb4e8');
  // jam di layar
  jamEl.textContent = ikonWaktu(h) + ' ' + jamTeks(h);
  // pengunjung jalan-jalan berkurang saat malam
  const ramai = keramaian(h);
  for (const N of npcs) if (N.jalan) N.libur = N.acak > 0.25 + ramai * 0.75;
  for (const q of ANTRIAN) { const r = q.ramaiFn ? q.ramaiFn(h) : ramai; q.target = Math.round(q.dasar * r + (r > 0.15 ? 0.4 : 0)); }
  cekTopi(h);
}
const jamEl = document.createElement('div'); jamEl.id = 'jam'; jamEl.title = 'Waktu taman (1 hari = ' + WAKTU.menitHari + ' menit)';
$('hud').appendChild(jamEl);
jamEl.onclick = () => hint(namaWaktu(WAKTU.jam) + ' · ' + jamTeks(WAKTU.jam) + ' · 1 hari di taman = ' + WAKTU.menitHari + ' menit');

/* ---------- topi: ditawarkan saat siang terik ---------- */
const TOPI = { dipakai: false, ditanya: false, tanyaJam: -1, anim: null, terakhirTolak: -1e9 };
kamu.topi.visible = false;
const topiTerbang = kamu.topi.clone(); topiTerbang.visible = false; scene.add(topiTerbang);
function cekTopi(h) {
  if (TOPI.dipakai || TOPI.anim || paused || !started || duduk || antriPemain || AMATI.aktif) return;
  if (h < 11 || h > 14.5) { TOPI.ditanya = false; return; }
  if (TOPI.ditanya || gedungDalam(player.x, player.z)) return;
  if (performance.now() - TOPI.terakhirTolak < 90000) return;
  TOPI.ditanya = true;
  const tanya = D.tanyaTopi || 'Kamu pasti merasa panas kan? Ingin mengenakan topi?';
  bicara(tanya, 5);
  kartu('👒', D.namaPasangan && D.namaPasangan !== 'Dia' ? D.namaPasangan + ' bertanya' : 'Dia bertanya', `<p style="text-align:center;font-size:17px">"${tanya}"</p>`, 'Iya, mau 👒', () => pasangTopi());
  $('k-tutup').textContent = 'Tidak';
  kartuTidak = () => { TOPI.terakhirTolak = performance.now(); TOPI.ditanya = false; setTimeout(() => bicara(pick(D.jawabTidakTopi || ['Oke, bilang aja ya kalau kepanasan.'])), 300); };
}
let kartuTidak = null;
function pasangTopi() {
  TOPI.anim = { t: 0 };
  setTimeout(() => bicara(pick(D.saatPasangTopi || ['Sini, aku pakaikan. Biar kamu nggak kepanasan.'])), 200);
}
function animTopi(dt) {
  const A = TOPI.anim; if (!A) return false;
  A.t += dt;
  const T = 3.2;
  // dia menghadap kamu, kedua tangan terangkat memegang topi
  const ke = Math.atan2(-(player.x - partner.x), -(player.z - partner.z));
  dia.group.rotation.y = ke + Math.PI;
  const angkat = A.t < 0.6 ? A.t / 0.6 : 1;
  swingArm(dia.arms[0], -0.4 - angkat * 2.1, 1); swingArm(dia.arms[1], -0.4 - angkat * 2.1, -1);
  swingArm(kamu.arms[0], -0.2, 1); swingArm(kamu.arms[1], -0.2, -1);
  dia.arms[0].hand.getWorldPosition(tmpA); dia.arms[1].hand.getWorldPosition(tmpB);
  tmpA.add(tmpB).multiplyScalar(0.5); tmpA.y += 0.12;
  kamu.topi.getWorldPosition(tmpB); kamu.topi.visible = false;
  const u = clamp((A.t - 0.6) / (T - 1.2), 0, 1), e2 = ease(u);
  topiTerbang.visible = true;
  topiTerbang.position.copy(tmpA).lerp(tmpB, e2); topiTerbang.position.y += Math.sin(u * Math.PI) * 0.25;
  topiTerbang.rotation.set(0, kamu.group.rotation.y, 0);
  if (A.t > T) {
    TOPI.anim = null; TOPI.dipakai = true; topiTerbang.visible = false; kamu.topi.visible = true;
    hearts(tmpB, 4, '💛');
    setTimeout(() => bicara(pick(D.setelahPakaiTopi || ['Nah, cantik. Sekarang nggak kepanasan lagi.'])), 300);
  }
  return true;
}

/* ---------- kartu bantu ---------- */
function kartu(emoji, judul, html, aksiLabel, aksiFn) {
  paused = true; $('k-tutup').textContent = 'Tutup'; kartuTidak = null;
  $('k-emoji').textContent = emoji; $('k-judul').textContent = judul; $('k-isi').innerHTML = html;
  const b = $('k-aksi');
  if (aksiLabel) { b.textContent = aksiLabel; b.classList.remove('sembunyi'); kartuAksi = aksiFn; } else { b.classList.add('sembunyi'); kartuAksi = null; }
  $('kartu').classList.remove('sembunyi');
}
const rupiah = (k) => 'Rp' + k + '.000';
function bukaKios(i) {
  const k = KIOS[i];
  const html = '<div class="menu">' + k.menu.map((m, j) => `<div class="menu-item" data-j="${j}"><span>${m[0]}<small>${rupiah(m[1])}</small></span><button class="qty" data-d="-1">−</button><b class="jml">0</b><button class="qty" data-d="1">+</button></div>`).join('') + '</div><div class="total">Total: <b id="total">Rp0</b></div>' +
    `<div class="catatan">💰 Uang kalian: <b>${fmtRp(DOMPET.sisa)}</b></div>` +
    (pesanan.length ? `<div class="catatan">Pesanan kalian: ${pesanan.map(p => p.emoji + ' ' + p.nama).join(', ')}</div>` : '<div class="catatan">Pilih menu, lalu duduk di meja mana saja. Makanan diantar ke meja kalian.</div>');
  kartu(k.emoji, k.nama, html, 'Pesan', () => {
    const dipilih = [];
    document.querySelectorAll('#k-isi .menu-item').forEach(r => { const n = +r.querySelector('.jml').textContent; for (let q = 0; q < n; q++) dipilih.push(k.menu[+r.dataset.j]); });
    if (!dipilih.length) { hint('Belum ada menu yang dipilih.'); return; }
    const harga = dipilih.reduce((a, m) => a + m[1] * 1000, 0);
    if (!bayar(harga)) { hint(`Uangnya nggak cukup. Totalnya ${fmtRp(harga)}, sisa uang ${fmtRp(DOMPET.sisa)}.`, 3800); setTimeout(() => bicara('Uang kita tinggal sedikit. Pilih yang lebih murah aja yuk.'), 600); return; }
    for (const m of dipilih) pesanan.push({ nama: m[0], harga: m[1], emoji: k.emoji, warna: k.warna, kios: i, minum: /^(Es |Jus|Teh|Kopi|Cappuccino|Coklat Panas|Ocha|Smoothie)/.test(m[0]), diantar: false, dikirim: false, sisa: 1 });
    const ringkas = {}; dipilih.forEach(m => ringkas[m[0]] = (ringkas[m[0]] || 0) + 1);
    hint(`Pesanan dicatat: ${Object.entries(ringkas).map(([n, q]) => q + '× ' + n).join(', ')}. Yuk cari meja!`, 3500);
    if (duduk && duduk.meja) kirimPelayan(duduk.meja);
    else bicara(pick(['Wah, kelihatannya enak!', 'Aku juga lapar nih.', 'Pilihan bagus, sayang.']));
  });
  $('k-aksi').textContent = 'Pesan';
  $('k-isi').onclick = (e) => {
    const b = e.target.closest('.qty'); if (!b) return;
    const row = b.closest('.menu-item'), j = row.querySelector('.jml');
    j.textContent = clamp(+j.textContent + +b.dataset.d, 0, 9);
    let tot = 0; document.querySelectorAll('#k-isi .menu-item').forEach(r => tot += +r.querySelector('.jml').textContent * k.menu[+r.dataset.j][1]);
    $('total').textContent = rupiah(tot).replace('Rp0.000', 'Rp0') + (tot * 1000 > DOMPET.sisa ? ' (uang kurang)' : '');
  };
}
function jenisMenu(n) {
  if (/Kelapa/.test(n)) return 'kelapa';
  if (/^Es Krim/.test(n)) return 'eskrim';
  if (/^(Kopi Hitam|Cappuccino|Coklat Panas|Teh Tarik|Ocha)/.test(n)) return 'cangkir';
  if (/^(Es |Jus|Smoothie)/.test(n)) return 'gelas';
  if (/Sate/.test(n)) return 'sate';
  if (/Bakso|Soto|Rawon|Sop|Mie Ayam|Mie Yamin|Ramen|Tekwan|Model|Bihun|Pangsit Kuah|Capcay/.test(n)) return 'mangkuk';
  if (/Nasi|Kwetiau|Mie Goreng|Teriyaki|Katsu|Lontong/.test(n)) return 'piring';
  if (/Ayam/.test(n)) return 'ayam';
  if (/Siomay|Hakau|Lumpia|Ceker|Bakpao|Mantao/.test(n)) return 'dimsum';
  if (/Pempek/.test(n)) return 'pempek';
  if (/Martabak|Roti|Pisang/.test(n)) return 'martabak';
  if (/Sushi/.test(n)) return 'sushi';
  if (/Takoyaki/.test(n)) return 'takoyaki';
  return 'gorengan';
}
const WARNA_MENU = { 'Es Kopi Susu': '#b08860', 'Es Teh Manis': '#c8742a', 'Es Teh': '#c8742a', 'Jus Alpukat': '#a9c25a', 'Jus Mangga': '#f2b33c', 'Es Campur': '#e8a0b8', 'Smoothie Stroberi': '#f08aa0', 'Kopi Hitam': '#3a2416', 'Cappuccino': '#c8a27a', 'Coklat Panas': '#5a3420', 'Teh Tarik': '#c9935a', 'Ocha': '#8fb15a' };
const KET_MENU = {
  mangkuk: 'Disajikan hangat dalam mangkuk, kuahnya gurih dan harum.', piring: 'Disajikan di piring, masih panas baru diangkat dari wajan.',
  sate: 'Sate dibakar di atas arang, dengan bumbu yang meresap.', ayam: 'Ayam renyah dengan nasi hangat dan sambal pedas.',
  dimsum: 'Dikukus dalam keranjang bambu, lembut dan juicy.', pempek: 'Pempek kenyal dengan kuah cuko asam manis pedas.',
  martabak: 'Dipotong-potong, cocok dimakan berdua.', sushi: 'Nasi pulen digulung rumput laut, cantik dan segar.',
  takoyaki: 'Bola-bola gurih dengan saus dan taburan katsuobushi.', gorengan: 'Gorengan hangat, renyah di luar.',
  gelas: 'Minuman dingin yang segar dengan es batu.', cangkir: 'Minuman hangat dalam cangkir, pas untuk bersantai.',
  eskrim: 'Dua sendok es krim lembut dalam cup.', kelapa: 'Kelapa muda utuh, airnya manis dan segar.'
};
function modelMenu(p) {
  const n = p.nama, j = jenisMenu(n), g = new THREE.Group(), isi = new THREE.Group();
  const w = WARNA_MENU[n] || p.warna;
  const piring = (r = 0.17) => mesh(cyl(r, r * 0.75, 0.04, 14), '#f8f4ea', 0, 0.02, 0, g, false);
  p.minum = ['gelas', 'cangkir', 'kelapa'].includes(j);
  if (j === 'mangkuk') {
    mesh(cyl(0.15, 0.09, 0.12, 14), '#f8f4ea', 0, 0.06, 0, g, false);
    mesh(cyl(0.135, 0.135, 0.02, 14), /Rawon/.test(n) ? '#3a2416' : /Soto|Sop|Tekwan|Model/.test(n) ? '#e8c35a' : '#d9b27a', 0, 0.11, 0, isi, false);
    if (/Bakso/.test(n)) for (let i = 0; i < 4; i++) mesh(sph(0.035, 7, 5), '#8a6a52', Math.cos(i * 1.6) * 0.07, 0.13, Math.sin(i * 1.6) * 0.07, isi, false);
    if (/Mie|Ramen|Bihun/.test(n)) for (let i = 0; i < 5; i++) { const m = mesh(new THREE.TorusGeometry(0.05, 0.008, 4, 10), /Bihun/.test(n) ? '#f4efe4' : '#f2d27a', -0.05 + i * 0.025, 0.125, 0.01 * i, isi, false); m.rotation.x = Math.PI / 2; }
    if (/Ramen/.test(n)) { mesh(sph(0.03, 7, 5), '#f2d14b', 0.05, 0.135, -0.04, isi, false); mesh(box(0.06, 0.005, 0.04), '#d98a6a', -0.05, 0.13, -0.05, isi, false); }
    if (/Soto|Sop|Rawon/.test(n)) { mesh(box(0.04, 0.02, 0.03), '#f4efe4', 0.04, 0.125, 0.02, isi, false); mesh(sph(0.012, 5, 4), '#5a9a44', -0.04, 0.125, -0.02, isi, false); mesh(sph(0.012, 5, 4), '#5a9a44', -0.02, 0.125, 0.05, isi, false); }
  } else if (j === 'piring') {
    piring();
    const nasi = mesh(sph(0.09, 10, 6, 0), /Kwetiau|Mie/.test(n) ? '#c9935a' : /Nasi Goreng/.test(n) ? '#d9a35a' : '#fbf8f0', 0, 0.04, 0, isi, false); nasi.scale.set(1, 0.55, 1);
    if (/Nasi Goreng|Mie Goreng/.test(n)) { mesh(cyl(0.05, 0.05, 0.01, 10), '#ffffff', 0.06, 0.1, 0.03, isi, false); mesh(cyl(0.022, 0.022, 0.012, 8), '#f2c12e', 0.06, 0.106, 0.03, isi, false); for (let i = 0; i < 3; i++) mesh(box(0.03, 0.005, 0.015), '#5a9a44', -0.1 + i * 0.03, 0.04, 0.1, isi, false); }
    if (/Katsu|Teriyaki/.test(n)) { const k = mesh(box(0.14, 0.03, 0.07), /Katsu/.test(n) ? '#c9862a' : '#6a3a1e', 0.03, 0.08, 0.04, isi, false); k.rotation.y = 0.4; mesh(sph(0.04, 6, 4), '#7fbf5a', -0.08, 0.05, 0.07, isi, false); }
    if (/Lontong/.test(n)) { nasi.visible = false; for (let i = 0; i < 4; i++) mesh(box(0.05, 0.04, 0.05), '#cfe0a8', -0.06 + i * 0.04, 0.04, 0, isi, false); }
  } else if (j === 'sate') {
    piring(0.19);
    for (let i = 0; i < 4; i++) { const st = new THREE.Group(); st.position.set(-0.06 + i * 0.04, 0.05, 0); st.rotation.y = 0.15; isi.add(st); mesh(cyl(0.004, 0.004, 0.28, 4), '#d8c49a', 0, 0, 0, st, false).rotation.x = Math.PI / 2; for (let k = 0; k < 4; k++) mesh(box(0.028, 0.025, 0.028), /Taichan/.test(n) ? '#efe2c8' : '#7a3e1e', 0, 0, -0.06 + k * 0.035, st, false); }
    mesh(cyl(0.04, 0.03, 0.03, 10), '#4a2a16', 0.1, 0.05, 0.08, isi, false);
  } else if (j === 'ayam') {
    piring(0.18);
    const n2 = mesh(sph(0.07, 10, 6), '#fbf8f0', -0.05, 0.04, 0, isi, false); n2.scale.set(1, 0.6, 1);
    const ay = mesh(new THREE.DodecahedronGeometry(0.06, 0), /Bakar/.test(n) ? '#7a3e1e' : '#c9862a', 0.06, 0.06, 0.02, isi, false); ay.scale.set(1.3, 0.7, 1);
    mesh(sph(0.03, 6, 4), '#d63a2a', 0.08, 0.05, -0.08, isi, false);
    if (/Tahu|Tempe/.test(n)) { n2.visible = false; }
  } else if (j === 'dimsum') {
    mesh(cyl(0.14, 0.14, 0.07, 14), '#c9a46a', 0, 0.035, 0, g, false);
    for (let i = 0; i < 4; i++) { const d = mesh(sph(0.045, 8, 6), /Hakau/.test(n) ? '#f0ece4' : /Ceker/.test(n) ? '#b8642a' : /Bakpao|Mantao/.test(n) ? '#fbf8f0' : '#f2d27a', Math.cos(i * 1.57 + 0.78) * 0.06, 0.09, Math.sin(i * 1.57 + 0.78) * 0.06, isi, false); d.scale.y = 0.8; }
  } else if (j === 'pempek') {
    piring(0.18);
    for (let i = 0; i < 3; i++) { const pp = mesh(sph(0.05, 8, 5), '#e2c08a', -0.07 + i * 0.07, 0.04, 0.02, isi, false); pp.scale.set(1, 0.55, 1.4); }
    mesh(cyl(0.045, 0.035, 0.05, 10), '#f8f4ea', 0.1, 0.045, -0.09, g, false); mesh(cyl(0.04, 0.04, 0.01, 10), '#3a2416', 0.1, 0.065, -0.09, isi, false);
  } else if (j === 'martabak') {
    piring(0.19);
    for (let i = 0; i < 6; i++) { const s = mesh(box(0.06, 0.035, 0.11), /Telur/.test(n) ? '#d9a04a' : /Pandan/.test(n) ? '#6aa64e' : /Pisang/.test(n) ? '#e8c35a' : '#8a5a2b', (i % 3 - 1) * 0.065, 0.04, (Math.floor(i / 3) - 0.5) * 0.115, isi, false); if (/Coklat/.test(n)) mesh(box(0.062, 0.008, 0.11), '#f2d14b', (i % 3 - 1) * 0.065, 0.06, (Math.floor(i / 3) - 0.5) * 0.115, isi, false); }
  } else if (j === 'sushi') {
    mesh(box(0.3, 0.02, 0.14), '#2a2a2a', 0, 0.01, 0, g, false);
    for (let i = 0; i < 5; i++) { mesh(cyl(0.03, 0.03, 0.035, 10), '#1f3a2a', -0.12 + i * 0.06, 0.04, 0, isi, false); mesh(cyl(0.024, 0.024, 0.037, 10), '#fbf8f0', -0.12 + i * 0.06, 0.04, 0, isi, false); mesh(cyl(0.01, 0.01, 0.038, 6), '#f08a6a', -0.12 + i * 0.06, 0.04, 0, isi, false); }
  } else if (j === 'takoyaki') {
    mesh(box(0.2, 0.03, 0.12), '#d8c49a', 0, 0.015, 0, g, false);
    for (let i = 0; i < 6; i++) { mesh(sph(0.03, 7, 5), '#c9862a', (i % 3 - 1) * 0.06, 0.05, (Math.floor(i / 3) - 0.5) * 0.06, isi, false); }
  } else if (j === 'gelas') {
    mesh(cyl(0.06, 0.05, 0.2, 12), new THREE.MeshLambertMaterial({ color: '#dff2f7', transparent: true, opacity: 0.45 }), 0, 0.1, 0, g, false);
    const cair = mesh(cyl(0.055, 0.046, 0.16, 12), w, 0, 0.08, 0, isi, false);
    if (/Es Campur/.test(n)) { mesh(sph(0.02, 5, 4), '#6aa64e', 0.02, 0.15, 0, isi, false); mesh(sph(0.02, 5, 4), '#d63a2a', -0.02, 0.15, 0.01, isi, false); }
    if (/Kopi Susu/.test(n)) mesh(cyl(0.054, 0.054, 0.03, 12), '#efe2c8', 0, 0.17, 0, isi, false);
    for (let i = 0; i < 2; i++) mesh(box(0.03, 0.03, 0.03), '#e9f6fb', -0.015 + i * 0.03, 0.15, 0, isi, false);
    mesh(cyl(0.006, 0.006, 0.28, 5), '#ffffff', 0.02, 0.2, 0, g, false).rotation.z = 0.2;
    isi.position.y = 0; p.cair = cair;
  } else if (j === 'cangkir') {
    mesh(cyl(0.09, 0.08, 0.015, 14), '#f8f4ea', 0, 0.008, 0, g, false);
    mesh(cyl(0.055, 0.045, 0.08, 12), '#f8f4ea', 0, 0.055, 0, g, false);
    const pg = mesh(new THREE.TorusGeometry(0.025, 0.007, 5, 10), '#f8f4ea', 0.065, 0.06, 0, g, false);
    mesh(cyl(0.05, 0.05, 0.01, 12), w, 0, 0.09, 0, isi, false);
    if (/Cappuccino/.test(n)) mesh(cyl(0.04, 0.04, 0.012, 12), '#f4efe4', 0, 0.095, 0, isi, false);
  } else if (j === 'eskrim') {
    mesh(cyl(0.06, 0.045, 0.07, 12), '#f08aa0', 0, 0.035, 0, g, false);
    mesh(sph(0.045, 8, 6), '#fbf3e0', -0.02, 0.09, 0, isi, false); mesh(sph(0.045, 8, 6), '#7a4a2a', 0.025, 0.1, 0.01, isi, false);
  } else if (j === 'kelapa') {
    mesh(sph(0.1, 9, 7), '#6aa64e', 0, 0.09, 0, g, false);
    mesh(cyl(0.045, 0.045, 0.01, 10), '#f4efe4', 0, 0.18, 0, isi, false);
    mesh(cyl(0.006, 0.006, 0.22, 5), '#f08aa0', 0.02, 0.24, 0, g, false).rotation.z = 0.2;
  } else {
    piring(0.16);
    for (let i = 0; i < 4; i++) { const k = mesh(box(0.06, 0.03, 0.05), /Tahu/.test(n) ? '#e2b65a' : '#c9862a', (i % 2 - 0.5) * 0.08, 0.035, (Math.floor(i / 2) - 0.5) * 0.07, isi, false); k.rotation.y = i; }
  }
  g.add(isi); p.isi = isi; p.jenis = j;
  return g;
}

function modelHidangan(p, parent) { const g = modelMenu(p); parent.add(g); return g; }
// tempat di meja: 0 depan cewek, 1 depan cowok, 2 & 3 sisi seberang (kalau kursinya kosong). Tiap tempat muat 2 hidangan
const TEMPAT = [[-0.45, 0.3], [0.45, 0.3], [-0.45, -0.3], [0.45, -0.3]];
function slotBebas(m) {
  const pakai = new Set(pesanan.filter(p => p.meja === m && p.slot).map(p => p.slot[0] * 2 + p.slot[1]));
  const r = [];
  for (let t = 0; t < 4; t++) { if (t >= 2 && m.kursiU[t - 2].n) continue; for (let k = 0; k < 2; k++) if (!pakai.has(t * 2 + k)) r.push([t, k]); }
  return r;
}
function pilihSlot(m, orang) {
  const b = slotBebas(m);
  return b.find(x => x[0] === orang) || b.find(x => x[0] === orang + 2) || b[0] || null;
}
function taruhMakanan(m) {
  for (const o of m.makanan) { scene.remove(o); const ix = interactables.findIndex(x => x.obj === o); if (ix >= 0) interactables.splice(ix, 1); }
  m.makanan = [];
  pesanan.filter(p => p.diantar && p.meja === m && p.slot).forEach(p => {
    const [t, k] = p.slot;
    const g = new THREE.Group(); g.position.set(m.x + TEMPAT[t][0] + (k ? 0.17 : -0.12), 0.8, m.z + TEMPAT[t][1]); scene.add(g);
    modelHidangan(p, g);
    aturSisa(p);
    m.makanan.push(g);
    const it = addInteract(g, 'hidangan', p, 0); it.label = 'Lihat ' + p.nama;
  });
  tampilMakan();
}
function aturSisa(p) {
  if (!p.isi) return;
  p.isi.visible = p.sisa > 0.02;
  if (p.jenis === 'gelas') p.isi.scale.y = Math.max(0.02, p.sisa);
  else if (p.jenis === 'cangkir' || p.jenis === 'kelapa') p.isi.position.y = -(1 - p.sisa) * 0.06;
  else p.isi.scale.setScalar(0.35 + 0.65 * p.sisa);
}
function tampilMakan() {
  const ada = duduk && duduk.meja && pesanan.some(p => p.diantar && p.meja === duduk.meja && p.sisa > 0.02);
  $('btn-makan').classList.toggle('sembunyi', !ada || !!(duduk && duduk.makanT > 0));
}
let pelayanAktif = 0;
let rantaiTanya = Promise.resolve();
function tanyaPelayan(N, p) {
  // satu pertanyaan per hidangan: untuk Mbak atau Mas?
  return new Promise(res => {
    const tanya = `${p.nama}? Untuk Mbak atau Mas?`;
    npcBicara = N; npcBicaraT = 99; npcKonteks = 'pelayan'; gelNpc.textContent = tanya; gelNpc.classList.remove('sembunyi');
    kartu('🍽️', 'Pelayan bertanya', `<p style="text-align:center;font-size:17px">"${tanya}"</p>`, 'Mbak 👩', () => res(0));
    $('k-tutup').textContent = 'Mas 👨'; kartuTidak = () => res(1);
  });
}
function kirimPelayan(m) {
  if (duduk && duduk.meja === m && cekKueUltah(m)) return;
  const transit = pesanan.filter(p => p.dikirim && !p.diantar && p.meja === m).length;
  const muat = Math.max(0, slotBebas(m).length - transit);
  const antre = pesanan.filter(p => !p.dikirim);
  const kirim = antre.slice(0, muat);
  if (antre.length > kirim.length) angkatPiring(m);
  if (antre.length > kirim.length) setTimeout(() => hint(kirim.length ? 'Mejanya nggak muat semua. Sisa pesanan diantar setelah ada piring kosong.' : 'Mejanya penuh. Pesanan berikutnya diantar setelah piring kosong diangkat.', 4000), kirim.length ? 3200 : 0);
  const per = {};
  kirim.forEach(p => { p.dikirim = true; p.meja = m; (per[p.kios] = per[p.kios] || []).push(p); });
  const grup = Object.entries(per);
  if (!grup.length) return;
  hint('Pesanan sedang disiapkan, sebentar lagi diantar 🍽️', 3000);
  grup.forEach(([ki, items], n) => {
    const k = KIOS[+ki];
    const N = buatNpc(k.depan, { baju: '#f8f4ea', celana: '#26262b', rambut: '#1a1a1a' });
    N.x = k.depan[0]; N.z = k.depan[1]; N.speed = 1.5; N.pelayan = true; N.tunda = 2.5 + n * 1.8;
    const baki = new THREE.Group(); baki.position.set(0, 1.02, 0.42); N.P.group.add(baki);
    mesh(box(0.55, 0.03, 0.38), '#6b4a2b', 0, 0, 0, baki, false);
    const diBaki = items.slice(0, 4).map((p, j) => { const h = modelHidangan({ ...p }, baki); h.position.set(-0.15 + (j % 2) * 0.3, 0.02, -0.08 + Math.floor(j / 2) * 0.16); h.scale.setScalar(0.8); return h; });
    const sisi = n % 2 ? -1 : 1;
    N.jalur = [[m.x + sisi * 1.45, m.z + 1.9], [m.x + sisi * 1.4, m.z + 0.35]];
    pelayanAktif++;
    N.onArrive = () => {
      N.yaw = sisi > 0 ? Math.PI / 2 : -Math.PI / 2; N.diamT = 1.2;
      rantaiTanya = rantaiTanya.then(async () => {
        let urut = 0;
        for (const p of items) {
          let orang = urut++ % 2;
          if (duduk && duduk.meja === m) orang = await tanyaPelayan(N, p);
          const sl = pilihSlot(m, orang);
          if (!sl) { p.dikirim = false; p.meja = null; continue; }
          p.slot = sl; p.diantar = true;
          if (diBaki.length) baki.remove(diBaki.shift());
          taruhMakanan(m);
        }
        N.P.group.remove(baki); N.bawa = false;
        npcBicara = N; npcBicaraT = 2.6; npcKonteks = 'pelayan'; gelNpc.textContent = pick(['Silakan, selamat menikmati!', 'Selamat makan, Kak!', 'Silakan dinikmati ya.']); gelNpc.classList.remove('sembunyi');
        if (duduk && duduk.meja === m) hint('Makanan datang! Ketuk 🍽️ Makan', 3000);
        N.jalur = [[m.x + sisi * 1.45, m.z + 1.9], k.depan]; N.pergi = true; pelayanAktif--;
      });
    };
    N.bawa = true;
  });
}
// piring kosong diangkat, lalu pesanan yang tertunda diantar
function angkatPiring(m) {
  if (m.angkat) return;
  const kosong = pesanan.filter(p => p.meja === m && p.diantar && p.sisa <= 0.02);
  if (!kosong.length) return;
  m.angkat = true;
  const k = KIOS.reduce((a, b) => Math.hypot(b.depan[0] - m.x, b.depan[1] - m.z) < Math.hypot(a.depan[0] - m.x, a.depan[1] - m.z) ? b : a);
  const N = buatNpc(k.depan, { baju: '#f8f4ea', celana: '#26262b', rambut: '#1a1a1a' });
  N.x = k.depan[0]; N.z = k.depan[1]; N.speed = 1.6; N.pelayan = true; N.tunda = 2;
  N.jalur = [[m.x - 1.45, m.z + 1.9], [m.x - 1.4, m.z + 0.35]];
  N.onArrive = () => {
    N.yaw = -Math.PI / 2; N.diamT = 1.5;
    npcBicara = N; npcBicaraT = 2.6; npcKonteks = 'pelayan'; gelNpc.textContent = pick(['Permisi, piring kosongnya saya angkat ya, Kak.', 'Saya bereskan piringnya dulu ya.']); gelNpc.classList.remove('sembunyi');
    setTimeout(() => {
      pesanan = pesanan.filter(p => !(p.meja === m && p.diantar && p.sisa <= 0.02));
      taruhMakanan(m); m.angkat = false;
      const baki = new THREE.Group(); baki.position.set(0, 1.02, 0.42); N.P.group.add(baki); mesh(box(0.55, 0.03, 0.38), '#6b4a2b', 0, 0, 0, baki, false); N.bawa = true;
      N.jalur = [[m.x - 1.45, m.z + 1.9], k.depan]; N.pergi = true;
      if (pesanan.some(p => !p.dikirim) && duduk && duduk.meja === m) setTimeout(() => kirimPelayan(m), 1500);
    }, 1400);
  };
}
function mulaiMakan() {
  if (!duduk || !duduk.meja) return;
  duduk.makanT = 7; duduk.fase = 0;
  $('btn-makan').classList.add('sembunyi');
  setTimeout(() => bicara(pick(['Enak banget! Mau coba punyaku?', 'Makan bareng kamu rasanya lebih enak.', 'Aaa… buka mulutnya, aku suapin.', 'Minumnya seger banget.'])), 1800);
}
function animMakan(dt) {
  if (!duduk || !(duduk.makanT > 0)) return false;
  duduk.makanT -= dt; duduk.fase += dt;
  const items = pesanan.filter(p => p.diantar && p.meja === duduk.meja && p.sisa > 0.02);
  for (const p of items) { p.sisa = Math.max(0, p.sisa - dt / 7); aturSisa(p); }
  const ph = duduk.fase * 3.2;
  const angkat = (x) => -1.2 - Math.max(0, Math.sin(x)) * 1.25;
  swingArm(kamu.arms[1], angkat(ph), -1); swingArm(kamu.arms[0], -1.15, 1);
  swingArm(dia.arms[0], angkat(ph + 1.9), 1); swingArm(dia.arms[1], -1.15, -1);
  kamu.headParts[0].rotation.x = 0.15 + Math.max(0, Math.sin(ph - 0.4)) * 0.12;
  dia.headParts[0].rotation.x = 0.15 + Math.max(0, Math.sin(ph + 1.5)) * 0.12;
  if (Math.random() < dt * 0.8) { tmpB.set(player.x + 0.2, 1.5, player.z); hearts(tmpB, 1, pick(['😋', '💛', '🍴'])); }
  if (duduk.makanT <= 0) {
    kamu.headParts[0].rotation.x = dia.headParts[0].rotation.x = 0;
    const habis = !pesanan.some(p => p.diantar && p.meja === duduk.meja && p.sisa > 0.02);
    hint(habis ? 'Habis! Kenyang 😋' : 'Masih ada sisa. Ketuk 🍽️ Makan lagi kalau mau.', 2800);
    if (habis && !pesanan.some(p => !p.dikirim)) setTimeout(() => bicara(pick(['Kenyang banget. Makasih ya sudah nemenin makan.', 'Habis ini jalan lagi yuk, biar turun makanannya.'])), 600);
    angkatPiring(duduk.meja);
    tampilMakan();
  }
  return true;
}
function dudukMeja(m) {
  duduk = { meja: m, a: [m.x - 0.45, m.z + 0.85], b: [m.x + 0.45, m.z + 0.85], yaw: 0, sejak: 0 };
  // kalau di depan sudah ada orang, dia mengeluh lalu pergi
  const depan = m.kursiU.map(k => k.n).filter(N => N && N.duduk);
  if (depan.length) {
    NUMPANG.jeda = Math.max(NUMPANG.jeda, 20);
    setTimeout(() => {
      if (!duduk || duduk.meja !== m) return;
      const N = pick(depan); if (!N.duduk) return;
      npcBicara = N; npcBicaraT = 3.5; npcKonteks = 'keluh'; gelNpc.textContent = pick(D.keluhDuduk || ['Ini orang siapa sih? Main duduk aja, nggak permisi! Nggak sopan banget.']); gelNpc.classList.remove('sembunyi');
      depan.forEach((n, i) => setTimeout(() => { if (n.duduk) n.makanSisa = 0.01; }, 4200 + i * 700));
    }, 1300);
  }
  if (pesanan.some(p => !p.dikirim)) kirimPelayan(m);
  else if (pesanan.some(p => p.meja === m)) taruhMakanan(m);
  else hint('Belum pesan makanan. Pilih kios dulu, nanti pelayan mengantarnya ke meja ini.', 3500);
  tampilBerdiri(true); tampilMakan();
}
function tampilBerdiri(on) { $('btn-berdiri').classList.toggle('sembunyi', !on); }
function berdiri() {
  if (!duduk) return;
  if (duduk.meja) { hapusKue(); KUE.rombongan.forEach(R => { R.tepuk = false; R.jalur = [KIOS[0].depan]; R.pergi = true; }); KUE.rombongan = []; if (KUE.tahan) { clearTimeout(KUE.jadwal); KUE.tahan = false; if (!KUE.obj && !KUE.ditiup) KUE.sudah = false; } }
  if (duduk.meja) { const mj = duduk.meja; if (pesanan.some(p => p.meja === mj && p.diantar)) { for (const o of mj.makanan) scene.remove(o); mj.makanan = []; pesanan = pesanan.filter(p => !(p.meja === mj && p.diantar)); } kamu.headParts[0].rotation.x = dia.headParts[0].rotation.x = 0; $('btn-makan').classList.add('sembunyi'); player.x = duduk.meja.x; player.z = duduk.meja.z + 1.9; }
  if (duduk.bioskop) { selesaiFilm(); player.x = 66.6; player.z = duduk.a[1]; if (BAWA.cowok.length || BAWA.cewek.length) { aturBawa(0, 0); setTimeout(() => bicara('Popcorn-nya habis. Gandengan lagi ya.', 3), 600); } }
  partner.x = player.x + 0.7; partner.z = player.z;
  duduk = null; tampilBerdiri(false);
  kamu.group.position.y = 0; dia.group.position.y = 0;
}
function posisiDuduk() {
  duduk.sejak += 1 / 60;
  player.x = duduk.a[0]; player.z = duduk.a[1]; partner.x = duduk.b[0]; partner.z = duduk.b[1];
  player.yaw = duduk.yaw; player.speed = 0; partner.speed = 0;
  const hh = duduk.h || 0;
  kamu.group.position.set(player.x, 0.52 - kamu.hip + hh, player.z); dia.group.position.set(partner.x, 0.52 - dia.hip + hh, partner.z);
  kamu.group.rotation.y = dia.group.rotation.y = duduk.yaw + Math.PI;
  for (const P of [kamu, dia]) for (const l of P.legs) l.rotation.x = -1.45;
  if (duduk.anim) animNaikTurun(hh);
}
// animasi naik / turun jip bergantian: naik cowok dulu lalu menarik tangan cewek, turun cewek dulu dibantu cowok
function animNaikTurun(hh) {
  const A = duduk.anim, t = (performance.now() - A.t0) / 1000 * (window.__lambat || 1);
  const urut = A.turun ? [[dia, 'b', 0], [kamu, 'a', 0.85]] : [[kamu, 'a', 0], [dia, 'b', 0.85]];
  for (const [P, sisi, mulai] of urut) {
    const g = A.tanah[sisi], s = duduk[sisi];
    let k = clamp((t - mulai) / 0.9, 0, 1); if (A.turun) k = 1 - k;
    if ((!A.turun && k >= 1) || (A.turun && k <= 0 && t > mulai + 0.9)) { if (A.turun) { P.group.position.set(g[0], 0, g[1]); for (const l of P.legs) l.rotation.x = 0; P.group.rotation.y = Math.atan2(s[0] - g[0], s[1] - g[1]) + Math.PI; } continue; }
    // titik pijakan di samping jip, lalu melompat masuk ke kursi
    const pijak = [lerp(g[0], s[0], 0.55), lerp(g[1], s[1], 0.55)];
    let x, z, y, kaki;
    const yDuduk = 0.52 - P.hip + hh;
    if (k < 0.45) { const q = k / 0.45; x = lerp(g[0], pijak[0], q); z = lerp(g[1], pijak[1], q); y = 0; kaki = Math.sin(q * Math.PI * 3) * 0.5; }
    else { const q = (k - 0.45) / 0.55, e = q * q * (3 - 2 * q); x = lerp(pijak[0], s[0], e); z = lerp(pijak[1], s[1], e); y = lerp(0.05, yDuduk, e) + Math.sin(q * Math.PI) * 0.45; kaki = q < 0.5 ? -0.9 - q : -1.45; }
    P.group.position.set(x, y, z);
    const arah = Math.atan2(s[0] - g[0], s[1] - g[1]);
    P.group.rotation.y = k > 0.8 ? arah + angDiff(arah, duduk.yaw + Math.PI) * (k - 0.8) / 0.2 : arah;
    P.legs[0].rotation.x = kaki; P.legs[1].rotation.x = k < 0.45 ? -kaki : kaki;
  }
  for (const [P, sisi, mulai] of urut) {
    const g = A.tanah[sisi], s = duduk[sisi];
    if (!A.turun && t < mulai) { P.group.position.set(g[0], 0, g[1]); P.group.rotation.y = Math.atan2(s[0] - g[0], s[1] - g[1]); for (const l of P.legs) l.rotation.x = 0; }
  }
  if (t > 1.9) { const selesai = A.selesai; duduk.anim = null; if (selesai) selesai(); }
}

/* ---------- film ---------- */
function ytId(u) { const m = String(u || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : null; }
function bukaFilm() {
  const daftar = (F.daftar || []).filter(f => f && f.judul).slice(0, 3);
  const hT = D.tiketBioskop != null ? D.tiketBioskop : 20000, hP = D.hargaPopcorn != null ? D.hargaPopcorn : 25000, hM = D.hargaMinumBioskop != null ? D.hargaMinumBioskop : 15000;
  const film = daftar.length ? '<div class="menu">' + daftar.map((f, i) => `<label class="menu-item film"><input type="radio" name="film" value="${i}" ${i === 0 ? 'checked' : ''}>${f.poster ? `<img src="${f.poster}" alt="">` : '<span class="poster-kosong">🎬</span>'}<span><b>${f.judul}</b><small>${f.sinopsis || ''}</small></span></label>`).join('') + '</div>' : '<p>Belum ada film yang diputar. Film bisa ditambahkan lewat halaman admin.</p>';
  const baris = (id, nama, h) => `<div class="menu-item" data-id="${id}" data-h="${h}"><span>${nama}<small>${fmtRp(h)}</small></span><button class="qty" data-d="-1">−</button><b class="jml">0</b><button class="qty" data-d="1">+</button></div>`;
  const html = film + `<div class="catatan">🎟️ Tiket ${fmtRp(hT)} per orang</div>` +
    '<p class="label">Popcorn & minuman</p><div class="menu">' + baris('pop', '🍿 Popcorn', hP) + baris('min', '🥤 Minuman', hM) + '</div>' +
    (daftar.length ? '<label class="menu-item"><input type="checkbox" id="snack-saja"><span>Beli popcorn & minum saja, tidak nonton</span></label>' : '') +
    `<div class="total">Total: <b id="total">-</b></div><div class="catatan">💰 Uang kalian: ${fmtRp(DOMPET.sisa)}</div>`;
  const hitung = () => {
    const q = id => +document.querySelector(`#k-isi [data-id=${id}] .jml`).textContent;
    const saja = !daftar.length || ($('snack-saja') && $('snack-saja').checked);
    return { pop: q('pop'), min: q('min'), saja, tot: (saja ? 0 : hT * 2) + q('pop') * hP + q('min') * hM };
  };
  kartu('🎬', 'Loket Bioskop', html, 'Bayar', () => {
    const r = hitung();
    if (r.saja && !r.pop && !r.min) { hint('Pilih popcorn atau minuman dulu.'); return; }
    if (!bayar(r.tot)) { hint(`Uangnya nggak cukup. Totalnya ${fmtRp(r.tot)}, sisa uang ${fmtRp(DOMPET.sisa)}.`, 3800); return; }
    if (r.pop || r.min) { aturBawa(r.pop, r.min); setTimeout(() => bicara(BAWA.cewek.length ? 'Kamu bawa satu, aku bawa satu ya.' : 'Biar aku yang bawa popcorn sama minumnya.', 3.5), 400); }
    if (!r.saja) { const x = document.querySelector('#k-isi input[name=film]:checked'); mulaiFilm(daftar[x ? +x.value : 0]); }
  });
  const segar = () => { const r = hitung(); $('total').textContent = fmtRp(r.tot) + (r.tot > DOMPET.sisa ? ' (uang kurang)' : ''); $('k-aksi').textContent = r.saja ? 'Beli' : 'Bayar & nonton 🍿'; };
  $('k-isi').onclick = (e) => {
    const b = e.target.closest('.qty'); if (b) { const j = b.closest('.menu-item').querySelector('.jml'); j.textContent = clamp(+j.textContent + +b.dataset.d, 0, 2); }
    setTimeout(segar, 0);
  };
  segar();
}
function siapkanVideo(src) {
  const v = document.createElement('video');
  v.src = src; v.crossOrigin = 'anonymous'; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
  return v;
}
function mulaiFilm(f) {
  if (BIOS.video) selesaiFilm(true);
  const yt = ytId(f.youtube || f.video);
  BIOS.film = f; BIOS.status = 'masuk'; BIOS.timer = 18;
  if (!yt && f.video) {
    const v = siapkanVideo(f.video); BIOS.video = v;
    v.play().then(() => v.pause()).catch(() => {});
    const vt = new THREE.VideoTexture(v); vt.colorSpace = THREE.SRGBColorSpace;
    BIOS.vt = vt;
    v.onended = () => { if (mulaiKenangan()) return; hint('Filmnya selesai. Terima kasih sudah menonton! 🎬', 3500); setTimeout(() => { if (duduk && duduk.bioskop) berdiri(); }, 2500); };
  } else BIOS.yt = yt;
  BIOS.layarMat.map = textTex([f.judul, 'Segera dimulai…'], { w: 1024, h: 440, size: 72, size2: 48, bg: '#1d1d26', border: '#1d1d26' }); BIOS.layarMat.needsUpdate = true;
  // kursi pasangan di tengah baris ke-3
  const z = BIOS.rows[2], xi = Math.floor(BIOS.xs.length / 2) - 1;
  const ka = BIOS.kursi.find(k => k.z === z && k.x === BIOS.xs[xi]), kb = BIOS.kursi.find(k => k.z === z && k.x === BIOS.xs[xi + 1]);
  BIOS.kursi.forEach(k => k.terisi = false); ka.terisi = kb.terisi = true;
  duduk = { bioskop: true, a: [ka.x, ka.z], b: [kb.x, kb.z], h: ka.h, yaw: 0, sejak: 0 };
  camYaw = 0; camPitch = mode === 'tpp' ? 0.12 : -0.12;
  tampilBerdiri(true);
  hint('Penonton lain mulai masuk… film dimulai sebentar lagi 🍿', 4000);
  setTimeout(() => bicara(pick(['Filmnya kayaknya seru.', 'Kamu mau popcorn?', 'Aku suka nonton bareng kamu.'])), 1500);
  // penonton lain
  const kosong = BIOS.kursi.filter(k => !k.terisi).sort(() => Math.random() - 0.5);
  const jumlah = Math.min(kosong.length, F.penonton != null ? F.penonton : 24);
  for (let i = 0; i < jumlah; i++) {
    const k = kosong[i]; k.terisi = true;
    const N = buatNpc([rand(62, 74), rand(84, 88.5)]); N.speed = rand(1.6, 2);
    N.jalur = [[67.3, 81.5], [67.3, 78], [66.6, k.z + 1.1], [k.x, k.z + 1.1], [k.x, k.z]];
    N.tunda = i * 0.3; N.kursi = k; N.bioskop = true; N.gedung = 'bios';
    BIOS.penonton.push(N);
  }
}
function putarFilm() {
  const f = BIOS.film; if (!f) return;
  BIOS.status = 'putar';
  if (BIOS.video) {
    BIOS.layarMat.map = BIOS.vt; BIOS.layarMat.needsUpdate = true;
    BIOS.video.currentTime = 0; BIOS.video.play().catch(() => { hint('Ketuk ▶ untuk memutar film.', 3000); });
    $('btn-putar').classList.remove('sembunyi'); $('btn-putar').textContent = '⏸';
  } else if (!BIOS.yt) {
    BIOS.layarMat.map = textTex([f.judul, '▶ Sedang diputar'], { w: 1024, h: 440, size: 80, size2: 52, bg: '#1d2440', border: '#1d2440' }); BIOS.layarMat.needsUpdate = true;
  } else if (BIOS.yt) {
    $('yt-frame').src = `https://www.youtube.com/embed/${BIOS.yt}?autoplay=1&playsinline=1&rel=0`;
    $('yt').classList.remove('sembunyi');
  }
}
function selesaiFilm(diam) {
  KEN.aktif = false; if (KEN.v) { KEN.v.pause(); KEN.v = null; }
  if (BIOS.video) { BIOS.video.pause(); BIOS.video.removeAttribute('src'); BIOS.video.load(); BIOS.video = null; }
  if (BIOS.vt) { BIOS.vt.dispose(); BIOS.vt = null; }
  BIOS.yt = null; $('yt-frame').src = 'about:blank'; $('yt').classList.add('sembunyi');
  $('btn-putar').classList.add('sembunyi');
  BIOS.status = 'kosong'; BIOS.film = null;
  BIOS.layarMat.map = textTex(['Pilih film di loket', '🎬'], { w: 1024, h: 440, size: 80, size2: 120, bg: '#1d1d26', border: '#1d1d26' }); BIOS.layarMat.needsUpdate = true;
  for (const N of BIOS.penonton) { N.duduk = false; N.jalur = [[N.kursi.x, N.kursi.z + 1.1], [66.6, N.kursi.z + 1.1], [67.3, 78], [67.3, 84], [rand(50, 75), 88]]; N.pergi = true; N.tunda = rand(0, 3); }
  BIOS.penonton = [];
  BIOS.kursi.forEach(k => k.terisi = false);
}

/* ---------- update ---------- */
let cullT = 0;
function updateGedung(dt, t, dalam) {
  // redupkan lampu saat film diputar
  const gelap = dalam && dalam.id === 'bioskop' && BIOS.status === 'putar' ? 1 : (dalam && dalam.id === 'bioskop' ? 0.35 : 0);

  if (BIOS.status === 'masuk') { BIOS.timer -= dt; if (BIOS.timer <= 0 || (BIOS.timer < 14 && BIOS.penonton.every(n => n.duduk))) putarFilm(); }
  // penonton & pengunjung
  for (let i = npcs.length - 1; i >= 0; i--) {
    const N = npcs[i]; if (N.local || N.kendali) { continue; }
    if (N.vis === false && !N.pelayan && !N.bioskop) { N.P.group.visible = false; continue; }
    if (N.tunda > 0) { N.tunda -= dt; N.P.group.visible = false; continue; }
    N.P.group.visible = N.vis !== false;
    let moving = false;
    if (N.marah > 0) N.marah -= dt;
    if (N.duduk) {
      N.P.group.position.set(N.x, 0.52 - N.P.hip + (N.kursi && !N.pergi ? N.kursi.h : 0), N.z);
      for (const l of N.P.legs) l.rotation.x = -1.45;
      if (N.makan) N.P.headParts[0].rotation.x = 0.25 + Math.sin(t * 3 + i) * 0.12;
      if (N.makanSisa > 0) { N.makanSisa -= dt; if (N.makanSisa <= 0) { N.duduk = false; N.makan = false; N.P.headParts[0].rotation.x = 0; if (N.kursiFC) N.kursiFC.n = null; N.jalur = [[N.x, N.z - 1.3], [FC_PINTU[0], N.z - 1.3 > 76 ? 76 : N.z - 1.3], FC_PINTU, [rand(40, 85), 88]]; N.pergi = true; } }
    } else {
      if (!N.jalur.length && N.keliling) { const b = N.keliling; N.jalur = [[rand(b.x1 + 4, b.x2 - 4), rand(b.z1 + 4, b.z2 - 3)]]; N.diamT = rand(1, 4); }
      if (!N.jalur.length && N.jalan) rencanaJalan(N);
      if (N.marah > 0) {
        const dx = player.x - N.x, dz = player.z - N.z, d = Math.hypot(dx, dz);
        N.yaw += angDiff(N.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 8);
        if (d > 1.25 && d < 12) { const st = Math.min(d - 1.25, 2.2 * dt); N.x += dx / d * st; N.z += dz / d * st; moving = true; }
      }
      else if (N.diamT > 0) N.diamT -= dt;
      else if (N.jalur.length) {
        const [tx, tz] = N.jalur[0], dx = tx - N.x, dz = tz - N.z, d = Math.hypot(dx, dz);
        if (d < 0.15) {
          N.jalur.shift();
          if (!N.jalur.length) {
            if (N.pergi) { scene.remove(N.P.group); npcs.splice(i, 1); continue; }
            if (N.onArrive) { const f = N.onArrive; N.onArrive = null; f(N); }
            if (N.bioskop) { N.duduk = true; N.yaw = 0; }
          }
        } else {
          N.yaw += angDiff(N.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 8);
          const st = Math.min(d, N.speed * dt); N.x += dx / d * st; N.z += dz / d * st; moving = true;
        }
      }
      N.phase += moving ? dt * N.speed * 2.6 : 0;
      N.P.group.position.set(N.x, N.kursi && N.jalur.length <= 2 && !N.pergi ? N.kursi.h : (N.pergi && N.kursi && N.jalur.length >= 4 ? N.kursi.h : 0), N.z);
      animPerson(N.P, N.phase, moving ? 0.8 : 0);
      if (N.bawa) { swingArm(N.P.arms[0], -1.25, 1); swingArm(N.P.arms[1], -1.25, -1); }
      else if (N.tepuk) { const a = -1.3 + Math.sin(t * 13 + i) * 0.18; swingArm(N.P.arms[0], a, 1); swingArm(N.P.arms[1], a, -1); N.P.arms[0].pivot.rotation.z = 0.35 + Math.sin(t * 13 + i) * 0.25; N.P.arms[1].pivot.rotation.z = -0.35 - Math.sin(t * 13 + i) * 0.25; }
      else { swingArm(N.P.arms[0], -Math.sin(N.phase) * 0.4 * (moving ? 1 : 0), 1); swingArm(N.P.arms[1], Math.sin(N.phase) * 0.4 * (moving ? 1 : 0), -1); }
    }
    N.P.group.rotation.y = N.yaw + Math.PI;
  }
  // sembunyikan yang jauh supaya ringan di HP
  cullT -= dt;
  if (cullT <= 0) {
    cullT = 0.4;
    // hanya area di sekitar kalian yang ditampilkan & dijalankan
    const di = gedungDalam(player.x, player.z), luar = !di;
    for (const A of animals) A.group.visible = !A.sembunyi && luar && Math.hypot(A.group.position.x - player.x, A.group.position.z - player.z) < 75;
    AVI.aktif = luar && Math.hypot(player.x - AVI.x, player.z - AVI.z) < 70;
    if (AVI.group) AVI.group.visible = AVI.aktif;
    for (const B of burung) B.g.visible = AVI.aktif; for (const M of merak) M.g.visible = AVI.aktif;
    for (const J of JIP) J.group.visible = luar && Math.hypot(J.group.position.x - player.x, J.group.position.z - player.z) < 130;
    const kodeDi = di ? (di.id === 'foodcourt' ? 'fc' : 'bios') : null;
    for (const N of npcs) {
      if (N.local) { if (N.P.group.parent) N.P.group.parent.visible = luar || kodeDi === 'fc'; continue; }
      if (N.libur) N.vis = false;
      else if (N.gedung) N.vis = (!kodeDi || kodeDi === N.gedung) && Math.hypot((N.gedung === 'fc' ? 50 : 75) - player.x, (N.gedung === 'fc' ? 72 : 74) - player.z) < 40;
      else N.vis = luar && Math.hypot(N.x - player.x, N.z - player.z) < 55;
    }
  }
}

/* ---------- pengunjung di seluruh taman & teguran saat ditabrak ---------- */
function rencanaJalan(N) {
  const J = N.jalan, n = J.pts.length;
  let j = N.idx + Math.round(rand(-45, 45));
  if (J.closed) j = ((j % n) + n) % n; else j = clamp(j, 0, n - 1);
  const step = j > N.idx ? 2 : -2, jalur = [];
  for (let k = N.idx; step > 0 ? k < j : k > j; k += step) {
    const a = J.pts[k], b = J.pts[clamp(k + 1, 0, n - 1)] || a;
    let nx = -(b[1] - a[1]), nz = b[0] - a[0]; const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
    jalur.push([a[0] + nx * N.off, a[1] + nz * N.off]);
  }
  N.idx = j; N.jalur = jalur; N.diamT = rand(2, 9);
}
{
  const total = jalurJalan.reduce((a, r) => a + r.pts.length, 0);
  for (let i = 0; i < (F.pengunjung || 12); i++) {
    let r = Math.random() * total, J = jalurJalan[0];
    for (const x of jalurJalan) { if (r < x.pts.length) { J = x; break; } r -= x.pts.length; }
    const idx = Math.floor(Math.random() * J.pts.length), p0 = J.pts[idx];
    const N = buatNpc(p0); N.jalan = J; N.idx = idx; N.off = rand(-J.w * 0.35, J.w * 0.35); N.speed = rand(0.9, 1.35);
    N.x = p0[0]; N.z = p0[1]; N.diamT = rand(0, 5); N.acak = Math.random();
  }
}
const KATA_TABRAK = D.kataTabrak || ['Hati-hati kalau jalan! Pakai mata dong!'];
const gelNpc = document.createElement('div'); gelNpc.id = 'gelembung-npc'; gelNpc.className = 'sembunyi'; $('hud').appendChild(gelNpc);
let npcBicara = null, npcBicaraT = 0, tegurJeda = 0, npcKonteks = '', npcTerakhir = 0;
// balas dengan mengetik: tulisanmu muncul di atas kepala si cewek
const gelKamu = document.createElement('div'); gelKamu.id = 'gelembung-kamu'; gelKamu.className = 'sembunyi'; $('hud').appendChild(gelKamu);
let kamuBicaraT = 0;
function bukaBalas() {
  const N = npcBicara; if (!N) return;
  const ctx = npcKonteks;
  kartu('⌨️', 'Balas', '<input id="balas-teks" maxlength="120" placeholder="Ketik balasanmu…" autocomplete="off">', 'Kirim', () => {
    const t = ($('balas-teks') && $('balas-teks').value || '').trim(); if (!t) return;
    gelKamu.textContent = t; gelKamu.classList.remove('sembunyi'); kamuBicaraT = 4.5;
    if (!N.duduk || N.pergi) N.yaw = Math.atan2(-(player.x - N.x), -(player.z - N.z));
    const B = D.balasanNpc || {}; const r = B[ctx] || B._;
    if (r && r.length) setTimeout(() => { npcBicara = N; npcBicaraT = 2.8; gelNpc.textContent = pick(r); gelNpc.classList.remove('sembunyi'); }, 1800);
  });
  setTimeout(() => { const i = $('balas-teks'); if (i) { i.focus(); i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') $('k-aksi').onclick(); }; i.onkeyup = e => e.stopPropagation(); } }, 50);
}
$('btn-balas').onclick = bukaBalas;
function tabrakNpc(mx, mz) {
  for (const N of npcs) {
    if (N.local || N.pelayan || N.tunda > 0 || N.vis === false || !N.P.group.visible) continue;
    const dx = N.x - player.x, dz = N.z - player.z, d = Math.hypot(dx, dz), r = N.duduk ? 0.62 : 0.68;
    if (d < r && d > 1e-4) {
      player.x = N.x - dx / d * r; player.z = N.z - dz / d * r;
      const arah = (dx * mx + dz * mz) / d;
      if (arah > 0.3 && tegurJeda <= 0 && !(N.tegurT > performance.now() - 8000)) tegur(N);
    }
  }
}
function tegur(N) {
  N.tegurT = performance.now(); tegurJeda = 3;
  if (!N.duduk) { N.marah = 4; N.diamT = 0; }
  npcBicara = N; npcBicaraT = 2.8; npcKonteks = 'tegur';
  gelNpc.textContent = pick(KATA_TABRAK); gelNpc.classList.remove('sembunyi');
  setTimeout(() => bicara(pick(D.maafPasangan || ['Maaf ya, nggak sengaja.']), 3), 3000);
}
// pengunjung minta izin duduk di meja kita
const NUMPANG = { jeda: rand(10, 18), N: null };
function updateNumpang(dt) {
  if (NUMPANG.N || !duduk || !duduk.meja || paused) return;
  NUMPANG.jeda -= dt; if (NUMPANG.jeda > 0) return;
  NUMPANG.jeda = rand(30, 50);
  const m = duduk.meja, k = m.kursiU.find(c => !c.n);
  if (!k || Math.random() < 0.25) return;
  const lorong = m.x < 45 ? 46.75 : m.x - 3.25;
  const N = npcGedung(buatNpc([FC_PINTU[0], FC_PINTU[1] - 0.4]), 'fc'); N.speed = rand(1.2, 1.5);
  k.n = N; N.kursiFC = k; NUMPANG.N = N;
  const duduki = () => { N.jalur = [[k.x, k.z]]; N.onArrive = () => { npcDuduk(N, k.x, k.z, Math.PI); N.makan = true; N.makanSisa = rand(35, 60); }; };
  N.jalur = [[lorong, 77.2], [lorong, k.z - 1.0], [k.x, k.z - 1.0]];
  N.onArrive = () => {
    if (!duduk || duduk.meja !== m) { NUMPANG.N = null; duduki(); return; }
    N.yaw = Math.atan2(-(player.x - N.x), -(player.z - N.z));
    const tanya = pick(D.tanyaNumpang || ['Permisi, apakah boleh duduk di sini?']);
    npcBicara = N; npcBicaraT = 99; npcKonteks = 'numpang'; gelNpc.textContent = tanya; gelNpc.classList.remove('sembunyi');
    kartu('🙋', 'Pengunjung bertanya', `<p style="text-align:center;font-size:17px">"${tanya}"</p>`, 'Boleh 😊', () => {
      NUMPANG.N = null; npcBicaraT = 2.5; npcKonteks = 'boleh'; gelNpc.textContent = pick(D.jawabBoleh || ['Terima kasih ya!']); duduki();
    });
    $('k-tutup').textContent = 'Tidak';
    kartuTidak = () => {
      NUMPANG.N = null; k.n = null; N.kursiFC = null;
      npcBicaraT = 3; npcKonteks = 'pelit'; gelNpc.textContent = pick(D.jawabPelit || ['Dasar pelit!']);
      N.diamT = 1.2; N.jalur = [[lorong, k.z - 1.0], [lorong, 77.2], FC_PINTU, [rand(40, 85), 88]]; N.pergi = true;
      setTimeout(() => bicara(pick(D.setelahPelit || ['Biarin aja, kita lagi pengin berdua kan.']), 3), 3200);
    };
  };
}
function updateTegur(dt) {
  updateNumpang(dt);
  if (tegurJeda > 0) tegurJeda -= dt;
  if (npcBicaraT > 0 && npcBicaraT < 90) npcTerakhir = performance.now();
  const bisaBalas = npcBicara && !paused && performance.now() - npcTerakhir < 7000 && Math.hypot(npcBicara.x - player.x, npcBicara.z - player.z) < 9 && npcs.includes(npcBicara);
  $('btn-balas').classList.toggle('sembunyi', !bisaBalas);
  if (kamuBicaraT > 0) {
    kamuBicaraT -= dt;
    tmpA.set(player.x, kamu.group.position.y + 1.95, player.z).project(camera);
    if (tmpA.z < 1) { const hw = gelKamu.offsetWidth / 2 + 8; gelKamu.style.left = clamp((tmpA.x + 1) / 2 * innerWidth, hw, innerWidth - hw) + 'px'; gelKamu.style.top = clamp((1 - tmpA.y) / 2 * innerHeight, 80, innerHeight - 40) + 'px'; }
    if (kamuBicaraT <= 0) gelKamu.classList.add('sembunyi');
  }
  if (npcBicaraT > 0) {
    npcBicaraT -= dt;
    const N = npcBicara;
    tmpA.set(N.x, N.duduk ? 1.6 : 2.05, N.z).project(camera);
    if (tmpA.z < 1) { gelNpc.style.left = clamp((tmpA.x + 1) / 2 * innerWidth, 90, innerWidth - 90) + 'px'; gelNpc.style.top = clamp((1 - tmpA.y) / 2 * innerHeight, 80, innerHeight - 40) + 'px'; }
    if (npcBicaraT <= 0) gelNpc.classList.add('sembunyi');
  }
}
$('btn-berdiri').onclick = berdiri;
$('btn-makan').onclick = mulaiMakan;
$('btn-putar').onclick = () => { const v = BIOS.video; if (!v) return; if (v.paused) { v.play(); $('btn-putar').textContent = '⏸'; } else { v.pause(); $('btn-putar').textContent = '▶'; } };
$('yt-tutup').onclick = () => { if (BIOS.status === 'putar' && duduk && duduk.bioskop && adaKenangan() && !KEN.sudah) { BIOS.yt = null; $('yt-frame').src = 'about:blank'; $('yt').classList.add('sembunyi'); mulaiKenangan(); return; } berdiri(); };
/* papan nama setiap area */

/* ------------------------------------------------------------------ taman burung (aviary) */
const AVI = { x: 76, z: -50, r: 10, h: 7.2 };
const burung = [];
{
  const { x: ax, z: az, r: R, h: H } = AVI;
  const g = new THREE.Group(); g.position.set(ax, 0, az); scene.add(g); AVI.group = g;
  const pintuA = -Math.PI / 2, celah = 0.26; // pintu menghadap barat
  const tBatu = tex(256, 64, (c, w, h) => {
    c.fillStyle = '#4a4a46'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 9; x++) { c.fillStyle = ['#5c5b55', '#6a6862', '#55544f', '#4f4e49'][(x + y) % 4]; const ox = (y % 2) * 14; c.beginPath(); c.roundRect(x * 30 + ox - 12 + rand(-2, 2), y * 16 + 1, 26 + rand(-3, 3), 14, 4); c.fill(); }
  }, [10, 1]);
  const mBatu = new THREE.MeshLambertMaterial({ map: tBatu, side: THREE.DoubleSide });
  const tJaring = tex(128, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.strokeStyle = 'rgba(40,44,46,0.75)'; c.lineWidth = 1.2;
    for (let i = 0; i <= 16; i++) { c.beginPath(); c.moveTo(i * 8, 0); c.lineTo(i * 8, h); c.stroke(); c.beginPath(); c.moveTo(0, i * 8); c.lineTo(w, i * 8); c.stroke(); }
  }, [60, 8]);
  const mJaring = new THREE.MeshLambertMaterial({ map: tJaring, transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.05 });
  const busur = (y0, tinggi, gap, mat) => {
    const geo = new THREE.CylinderGeometry(R, R, tinggi, 48, 1, true, gap ? pintuA + celah : 0, gap ? Math.PI * 2 - celah * 2 : Math.PI * 2);
    const m = new THREE.Mesh(geo, mat); m.position.y = y0 + tinggi / 2; g.add(m); m.receiveShadow = true; return m;
  };
  // dinding batu (dengan celah pintu) + bibir atas
  busur(0, 1.3, true, mBatu);
  const bibir = new THREE.Mesh(new THREE.RingGeometry(R - 0.35, R + 0.05, 48, 1, pintuA + celah, Math.PI * 2 - celah * 2), mat('#5c5b55', { side: THREE.DoubleSide }));
  bibir.rotation.x = -Math.PI / 2; bibir.position.y = 1.31; g.add(bibir);
  // jaring kawat: bagian bawah dengan celah pintu, bagian atas penuh, lalu kubah
  busur(1.3, 1.5, true, mJaring);
  busur(2.8, H - 2.8, false, mJaring);
  const tJ2 = tJaring.clone(); tJ2.repeat.set(50, 6); tJ2.needsUpdate = true;
  const kubah = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ map: tJ2, transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.05 }));
  kubah.scale.y = 0.38; kubah.position.y = H; g.add(kubah);
  // rangka besi
  const besi = '#2d3133';
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2;
    if (Math.abs(angDiff(a, Math.PI * 2 + pintuA + Math.PI / 2 * 0)) < 0.05) continue;
    const px = Math.sin(a) * (R - 0.05), pz = Math.cos(a) * (R - 0.05);
    mesh(cyl(0.07, 0.07, H - 1.3, 5), besi, px, 1.3 + (H - 1.3) / 2, pz, g, false);
    // rusuk kubah
    const rus = new THREE.Group(); rus.position.set(0, H, 0); rus.rotation.y = a; g.add(rus);
    for (let k = 0; k < 6; k++) {
      const t0 = k / 6 * Math.PI / 2, t1 = (k + 1) / 6 * Math.PI / 2;
      const p0 = [Math.cos(t0) * R, Math.sin(t0) * R * 0.38], p1 = [Math.cos(t1) * R, Math.sin(t1) * R * 0.38];
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const b = mesh(box(0.08, L, 0.08), besi, 0, (p0[1] + p1[1]) / 2, (p0[0] + p1[0]) / 2, rus, false);
      b.rotation.x = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);
    }
  }
  for (const y of [2.8, 5, H]) { const cin = mesh(new THREE.TorusGeometry(R - 0.05, 0.05, 4, 48), besi, 0, y, 0, g, false); cin.rotation.x = Math.PI / 2; }
  mesh(cyl(0.12, 0.14, H + R * 0.38, 6), besi, 0, (H + R * 0.38) / 2, 0, g, false);
  // pintu
  const dx = Math.sin(pintuA) * R, dz = Math.cos(pintuA) * R;
  for (const s of [-1, 1]) { const a = pintuA + s * celah; mesh(cyl(0.1, 0.1, 2.8, 6), besi, Math.sin(a) * R, 1.4, Math.cos(a) * R, g, false); }
  const ambang = mesh(box(0.15, 0.2, 2.6), besi, dx, 2.8, dz, g, false);
  // tirai rantai di pintu supaya burung tidak keluar
  const mTirai = new THREE.MeshLambertMaterial({ color: '#9aa0a2', transparent: true, opacity: 0.55 });
  for (let i = 0; i < 12; i++) { const zz = -1.15 + i * 0.21; mesh(box(0.02, 2.6, 0.03), mTirai, dx + 0.05, 1.4, zz, g, false); }
  // papan MASUK & nama
  const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.35), new THREE.MeshLambertMaterial({ map: textTex(['MASUK'], { w: 256, h: 100, size: 54, bg: '#a44b2c', border: '#a44b2c' }) }));
  const am = pintuA + celah + 0.09; pm.position.set(Math.sin(am) * (R + 0.03), 0.85, Math.cos(am) * (R + 0.03)); pm.rotation.y = am; g.add(pm);
  const nama = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.2), new THREE.MeshBasicMaterial({ map: tex(512, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.font = '600 92px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#d9f2ec'; c.strokeStyle = '#2f5d4a'; c.lineWidth = 6; c.strokeText('Taman Burung', w / 2, h / 2); c.fillText('Taman Burung', w / 2, h / 2); }), transparent: true }));
  const an = pintuA - 0.75; nama.position.set(Math.sin(an) * (R + 0.6), 0.75, Math.cos(an) * (R + 0.6)); nama.rotation.y = an + Math.PI; g.add(nama);
  // lantai dalam, jalan kayu melingkar, tanaman
  const lantai = new THREE.Mesh(new THREE.CircleGeometry(R - 0.2, 40), new THREE.MeshLambertMaterial({ map: tTanah, color: '#d6e8b0', polygonOffset: true, polygonOffsetFactor: -2 }));
  lantai.rotation.x = -Math.PI / 2; lantai.position.y = 0.03; g.add(lantai);
  const jalanKayu = new THREE.Mesh(new THREE.RingGeometry(5.2, 7, 48), new THREE.MeshLambertMaterial({ map: tex(64, 64, (c, w, h) => { c.fillStyle = '#b08455'; c.fillRect(0, 0, w, h); c.strokeStyle = '#7a5634'; c.lineWidth = 2; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(i * 8, 0); c.lineTo(i * 8, h); c.stroke(); } }, [8, 1]), polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide }));
  jalanKayu.rotation.x = -Math.PI / 2; jalanKayu.position.y = 0.06; g.add(jalanKayu);
  // pagar kayu rendah di tepi dalam jalan
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; mesh(cyl(0.05, 0.05, 0.9, 5), '#8b6440', Math.sin(a) * 5.1, 0.45, Math.cos(a) * 5.1, g, false); }
  for (const y of [0.45, 0.85]) { const t = mesh(new THREE.TorusGeometry(5.1, 0.04, 4, 48), '#8b6440', 0, y, 0, g, false); t.rotation.x = Math.PI / 2; }
  // pondok jerami di tengah
  mesh(cyl(1.8, 1.8, 2.2, 12), '#7a5634', 0, 1.1, 0, g);
  mesh(cone(3.1, 2.4, 14), '#c9a35a', 0, 3.4, 0, g);
  mesh(cone(3.2, 0.4, 14), '#b08f4a', 0, 2.35, 0, g);
  // pohon & tempat bertengger
  const tenggeran = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + 0.5, rr = 3.6, px = Math.sin(a) * rr, pz = Math.cos(a) * rr;
    mesh(cyl(0.15, 0.22, 4.2, 6), '#6b4a2b', px, 2.1, pz, g);
    const d = mesh(new THREE.IcosahedronGeometry(1.4, 0), '#4f8a3c', px, 4.6, pz, g); d.scale.set(1, 0.8, 1);
    const cab = mesh(cyl(0.05, 0.05, 1.8, 5), '#6b4a2b', px, 3.2, pz, g, false); cab.rotation.z = Math.PI / 2; cab.rotation.y = a;
    tenggeran.push([ax + px + Math.cos(a) * 0.7, 3.27, az + pz - Math.sin(a) * 0.7], [ax + px - Math.cos(a) * 0.7, 3.27, az + pz + Math.sin(a) * 0.7]);
  }
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const px = Math.sin(a) * 8.6, pz = Math.cos(a) * 8.6; if (Math.abs(angDiff(a, pintuA + Math.PI * 2)) < 0.5) continue; mesh(cyl(0.06, 0.06, 3.4, 5), '#6b4a2b', px, 1.7, pz, g, false); tenggeran.push([ax + px, 3.45, az + pz]); }
  for (let i = 0; i < 10; i++) { const a = rand(0, Math.PI * 2), rr = rand(7.4, 9); const b = mesh(new THREE.IcosahedronGeometry(0.7, 0), '#5c9a44', Math.sin(a) * rr, 0.45, Math.cos(a) * rr, g); b.scale.y = 0.7; }
  AVI.tenggeran = tenggeran;
  // tabrakan: dinding melingkar (kecuali pintu), pondok, pagar dalam
  const n = 40;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, mid = (a0 + a1) / 2;
    if (Math.abs(angDiff(mid, pintuA)) < celah + 0.02) continue;
    addSeg(ax + Math.sin(a0) * R, az + Math.cos(a0) * R, ax + Math.sin(a1) * R, az + Math.cos(a1) * R);
  }
  for (let i = 0; i < 28; i++) { const a0 = i / 28 * Math.PI * 2, a1 = (i + 1) / 28 * Math.PI * 2; if (Math.abs(angDiff((a0 + a1) / 2, pintuA)) < 0.2) continue; addSeg(ax + Math.sin(a0) * 5.1, az + Math.cos(a0) * 5.1, ax + Math.sin(a1) * 5.1, az + Math.cos(a1) * 5.1); }
  mapAreas.push({ id: 'burung', type: 'circle', x: ax, z: az, r: R });
}
// burung
function modelBurung(jenis) {
  const S = {
    makaw: { b: '#d63a2a', s: '#2f6fd6', e: '#f2d14b', k: '#f4efe4', paruh: '#2a2a2a', ukuran: 1.2, ekor: 0.45 },
    makawBiru: { b: '#2f7fd6', s: '#2f5fb6', e: '#f2c12e', k: '#f4efe4', paruh: '#2a2a2a', ukuran: 1.2, ekor: 0.45 },
    kakatua: { b: '#f6f4ec', s: '#efece0', e: '#f6f4ec', k: '#f6f4ec', paruh: '#3a3a3a', ukuran: 1, ekor: 0.25, jambul: '#f2d14b' },
    lovebird: { b: '#6ac04a', s: '#4fa03a', e: '#2f7fd6', k: '#f29b4b', paruh: '#e8603a', ukuran: 0.6, ekor: 0.15 },
    rangkong: { b: '#1f1f1f', s: '#1a1a1a', e: '#f4efe4', k: '#1f1f1f', paruh: '#f2b33c', ukuran: 1.35, ekor: 0.5, cula: '#e8603a' }
  }[jenis];
  const g = new THREE.Group(), s = S.ukuran * 0.22;
  const badan = mesh(sph(1, 9, 7), S.b, 0, 0, 0, g, false); badan.scale.set(s * 0.8, s * 0.85, s * 1.5);
  const kepala = mesh(sph(s * 0.7, 9, 7), S.k, 0, s * 0.75, s * 1.2, g, false);
  const pr = mesh(cone(s * 0.28, jenis === 'rangkong' ? s * 1.6 : s * 0.6, 6), S.paruh, 0, s * 0.62, s * (jenis === 'rangkong' ? 2.4 : 1.8), g, false); pr.rotation.x = jenis === 'rangkong' ? 1.75 : 2.1;
  if (S.cula) { const c = mesh(cone(s * 0.2, s * 0.9, 5), S.cula, 0, s * 1.05, s * 1.9, g, false); c.rotation.x = 1.5; }
  if (S.jambul) for (let i = 0; i < 3; i++) { const j = mesh(cone(s * 0.12, s * 0.8, 4), S.jambul, 0, s * 1.35, s * (0.9 - i * 0.25), g, false); j.rotation.x = -0.5 - i * 0.2; }
  for (const sx of [-1, 1]) mesh(sph(s * 0.12, 5, 4), '#111', sx * s * 0.45, s * 0.85, s * 1.55, g, false);
  const ekor = mesh(box(s * 0.6, s * 0.12, s * 3 * S.ekor / 0.3 * 0.3 + s), S.e, 0, -s * 0.15, -s * 1.9, g, false); ekor.rotation.x = 0.25;
  const sayap = [];
  for (const sx of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(sx * s * 0.7, s * 0.3, 0); g.add(p);
    const w = mesh(box(s * 2.4, s * 0.1, s * 1.3), S.s, sx * s * 1.15, 0, -s * 0.1, p, false);
    sayap.push(p);
  }
  scene.add(g);
  return { g, sayap, s };
}
const JENIS_BURUNG = ['makaw', 'makaw', 'makawBiru', 'makawBiru', 'kakatua', 'kakatua', 'kakatua', 'lovebird', 'lovebird', 'lovebird', 'lovebird', 'lovebird', 'lovebird', 'rangkong', 'rangkong', 'makaw', 'lovebird', 'lovebird', 'kakatua', 'makawBiru'];
function titikTerbang() { const a = rand(0, Math.PI * 2), rr = Math.sqrt(Math.random()) * 8; return [AVI.x + Math.sin(a) * rr, rand(2.6, AVI.h + 1.8 * (1 - rr / 8)), AVI.z + Math.cos(a) * rr]; }
for (const j of JENIS_BURUNG) {
  const m = modelBurung(j), p = titikTerbang();
  const B = { ...m, jenis: j, pos: new THREE.Vector3(...p), tujuan: new THREE.Vector3(...titikTerbang()), vel: new THREE.Vector3(), hinggap: 0, fase: rand(0, 6), yaw: 0, speed: j === 'lovebird' ? 3.2 : 2.6 };
  B.g.position.copy(B.pos);
  burung.push(B);
  addInteract(B.g, 'hewan', j === 'makawBiru' ? 'makaw' : j, 0);
}
// merak berjalan di lantai
const merak = [];
for (let i = 0; i < 2; i++) {
  const g = new THREE.Group(); scene.add(g);
  const b = mesh(sph(1, 9, 7), '#2f6fb0', 0, 0.55, 0, g, false); b.scale.set(0.2, 0.22, 0.36);
  const leher = mesh(cyl(0.05, 0.07, 0.5, 6), '#2a5fc0', 0, 0.85, 0.22, g, false); leher.rotation.x = 0.3;
  mesh(sph(0.07, 7, 5), '#2a5fc0', 0, 1.12, 0.32, g, false);
  for (let k = 0; k < 3; k++) mesh(sph(0.018, 4, 3), '#3aa0d0', -0.03 + k * 0.03, 1.24, 0.3, g, false);
  mesh(cone(0.02, 0.07, 4), '#d8c49a', 0, 1.11, 0.42, g, false).rotation.x = Math.PI / 2;
  for (const sx of [-0.06, 0.06]) mesh(limbDown(0.015, 0.012, 0.42), '#8a7a6a', sx, 0.42, 0, g, false);
  const kipas = new THREE.Mesh(new THREE.CircleGeometry(1.1, 18, 0, Math.PI), new THREE.MeshLambertMaterial({ map: tex(128, 64, (c, w, h) => { c.fillStyle = '#3c7a3a'; c.fillRect(0, 0, w, h); for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) { const a = k / 8 * Math.PI, rr = 14 + r * 13; const x = w / 2 + Math.cos(a) * rr * 2, y = h - Math.sin(a) * rr; c.fillStyle = '#c9a33a'; c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); c.fillStyle = '#2a5fc0'; c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); } }), side: THREE.DoubleSide }));
  kipas.position.set(0, 0.6, -0.3); g.add(kipas);
  const M = { g, kipas, x: AVI.x + rand(-7, 7), z: AVI.z + rand(-7, 7), yaw: 0, t: rand(0, 5), tujuan: null, buka: 0 };
  merak.push(M); addInteract(g, 'hewan', 'merak', 0);
}
function updateBurung(dt, t) {
  if (!AVI.aktif) return;
  for (const B of burung) {
    B.fase += dt * (B.hinggap > 0 ? 2 : 22);
    if (B.hinggap > 0) {
      B.hinggap -= dt;
      for (const [k, w] of B.sayap.entries()) w.rotation.z = (k ? -1 : 1) * 0.1;
      B.g.position.y = B.pos.y + Math.sin(B.fase) * 0.01;
      if (B.hinggap <= 0) B.tujuan.set(...titikTerbang());
      continue;
    }
    const d = tmpA.copy(B.tujuan).sub(B.pos), L = d.length();
    if (L < 0.4) {
      if (Math.random() < 0.35) { const tg = pick(AVI.tenggeran); B.tujuan.set(tg[0], tg[1] + B.s * 0.9, tg[2]); B.mauHinggap = true; }
      else { B.tujuan.set(...titikTerbang()); B.mauHinggap = false; }
      if (B.mauHinggap && L < 0.4) { }
    }
    if (B.mauHinggap && L < 0.3) { B.hinggap = rand(4, 12); B.mauHinggap = false; B.pos.copy(B.tujuan); B.g.position.copy(B.pos); continue; }
    d.normalize();
    B.vel.lerp(d.multiplyScalar(B.speed), Math.min(1, dt * 2.2));
    B.pos.addScaledVector(B.vel, dt);
    // tetap di dalam sangkar
    const rx = B.pos.x - AVI.x, rz = B.pos.z - AVI.z, rr = Math.hypot(rx, rz);
    if (rr > 8.8) { B.pos.x = AVI.x + rx / rr * 8.8; B.pos.z = AVI.z + rz / rr * 8.8; }
    B.pos.y = clamp(B.pos.y, 1.6, AVI.h + 3.2 * Math.max(0, 1 - rr / 9.5));
    B.g.position.copy(B.pos);
    const yawT = Math.atan2(B.vel.x, B.vel.z);
    const belok = angDiff(B.yaw, yawT); B.yaw += belok * Math.min(1, dt * 5);
    B.g.rotation.set(-B.vel.y * 0.12, B.yaw, -belok * 0.8);
    const kepak = Math.sin(B.fase) * 0.9;
    B.sayap[0].rotation.z = kepak; B.sayap[1].rotation.z = -kepak;
  }
  for (const M of merak) {
    M.t -= dt;
    if (!M.tujuan || M.t < 0) { const a = rand(0, Math.PI * 2), rr = rand(7.4, 8.8); M.tujuan = [AVI.x + Math.sin(a) * rr, AVI.z + Math.cos(a) * rr]; M.t = rand(5, 12); M.mekar = Math.random() < 0.4; }
    const dx = M.tujuan[0] - M.x, dz = M.tujuan[1] - M.z, L = Math.hypot(dx, dz);
    const jalan = L > 0.3 && !(M.buka > 0.5);
    if (jalan) { M.yaw += angDiff(M.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 3); M.x += Math.sin(M.yaw) * 0.5 * dt; M.z += Math.cos(M.yaw) * 0.5 * dt; }
    M.buka = lerp(M.buka, !jalan && M.mekar ? 1 : 0, Math.min(1, dt * 1.5));
    M.kipas.rotation.x = lerp(-1.35, 0.15, M.buka); M.kipas.scale.setScalar(lerp(0.45, 1, M.buka));
    M.g.position.set(M.x, jalan ? Math.abs(Math.sin(t * 6)) * 0.02 : 0, M.z); M.g.rotation.y = M.yaw;
  }
}

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
  { id: 'foodcourt', nama: 'Food Court', x: 50, z: 70, r: 14 },
  { id: 'burung', nama: 'Taman Burung', x: 76, z: -50, r: 15, sign: [62, -44, -1.2] },
  { id: 'bioskop', nama: 'Bioskop', x: 75, z: 70, r: 14 },
  { id: 'tamanbermain', nama: 'Taman Bermain', x: 13, z: 71.5, r: 15 },
  { id: 'safari', nama: 'Jalur Safari', x: -55, z: 5, r: 60 },
  { id: 'jalan', nama: 'Jalan Utama', x: 14, z: -40, r: 400 }
];
const SPES_ZONA = { flamingo: 'flamingo', gajah: 'gajah', singa: 'singa', unta: 'unta', bison: 'bison', jerapah: 'jerapah', zebra: 'zebra', babyzoo: 'kelinci', burung: 'makaw', harimau: 'harimau', beruang: 'beruang', panda: 'panda' };
for (const z of ZONES) if (z.sign) { const sp = INFO[SPES_ZONA[z.id]]; papanZona(z.sign[0], z.sign[1], z.sign[2], z.nama.replace('Zona ', ''), sp ? sp.emoji + ' ' + (z.id === 'babyzoo' ? 'kelinci' : '') : '', z.id); }
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
  if (AMATI.aktif) { if (e.code === 'Escape') selesaiAmati(); return; }
  if (e.code === 'KeyV') toggleMode();
  if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); if (nearest) openInter(nearest); }
  if (e.code === 'KeyM') bukaPeta();
});
addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('pointerdown', e => {
  if (!started || paused) return;
  canvas.setPointerCapture(e.pointerId);
  const isJoy = !AMATI.aktif && e.pointerType !== 'mouse' && e.clientX < innerWidth * 0.5 && e.clientY > innerHeight * 0.45 && joy.id === null;
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
  if (AMATI.aktif) { AMATI.yaw -= dx * sens; AMATI.pitch = clamp(AMATI.pitch + dy * sens * 0.8, 0.02, 1.2); AMATI.geser = performance.now(); return; }
  camYaw -= dx * sens;
  camPitch = clamp(camPitch + dy * sens * 0.8, -1.1, 1.15);
});
function endPointer(e) {
  if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; resetJoy(); return; }
  const l = look.get(e.pointerId); if (!l) return; look.delete(e.pointerId);
  if (l.moved < 10 && performance.now() - l.t < 350 && !AMATI.aktif) tapAt(e.clientX, e.clientY);
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
  // ketuk kandang (pagar / tanah di dalamnya)
  for (const y of [0.9, 0.2]) {
    const tgt = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3());
    if (!tgt || Math.hypot(tgt.x - player.x, tgt.z - player.z) > 60) continue;
    const A = animals.find(a => a.group.visible && insideEncl(a.encl, tgt.x, tgt.z, -1.2));
    if (A) { mulaiAmati(A.kind); return; }
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
  if (it.kind === 'hewan' && animals.some(a => a.kind === it.data)) { mulaiAmati(it.data, it.obj); return; }
  if (it.kind === 'papan' && animals.some(a => a.kind === SPES_ZONA[it.data])) { mulaiAmati(SPES_ZONA[it.data]); return; }
  if (it.kind === 'papan' && it.data === 'peta') { bukaPeta(); return; }
  let info, key;
  if (it.kind === 'hewan') { key = it.data; info = INFO[key]; }
  else if (it.kind === 'papan') { key = SPES_ZONA[it.data]; info = INFO[key]; if (!info) return; if (it.data === 'babyzoo') info = { nama: 'Kebun Binatang Mini', emoji: '🐰', fakta: [...INFO.kelinci.fakta], makan: true }; }
  else if (it.kind === 'kios') { if (antriPemain) { hint('Kalian sedang antre.'); return; } tawarAntri(KIOS[it.data].antrian, () => bukaKios(it.data), KIOS[it.data].emoji + ' ' + KIOS[it.data].nama); return; }
  else if (it.kind === 'meja') { if (it.data.penuh) { hint('Meja ini penuh. Cari meja lain yang kosong ya.'); return; } dudukMeja(it.data); return; }
  else if (it.kind === 'bioskop') { if (antriPemain) { hint('Kalian sedang antre.'); return; } if (it.obj === BIOS.layar) bukaFilm(); else tawarAntri(BIOS.antrian, bukaFilm, '🎟️ Loket Tiket'); return; }
  else if (it.kind === 'hidangan') { lihatHidangan(it.data); return; }
  else if (it.kind === 'pakan') { bukaBooth(it.data); return; }
  else if (it.kind === 'halte') { bukaJadwal(it.data); return; }
  else if (it.kind === 'wahana') { tawarWahana(it.data); return; }
  else if (it.kind === 'surat') { bukaSurat(it.data); return; }
  else if (it.kind === 'kue') { if (KUE.ditiup) hint('Kuenya enak! Selamat ulang tahun 🎂', 3000); else tanyaTiup(); return; }
  else if (it.kind === 'spotFoto') { bukaKamera(it.data); return; }
  else if (it.kind === 'loketMasuk') { if (antriPemain) { hint('Kalian sedang antre.'); return; } if (sudahTiket()) { hint('Tiket sudah dibeli. Langsung masuk lewat gerbang.', 3000); return; } tawarAntri(LOKET_MASUK[it.data], bukaTiketMasuk, '🎟️ Loket Masuk'); return; }
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
function tutupKartu() { $('kartu').classList.add('sembunyi'); paused = false; if (antriPemain && antriPemain.dilayani) keluarAntrian(); }
$('k-tutup').onclick = () => { const f = kartuTidak; kartuTidak = null; tutupKartu(); if (f) f(); };
$('k-aksi').onclick = () => { const f = kartuAksi; kartuTidak = null; tutupKartu(); if (f) f(); };

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

/* lihat hewan dari dekat */
const AMATI = { aktif: false, list: [], idx: 0, A: null, yaw: 0, pitch: 0.3, dist: 4, zoom: 1, cx: 0, cy: 1, cz: 0, geser: 0, suap: null, faktaI: 0, faktaT: 0 };
const ukuranHewan = {};
function ukuran(A) {
  if (!ukuranHewan[A.kind]) { const s = new THREE.Box3().setFromObject(A.group).getSize(new THREE.Vector3()); ukuranHewan[A.kind] = { r: Math.max(s.x, s.y, s.z) * 0.5, h: s.y }; }
  return ukuranHewan[A.kind];
}
const wortel = new THREE.Group();
{ const w = new THREE.Mesh(cone(0.03, 0.2, 7), new THREE.MeshLambertMaterial({ color: '#f08a24', flatShading: true })); w.position.y = -0.13; wortel.add(w); w.rotation.x = Math.PI; for (const a of [-0.4, 0, 0.4]) { const d = mesh(cone(0.012, 0.09, 4), '#4f9a3a', 0, -0.01, 0, wortel, false); d.rotation.z = a; d.position.x = Math.sin(a) * 0.03; } }
wortel.visible = false; kamu.arms[1].hand.add(wortel);
// booth pakan di sebelah kandang hewan yang boleh diberi makan
const PAKAN = D.pakanHewan || {
  kelinci: [['Wortel', 10000], ['Kangkung', 12000]], zebra: [['Rumput Segar', 10000], ['Wortel', 12000]],
  unta: [['Rumput Kering', 10000], ['Wortel', 12000]], bison: [['Rumput Segar', 10000], ['Jagung', 15000]],
  jerapah: [['Daun Akasia', 15000], ['Wortel', 12000]], gajah: [['Pisang', 15000], ['Tebu', 20000]]
};
const WARNA_PAKAN = n => /wortel/i.test(n) ? '#f08a24' : /pisang|jagung/i.test(n) ? '#f2d14b' : /tebu/i.test(n) ? '#9a6a3a' : '#5aa83a';
const STOK = {};
const stokHewan = (k) => (PAKAN[k] || []).map(([n]) => [n, STOK[k + '|' + n] || 0]).filter(x => x[1] > 0);
const BOOTH = {};
function bukaBooth(k) {
  const info = INFO[k], list = PAKAN[k]; if (!list) return;
  const html = '<div class="menu">' + list.map(([n, h], j) => `<div class="menu-item" data-j="${j}"><span>${n}<small>${fmtRp(h)} / porsi · punya ${STOK[k + '|' + n] || 0}</small></span><button class="qty" data-d="-1">−</button><b class="jml">0</b><button class="qty" data-d="1">+</button></div>`).join('') + '</div>' +
    `<div class="total">Total: <b id="total">Rp0</b></div><div class="catatan">💰 Uang kalian: ${fmtRp(DOMPET.sisa)} · 1 porsi untuk 1 kali memberi makan</div>`;
  kartu('🥕', 'Pakan ' + info.nama, html, 'Beli', () => {
    let tot = 0; const beli = [];
    document.querySelectorAll('#k-isi .menu-item').forEach(r => { const q = +r.querySelector('.jml').textContent; if (q) { const [n, h] = list[+r.dataset.j]; tot += q * h; beli.push([n, q]); } });
    if (!beli.length) { hint('Pilih pakannya dulu.'); return; }
    if (!bayar(tot)) { hint(`Uangnya nggak cukup. Totalnya ${fmtRp(tot)}, sisa uang ${fmtRp(DOMPET.sisa)}.`, 3800); return; }
    for (const [n, q] of beli) STOK[k + '|' + n] = (STOK[k + '|' + n] || 0) + q;
    hint(`Dapat ${beli.map(([n, q]) => q + '× ' + n).join(', ')}. Ketuk kandangnya untuk memberi makan.`, 3500);
    if (AMATI.aktif && AMATI.A && AMATI.A.kind === k) setTimeout(tanyaMakan, 300);
  });
  $('k-isi').onclick = (e) => {
    const b = e.target.closest('.qty'); if (!b) return;
    const j = b.closest('.menu-item').querySelector('.jml'); j.textContent = clamp(+j.textContent + +b.dataset.d, 0, 9);
    let tot = 0; document.querySelectorAll('#k-isi .menu-item').forEach(r => tot += +r.querySelector('.jml').textContent * list[+r.dataset.j][1]);
    $('total').textContent = fmtRp(tot) + (tot > DOMPET.sisa ? ' (uang kurang)' : '');
  };
}
for (const z of ZONES) {
  const k = SPES_ZONA[z.id]; if (!z.sign || !PAKAN[k]) continue;
  const [sx, sz, rot] = z.sign, c = Math.cos(rot), sn = Math.sin(rot);
  const x = sx + c * 3.4, zz = sz - sn * 3.4;
  const g = new THREE.Group(); g.position.set(x, 0, zz); g.rotation.y = rot; scene.add(g);
  mesh(box(1.8, 1.0, 0.9), '#6aa64e', 0, 0.5, 0, g); mesh(box(1.9, 0.06, 1.0), '#f8f4ea', 0, 1.02, 0, g, false);
  for (const px of [-0.85, 0.85]) mesh(cyl(0.04, 0.04, 1.3, 5), '#6b4a2b', px, 1.65, -0.35, g, false);
  const atap = mesh(box(2.1, 0.08, 1.3), '#e8836f', 0, 2.32, -0.1, g, false); atap.rotation.x = 0.15;
  const tulisan = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.5), new THREE.MeshLambertMaterial({ map: textTex(['🥕 Pakan ' + INFO[k].nama], { w: 512, h: 150, size: 56, bg: '#6aa64e', border: '#ffffff' }) }));
  tulisan.position.set(0, 1.95, 0.08); g.add(tulisan); const bl = tulisan.clone(); bl.rotation.y = Math.PI; bl.position.z = -0.4; g.add(bl);
  mesh(box(0.5, 0.25, 0.3), '#f08a24', -0.4, 1.17, 0.1, g, false); mesh(box(0.5, 0.25, 0.3), '#5aa83a', 0.35, 1.17, 0.1, g, false);
  addCircle(x, zz, 1.1);
  const it = addInteract(g, 'pakan', k, 3.5); it.label = '🥕 Beli pakan ' + INFO[k].nama.toLowerCase();
  BOOTH[k] = [x, zz];
}
const PERCIL = { kelinci: ['Kelinci-nya lucu banget. Mau kasih makan?', 'Ih gemas. Kasih makan yuk?'], _: ['Kayaknya dia lapar. Mau kasih makan?', 'Mau coba kasih makan?'] };
function mulaiAmati(key, obj) {
  const info = INFO[key]; if (!info) return;
  const list = animals.filter(a => a.kind === key).sort((a, b) => Math.hypot(a.group.position.x - player.x, a.group.position.z - player.z) - Math.hypot(b.group.position.x - player.x, b.group.position.z - player.z));
  if (!list.length) return;
  if (Math.hypot(list[0].group.position.x - player.x, list[0].group.position.z - player.z) > 60) { hint('Dekati kandangnya dulu ya.'); return; }
  AMATI.aktif = true; AMATI.list = list; AMATI.suap = null; AMATI.zoom = 1;
  const i = obj ? list.findIndex(a => a.group === obj) : 0;
  pilihHewan(i < 0 ? 0 : i, true);
  $('am-judul').textContent = info.emoji + ' ' + info.nama;
  $('am-catatan').textContent = info.larang ? '⚠️ ' + info.larang : '';
  $('am-catatan').classList.toggle('sembunyi', !info.larang);
  $('am-nav-hewan').classList.toggle('sembunyi', list.length < 2);
  $('am-makan').classList.add('sembunyi'); $('am-tanya').classList.add('sembunyi');
  AMATI.faktaI = Math.floor(Math.random() * info.fakta.length); AMATI.faktaT = 0;
  $('amati').classList.remove('sembunyi'); $('hud').classList.add('amati-on');
  ui.petunjuk.classList.add('sembunyi');
  clearTimeout(AMATI.tanyaT);
  if (info.makan) AMATI.tanyaT = setTimeout(() => { if (AMATI.aktif && !AMATI.suap) tanyaMakan(); }, 1600);
}
function tanyaMakan() {
  const key = AMATI.A.kind, nama = INFO[key].nama.toLowerCase(), stok = stokHewan(key);
  $('am-makan').classList.add('sembunyi'); $('am-tanya').classList.remove('sembunyi');
  if (!stok.length) {
    bicara(`Beli pakannya dulu yuk di booth sebelah kandang. Mulai ${fmtRp(Math.min(...PAKAN[key].map(x => x[1])))}.`, 5);
    $('am-tanya-teks').textContent = `Belum punya pakan ${nama}.`;
    $('am-iya').textContent = 'Beli pakan 🥕'; $('am-tidak').textContent = 'Nanti';
    AMATI.iya = () => { const b = BOOTH[key]; if (b && Math.hypot(b[0] - player.x, b[1] - player.z) > 40) { hint('Booth pakannya ada di sebelah papan nama kandang. Dekati dulu ya.', 3500); return; } bukaBooth(key); };
    return;
  }
  const k = PERCIL[key] || PERCIL._;
  bicara(pick(k), 5);
  $('am-tanya-teks').textContent = `Ingin memberi makan ${nama}? (punya ${stok.map(([n, q]) => q + '× ' + n).join(', ')})`;
  $('am-iya').textContent = 'Iya 🥕'; $('am-tidak').textContent = 'Tidak';
  AMATI.iya = mulaiSuap;
}
function pilihHewan(i, awal) {
  const L = AMATI.list; AMATI.idx = (i + L.length) % L.length; const A = AMATI.A = L[AMATI.idx];
  const sz = ukuran(A);
  AMATI.dist = Math.max(1.2, sz.r * 2.3 + 0.9);
  if (awal) { AMATI.yaw = Math.atan2(player.x - A.group.position.x, player.z - A.group.position.z); AMATI.pitch = 0.28; }
  AMATI.cx = A.group.position.x; AMATI.cz = A.group.position.z; AMATI.cy = sz.h * 0.6;
  $('am-urut').textContent = `${AMATI.idx + 1} / ${L.length}`;
}
function selesaiAmati() {
  AMATI.aktif = false; clearTimeout(AMATI.tanyaT);
  if (AMATI.suap) { wortel.visible = false; AMATI.suap = null; }
  $('amati').classList.add('sembunyi'); $('hud').classList.remove('amati-on');
}
function mulaiSuap() {
  const A = AMATI.A; $('am-tanya').classList.add('sembunyi');
  if (Math.hypot(A.group.position.x - player.x, A.group.position.z - player.z) > 40) { hint('Dekati pagarnya dulu ya, lalu beri makan.'); return; }
  const [tx, tz] = clampIn(A.encl, player.x, player.z, A.kind === 'gajah' || A.kind === 'jerapah' ? 1.6 : 0.9);
  const stok = stokHewan(A.kind); if (!stok.length) { tanyaMakan(); return; }
  const pakan = stok[0][0]; STOK[A.kind + '|' + pakan]--;
  wortel.children[0].material.color.set(WARNA_PAKAN(pakan));
  A.state = 'feed'; A.target = [tx, tz]; A.timer = 14;
  wortel.visible = true; wortel.scale.setScalar(A.kind === 'kelinci' ? 0.8 : 1.4);
  AMATI.suap = { A, dimakan: false, t: 0, pakan };
  bicara(A.kind === 'kelinci' ? 'Sodorkan pelan-pelan, biar kelincinya nggak takut.' : 'Pegang wortelnya yang kuat ya.', 4);
  hint(`${INFO[A.kind].nama} datang mendekat… 🥕`);
}
function updateAmati(dt) {
  const A = AMATI.A; if (!A) return;
  const sz = ukuran(A);
  A.head.getWorldPosition(tmpA);
  let cx = lerp(A.group.position.x, tmpA.x, 0.4), cz = lerp(A.group.position.z, tmpA.z, 0.4), cy = lerp(sz.h * 0.55, tmpA.y, 0.4);
  let dist = AMATI.dist * AMATI.zoom;
  const S = AMATI.suap;
  if (S) {
    S.t += dt;
    kamu.arms[1].hand.getWorldPosition(tmpB);
    const jauh = Math.hypot(tmpB.x - cx, tmpB.z - cz);
    if (jauh < 14) S.dekat = true;
    if (A.state === 'eat') { S.dimakan = true; wortel.scale.setScalar(Math.max(0.05, A.timer / 5) * (A.kind === 'kelinci' ? 0.8 : 1.4)); }
    else if (A.state === 'idle' && S.t > 0.5) {
      wortel.visible = false; AMATI.suap = null;
      if (S.dimakan && !kejutanSetelahMakan(A)) setTimeout(() => bicara(A.kind === 'kelinci' ? 'Lihat, kelincinya habis makan wortel. Gemas!' : 'Dia suka banget sama wortelnya.', 4), 400);
      else { hint('Sepertinya dia belum lapar. Pakannya disimpan dulu.'); STOK[A.kind + '|' + S.pakan] = (STOK[A.kind + '|' + S.pakan] || 0) + 1; }
      const m = $('am-makan'); m.textContent = 'Beri makan lagi 🥕'; m.classList.remove('sembunyi');
    }
  }
  if (!S && performance.now() - AMATI.geser > 2500) AMATI.yaw += dt * 0.12;
  const k = Math.min(1, dt * 4);
  if (S && S.dekat && performance.now() - AMATI.geser > 2500) {
    // kamera di belakang bahu kiri si cewek, melihat ke hewan dan wortel
    const fX = -Math.sin(player.yaw), fZ = -Math.cos(player.yaw), rX = Math.cos(player.yaw), rZ = -Math.sin(player.yaw);
    const mx = lerp(tmpB.x, cx, 0.5), my = lerp(tmpB.y, cy, 0.5), mz = lerp(tmpB.z, cz, 0.5);
    const sz2 = Math.max(1, sz.h);
    const px = player.x - fX * (1.6 + sz2 * 0.5) - rX * 1.1, pz = player.z - fZ * (1.6 + sz2 * 0.5) - rZ * 1.1, py = 1.7 + sz2 * 0.35;
    AMATI.cx = lerp(AMATI.cx, mx, k); AMATI.cy = lerp(AMATI.cy, my, k); AMATI.cz = lerp(AMATI.cz, mz, k);
    AMATI.px = lerp(AMATI.px ?? camera.position.x, px, k); AMATI.py = lerp(AMATI.py ?? camera.position.y, py, k); AMATI.pz = lerp(AMATI.pz ?? camera.position.z, pz, k);
    AMATI.yaw = Math.atan2(AMATI.px - AMATI.cx, AMATI.pz - AMATI.cz);
    camera.position.set(AMATI.px, AMATI.py, AMATI.pz); camera.lookAt(AMATI.cx, AMATI.cy, AMATI.cz);
  } else {
  AMATI.px = AMATI.py = AMATI.pz = undefined;
  AMATI.cx = lerp(AMATI.cx, cx, k); AMATI.cy = lerp(AMATI.cy, cy, k); AMATI.cz = lerp(AMATI.cz, cz, k);
  const cp = Math.cos(AMATI.pitch);
  camera.position.set(AMATI.cx + Math.sin(AMATI.yaw) * cp * dist, Math.max(0.2, AMATI.cy + Math.sin(AMATI.pitch) * dist), AMATI.cz + Math.cos(AMATI.yaw) * cp * dist);
  camera.lookAt(AMATI.cx, AMATI.cy, AMATI.cz);
  }
  AMATI.faktaT -= dt;
  if (AMATI.faktaT <= 0) { const f = INFO[A.kind].fakta; $('am-fakta').textContent = f[AMATI.faktaI++ % f.length]; AMATI.faktaT = 7; }
}
$('am-tutup').onclick = selesaiAmati;
$('am-kiri').onclick = () => { if (!AMATI.suap) pilihHewan(AMATI.idx - 1); };
$('am-kanan').onclick = () => { if (!AMATI.suap) pilihHewan(AMATI.idx + 1); };
$('am-dekat').onclick = () => { AMATI.zoom = clamp(AMATI.zoom * 0.75, 0.45, 2.2); };
$('am-jauh').onclick = () => { AMATI.zoom = clamp(AMATI.zoom * 1.33, 0.45, 2.2); };
$('am-iya').onclick = () => { if (AMATI.iya) AMATI.iya(); };
$('am-tidak').onclick = () => { $('am-tanya').classList.add('sembunyi'); bicara('Oke, kita lihat-lihat aja ya.', 3); const m = $('am-makan'); m.textContent = 'Beri makan 🥕'; m.classList.remove('sembunyi'); };
$('am-makan').onclick = () => tanyaMakan();
canvas.addEventListener('wheel', e => { if (AMATI.aktif) { e.preventDefault(); AMATI.zoom = clamp(AMATI.zoom * (1 + e.deltaY * 0.001), 0.45, 2.2); } }, { passive: false });

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
  c.fillStyle = '#e9dcc0'; c.strokeStyle = '#8b6440'; c.lineWidth = 2; for (const b of GEDUNG) { c.fillRect(wx(b.x1), wz(b.z1), (b.x2 - b.x1) * PX, (b.z2 - b.z1) * PX); c.strokeRect(wx(b.x1), wz(b.z1), (b.x2 - b.x1) * PX, (b.z2 - b.z1) * PX); }
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
  const lab = [['🦩', -28, 87], ['🐘', -75, 83], ['🦁', -50, 28], ['🐫', -125, 15], ['🦬', -125, -28], ['🦒', -62, -20], ['🦓', -80, -80], ['🐰', 58, 35], ['🍡', 60, -22], ['🎢', 13, 71], ['🐅', 48, -72], ['🐻', -30, -98], ['⛺', -80, -135], ['🐼', -55, -186], ['💦', 0, -214], ['🅿️', 30, 116], ['🎟️', 30, 90], ['🚙', -100, 40], ['🍜', 50, 68], ['🎬', 75, 68], ['🦜', 76, -50]];
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
  hint('Joystick: atas maju, kiri-kanan belok, bawah berbalik · geser layar juga untuk belok · tahan 👁 lalu geser untuk menoleh · ketuk hewan untuk info', 6000);
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
/* ---------- air terjun: hanya buka malam (jam 21-02), dijaga satpam ---------- */
const JAM_BUKA_AT = D.jamBukaAirTerjun != null ? D.jamBukaAirTerjun : 21, JAM_TUTUP_AT = D.jamTutupAirTerjun != null ? D.jamTutupAirTerjun : 2;
const atBuka = (h = WAKTU.jam) => JAM_BUKA_AT > JAM_TUTUP_AT ? (h >= JAM_BUKA_AT || h < JAM_TUTUP_AT) : (h >= JAM_BUKA_AT && h < JAM_TUTUP_AT);
const diAreaAT = (x = player.x, z = player.z) => z < -188.6 && Math.abs(x) < 36;
const jamBukaTeks = () => String(JAM_BUKA_AT).padStart(2, '0') + '.00–' + String(JAM_TUTUP_AT).padStart(2, '0') + '.00';
const POS_SATPAM = [5.6, -186.4];
const USIR = { fase: null, t: 0, dorong: false, tanyaT: -1e9 };
const GERBANG_AT = (() => {
  const g = new THREE.Group(); g.position.set(0, 0, -188); scene.add(g);
  for (const sx of [-4.5, 4.5]) { mesh(box(0.5, 2.6, 0.5), '#6b5a48', sx, 1.3, 0, g); mesh(box(0.65, 0.2, 0.65), '#4a3d30', sx, 2.7, 0, g, false); }
  const papan = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.1), new THREE.MeshLambertMaterial({ map: textTex(['💦 AIR TERJUN', 'Buka ' + jamBukaTeks()], { w: 640, h: 154, size: 56, size2: 36, bg: '#2f3a4f', border: '#f2d14b' }), emissive: '#333' }));
  papan.position.set(0, 3.3, 0.05); g.add(papan); const pb = papan.clone(); pb.rotation.y = Math.PI; pb.position.z = -0.05; g.add(pb);
  mesh(box(9.6, 0.15, 0.15), '#4a3d30', 0, 2.75, 0, g, false);
  const palang = new THREE.Group(); palang.position.set(-4.1, 1.05, 0.35); g.add(palang);
  for (let i = 0; i < 8; i++) mesh(box(1.03, 0.16, 0.1), i % 2 ? '#ffffff' : '#d23a3a', 0.52 + i * 1.03, 0, 0, palang, false);
  const tutup = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshLambertMaterial({ map: textTex(['TUTUP'], { w: 256, h: 80, size: 52, bg: '#d23a3a', border: '#ffffff' }) }));
  tutup.position.set(4.1, -0.35, 0.07); palang.add(tutup);
  // pos satpam
  const pos = new THREE.Group(); pos.position.set(8.5, 0, -185.5); scene.add(pos);
  mesh(box(2.2, 2.4, 2), '#d9cdb6', 0, 1.2, 0, pos); mesh(box(2.6, 0.15, 2.4), '#5c4a3a', 0, 2.48, 0, pos, false);
  mesh(box(1.2, 0.6, 0.05), '#a9d3e0', 0, 1.5, 1.01, pos, false);
  addCircle(8.5, -185.5, 1.4);
  return { g, palang };
})();
let SATPAM = null;
setTimeout(() => {
  SATPAM = buatNpc(POS_SATPAM, { cewek: false, baju: '#25324a', celana: '#1f2430', rambut: '#1a1a1a' });
  SATPAM.kendali = true; SATPAM.yaw = 0;
  const kepala = SATPAM.P.headParts[0];
  mesh(cyl(0.17, 0.18, 0.1, 10), '#1f2a3d', 0, 0.2, 0, kepala, false); mesh(box(0.26, 0.03, 0.16), '#1f2a3d', 0, 0.16, 0.16, kepala, false);
  const lencana = mesh(box(0.08, 0.1, 0.02), '#f2d14b', 0.12, 1.25, 0.2, SATPAM.P.group, false);
}, 0);
function satpamBicara(t, s = 3.5) { if (!SATPAM) return; npcBicara = SATPAM; npcBicaraT = s; npcKonteks = 'satpam'; gelNpc.textContent = t; gelNpc.classList.remove('sembunyi'); }
function cekAirTerjun(zLama) {
  if (atBuka() || player.z >= -188.4 || zLama < -188.4 || Math.abs(player.x) > 4.6) return;
  player.z = -188.4;
  if (performance.now() - USIR.tanyaT < 5000) return;
  USIR.tanyaT = performance.now();
  satpamBicara(pick(D.satpamBelumBuka || ['Maaf, Kak, area air terjun belum buka. Buka jam 9 malam ya.']));
  hint('Area air terjun hanya buka jam ' + jamBukaTeks() + ' (waktu taman).', 3500);
  setTimeout(() => bicara(pick(D.pasanganAirTerjun || ['Katanya ada sesuatu di sini kalau malam. Nanti malam kita ke sini ya.']), 4), 2600);
}
const _usirTujuan = [0, -184.5];
function updateUsir(dt, t) {
  if (!SATPAM) return;
  const N = SATPAM, buka = atBuka();
  GERBANG_AT.palang.rotation.z = lerp(GERBANG_AT.palang.rotation.z, buka ? 1.45 : 0, Math.min(1, dt * 2));
  N.P.group.visible = Math.hypot(N.x - player.x, N.z - player.z) < 90;
  let jalan = false, tx = POS_SATPAM[0], tz = POS_SATPAM[1], sp = 1.6;
  const dalam = diAreaAT() && !NAIK;
  if (!buka && dalam && !USIR.fase) { USIR.fase = 'datang'; USIR.t = 0; }
  if (USIR.fase === 'datang') {
    tx = player.x + 0.9; tz = player.z + 1.4; sp = 2.4;
    if (Math.hypot(tx - N.x, tz - N.z) < 0.4) { USIR.fase = 'tegur'; USIR.t = D.waktuKeluarAirTerjun || 20; satpamBicara(pick(D.satpamTutup || ['Permisi, Kak. Area air terjun sudah tutup. Silakan keluar ya.']), 4); hint(`Area air terjun sudah tutup. Keluar dalam ${USIR.t} detik ya.`, 3500); setTimeout(() => bicara('Yah, sudah tutup. Yuk keluar, sayang.', 3), 3000); }
  }
  if (USIR.fase === 'tegur') {
    tx = N.x; tz = N.z;
    N.yaw += angDiff(N.yaw, Math.atan2(-(player.x - N.x), -(player.z - N.z))) * Math.min(1, dt * 5);
    if (!dalam) { USIR.fase = 'pulang'; satpamBicara(pick(D.satpamTerimaKasih || ['Terima kasih, Kak. Buka lagi jam 9 malam.']), 3); }
    else { USIR.t -= dt; if (USIR.t <= 0) { USIR.fase = 'dorong'; USIR.dorong = true; satpamBicara(pick(D.satpamDorong || ['Maaf ya, Kak, saya bantu keluar. Sudah tutup!']), 4); setTimeout(() => bicara('Iya, iya, Pak. Kami keluar…', 3), 1500); } }
  }
  if (USIR.fase === 'dorong') {
    // pemain didorong pelan ke luar gerbang, satpam di belakang dengan tangan ke depan
    const dx = _usirTujuan[0] - player.x, dz = _usirTujuan[1] - player.z, d = Math.hypot(dx, dz);
    const st = Math.min(d, 1.5 * dt);
    if (d > 0.1) { player.x += dx / d * st; player.z += dz / d * st; }
    const arah = Math.atan2(-dx, -dz); player.yaw = arah; camYaw += angDiff(camYaw, arah) * Math.min(1, dt * 3);
    player.speed = d > 0.1 ? 1.5 : 0;
    tx = player.x - dx / (d || 1) * 0.75; tz = player.z - dz / (d || 1) * 0.75;
    N.x = lerp(N.x, tx, Math.min(1, dt * 6)); N.z = lerp(N.z, tz, Math.min(1, dt * 6)); N.yaw = arah;
    N.phase += dt * 4; animPerson(N.P, N.phase, 0.7); for (const a of N.P.arms) swingArm(a, -1.45, 1);
    N.P.group.position.set(N.x, 0, N.z); N.P.group.rotation.y = N.yaw;
    if (d < 0.15) { USIR.fase = 'pulang'; USIR.dorong = false; satpamBicara(pick(D.satpamTerimaKasih || ['Terima kasih, Kak. Buka lagi jam 9 malam.']), 3); }
    return;
  }
  const dx = tx - N.x, dz = tz - N.z, d = Math.hypot(dx, dz);
  if (d > 0.15) { const st = Math.min(d, sp * dt); N.x += dx / d * st; N.z += dz / d * st; N.yaw += angDiff(N.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 8); jalan = true; }
  else if (USIR.fase === 'pulang') { USIR.fase = null; }
  else if (!USIR.fase) N.yaw += angDiff(N.yaw, 0) * Math.min(1, dt * 3);
  N.phase += jalan ? dt * sp * 2.6 : 0;
  animPerson(N.P, N.phase, jalan ? 0.8 : 0);
  if (USIR.fase === 'tegur') { swingArm(N.P.arms[0], 0, 1); swingArm(N.P.arms[1], -1.2 + Math.sin(t * 3) * 0.3, -1); }
  else for (const [k, a] of N.P.arms.entries()) swingArm(a, (k ? -1 : 1) * Math.sin(N.phase) * 0.5 * (jalan ? 1 : 0), k ? -1 : 1);
  N.P.group.position.set(N.x, 0, N.z); N.P.group.rotation.y = N.yaw;
}
// tombol mata (seperti free look): tahan & geser untuk menoleh tanpa berbelok, dilepas kembali ke depan
const LIHAT = { x: 0, y: 0, tahan: null };
{
  const m = $('btn-mata');
  m.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); m.setPointerCapture(e.pointerId); LIHAT.tahan = { id: e.pointerId, x: e.clientX, y: e.clientY }; m.classList.add('aktif'); });
  m.addEventListener('pointermove', e => {
    const t = LIHAT.tahan; if (!t || t.id !== e.pointerId) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y; t.x = e.clientX; t.y = e.clientY;
    LIHAT.x = clamp(LIHAT.x - dx * 0.014, -2.7, 2.7); LIHAT.y = clamp(LIHAT.y + dy * 0.008, -0.8, 0.8);
  });
  const lepas = e => { if (LIHAT.tahan && LIHAT.tahan.id === e.pointerId) { LIHAT.tahan = null; m.classList.remove('aktif'); } };
  m.addEventListener('pointerup', lepas); m.addEventListener('pointercancel', lepas);
}
/* ---------- jip safari: jadwal ikut jam global, halte di setiap kandang ---------- */
const PUTARAN = (D.putaranJip || 60) / 60;       // satu putaran (menit taman -> jam taman), jarak antar jip = putaran / 3
const BERHENTI = (D.berhentiJip || 4) / 60;      // lama berhenti di tiap halte (menit taman)
const HALTE = (() => {
  const ids = [['terminal', 'Terminal Safari', 8, 30], ['gajah'], ['singa'], ['unta'], ['bison'], ['jerapah'], ['zebra']];
  const L = kurvaSafari.getLength(), out = [];
  for (const [id, nama, zx, zz] of ids) {
    const z = ZONES.find(q => q.id === id); const cx = zx != null ? zx : z.x, cz = zz != null ? zz : z.z;
    let best = 0, bd = 1e9;
    for (let k = 0; k < 800; k++) { const p = kurvaSafari.getPointAt(k / 800); const d = Math.hypot(p.x - cx, p.z - cz); if (d < bd) { bd = d; best = k / 800; } }
    out.push({ id, nama: nama || z.nama, u: best });
  }
  out.sort((a, b) => a.u - b.u);
  // halte yang terlalu berdekatan digabung jadi satu
  for (let k = out.length - 1; k > 0; k--) if (out[k].u - out[k - 1].u < 0.05) { out[k - 1].nama = out[k - 1].nama.replace('Zona ', '') + ' & ' + out[k].nama.replace('Zona ', ''); out[k - 1].u = (out[k - 1].u + out[k].u) / 2; out.splice(k, 1); }
  out.forEach(h => {
    const p = kurvaSafari.getPointAt(h.u), tg = kurvaSafari.getTangentAt(h.u);
    h.x = p.x - tg.z * 5.2; h.z = p.z + tg.x * 5.2; h.naikX = p.x - tg.z * 3.4; h.naikZ = p.z + tg.x * 3.4;
    const g = new THREE.Group(); g.position.set(h.x, 0, h.z); g.rotation.y = Math.atan2(tg.x, tg.z) + Math.PI / 2; scene.add(g);
    mesh(box(3, 0.12, 1.6), '#8b6440', 0, 2.5, 0, g);
    for (const sx of [-1.4, 1.4]) mesh(cyl(0.06, 0.06, 2.5, 5), '#4a4a4a', sx, 1.25, 0.6, g, false);
    mesh(box(2.4, 0.1, 0.45), '#6b4a2b', 0, 0.5, -0.3, g, false);
    const papan = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.55), new THREE.MeshLambertMaterial({ map: textTex(['🚙 HALTE ' + h.nama.replace('Zona ', '').toUpperCase()], { w: 640, h: 126, size: 52, bg: '#2f5d3a', border: '#f2d14b' }) }));
    papan.position.set(0, 2.2, 0.82); g.add(papan); const pb = papan.clone(); pb.rotation.y = Math.PI; pb.position.z = -0.82; g.add(pb);
    const it = addInteract(g, 'halte', h, 5); it.label = '🚙 Jadwal jip';
  });
  return out;
})();
// timeline satu putaran: jalan antar halte lalu berhenti sebentar di tiap halte
function statusJip(J, jam) {
  const T = PUTARAN, jalan = T - HALTE.length * BERHENTI;
  let ph = (((jam - J.tunda) / T + J.i / 3) % 1 + 1) % 1 * T;
  let uPrev = 0;
  for (let k = 0; k < HALTE.length; k++) {
    const durasi = (HALTE[k].u - uPrev) * jalan;
    if (ph < durasi) return { u: uPrev + ph / durasi * (HALTE[k].u - uPrev), berhenti: -1 };
    ph -= durasi;
    if (ph < BERHENTI) return { u: HALTE[k].u, berhenti: k, sisa: BERHENTI - ph };
    ph -= BERHENTI; uPrev = HALTE[k].u;
  }
  return { u: uPrev + ph / Math.max(1e-6, (1 - uPrev) * jalan) * (1 - uPrev), berhenti: -1 };
}
function tibaBerikut(J, k) {
  // berapa jam taman lagi jip J tiba di halte k
  for (let s = 0; s < 400; s++) { const st = statusJip(J, jamAbs() + s * 0.01); if (st.berhenti === k) return s * 0.01; }
  return null;
}
let NAIK = null;
const hargaJip = () => D.hargaJip != null ? D.hargaJip : 10000;
const _seat = new THREE.Vector3();
function updateJip(dt) {
  const jam = jamAbs(), dGame = dt / (WAKTU.menitHari * 60) * 24;
  for (const J of JIP) {
    const st = statusJip(J, jam);
    if (st.berhenti < 0 && NAIK?.J !== J) {
      const ahead = kurvaSafari.getPointAt((st.u + 0.008) % 1);
      const blok = Math.hypot(ahead.x - player.x, ahead.z - player.z) < 5 || Math.hypot(ahead.x - partner.x, ahead.z - partner.z) < 5;
      if (blok) J.tunda += dGame; else if (J.tunda > 0) J.tunda = Math.max(0, J.tunda - dGame * 0.5);
    }
    const s2 = statusJip(J, jam);
    J.u = s2.u; J.berhenti = s2.berhenti; J.sisa = s2.sisa;
    const p = kurvaSafari.getPointAt(J.u), tg = kurvaSafari.getTangentAt(J.u);
    J.group.position.set(p.x - tg.z * 1.6, 0, p.z + tg.x * 1.6);
    J.group.rotation.y = Math.atan2(tg.x, tg.z);
  }
  // tombol naik / turun
  const b = $('btn-jip');
  if (NAIK) {
    const J = NAIK.J; J.group.updateMatrixWorld(true);
    _seat.set(0.45, 0, -0.9); J.group.localToWorld(_seat); duduk.a = [_seat.x, _seat.z];
    _seat.set(-0.45, 0, -0.9); J.group.localToWorld(_seat); duduk.b = [_seat.x, _seat.z];
    duduk.yaw = J.group.rotation.y + Math.PI;
    if (NAIK.yawJip != null) camYaw += angDiff(NAIK.yawJip, J.group.rotation.y);
    NAIK.yawJip = J.group.rotation.y;
    if (J.berhenti >= 0 && !NAIK.turun && !duduk.anim) { b.textContent = '🚶 Turun di ' + HALTE[J.berhenti].nama.replace('Zona ', ''); b.classList.remove('sembunyi'); NAIK.halte = J.berhenti; }
    else b.classList.add('sembunyi');
    if (J.berhenti >= 0 && NAIK.terakhir !== J.berhenti) { NAIK.terakhir = J.berhenti; if (NAIK.sudahJalan) hint('Berhenti di halte ' + HALTE[J.berhenti].nama.replace('Zona ', '') + '. Mau turun?', 3000); }
    if (J.berhenti < 0) NAIK.sudahJalan = true;
    return;
  }
  let ada = null;
  if (!duduk && !antriPemain && !paused && !AMATI.aktif) for (const J of JIP) if (J.berhenti >= 0) { const h = HALTE[J.berhenti]; if (Math.hypot(h.naikX - player.x, h.naikZ - player.z) < 8) ada = J; }
  b.classList.toggle('sembunyi', !ada);
  if (ada) { b.textContent = `🚙 Naik Safari ${ada.no} (${fmtRp(hargaJip() * 2)})`; b.dataset.j = ada.i; }
}
function naikJip(J) {
  if (J.berhenti < 0) { hint('Jipnya sudah jalan. Tunggu jip berikutnya di halte ya.', 3000); return; }
  if (!bayar(hargaJip() * 2)) { hint(`Uangnya nggak cukup. Naik jip ${fmtRp(hargaJip())} per orang.`, 3000); return; }
  if (J.sisa < 0.014) J.tunda += 0.014 - J.sisa;   // jip menunggu sampai keduanya selesai naik
  NAIK = { J, terakhir: J.berhenti, sudahJalan: false };
  duduk = { jip: true, a: [0, 0], b: [0, 0], yaw: 0, h: 0.6, sejak: 0, anim: { t0: performance.now(), turun: false, tanah: { a: [player.x, player.z], b: [partner.x, partner.z] } } };
  tampilBerdiri(false); BALIK.sisa = 0; camYaw = J.group.rotation.y + Math.PI; LIHAT.x = 0; camPitch = mode === 'tpp' ? 0.2 : 0.05;
  hint('Kalian naik Safari ' + J.no + '. Turun di halte mana saja yang kalian mau.', 3500);
  setTimeout(() => bicara(pick(['Seru! Kita keliling naik jip.', 'Duduk dekat aku ya, nanti kita lihat hewannya dari dekat.'])), 900);
}
function turunJip() {
  if (!NAIK || NAIK.J.berhenti < 0 || NAIK.turun || duduk.anim) return;
  const J = NAIK.J, h = HALTE[J.berhenti];
  if (J.sisa < 0.014) J.tunda += 0.014 - J.sisa;   // jip menunggu sampai keduanya turun
  NAIK.turun = true; $('btn-jip').classList.add('sembunyi');
  duduk.anim = { t0: performance.now(), turun: true, tanah: { a: [h.naikX, h.naikZ], b: [h.naikX + 0.7, h.naikZ] }, selesai: () => {
    NAIK = null; duduk = null;
    kamu.group.position.y = 0; dia.group.position.y = 0;
    player.x = h.naikX; player.z = h.naikZ; partner.x = h.naikX + 0.7; partner.z = h.naikZ;
    hint('Kalian turun di halte ' + h.nama.replace('Zona ', '') + '. Naik lagi kalau jip berikutnya lewat.', 3500);
  } };
}
$('btn-jip').onclick = () => { if (NAIK) turunJip(); else { const J = JIP[+$('btn-jip').dataset.j]; if (J) naikJip(J); } };
function bukaJadwal(h) {
  const k = HALTE.indexOf(h);
  const baris = JIP.map(J => { const w = tibaBerikut(J, k); if (w == null) return ''; const menit = Math.max(0, Math.round(w / 24 * WAKTU.menitHari)); return `<li>🚙 Safari ${J.no}: ${J.berhenti === k ? '<b>sedang berhenti di sini</b>' : (menit < 1 ? 'kurang dari 1 menit lagi' : '± ' + menit + ' menit lagi') + ` (jam ${jamTeks((WAKTU.jam + w) % 24)})`}</li>`; }).join('');
  kartu('🚙', 'Halte ' + h.nama.replace('Zona ', ''), `<ul>${baris}</ul><div class="catatan">Naik jip ${fmtRp(hargaJip())} per orang. Tunggu di halte, tombol naik muncul saat jip berhenti. Kalian bisa turun di halte mana saja.</div>`);
}
// tiket masuk taman: berlaku selama masih di dalam taman dan halaman belum di-refresh.
// keluar lewat gerbang atau refresh = beli tiket lagi (uang tetap sisa, reset jam 7 pagi)
try { localStorage.removeItem('safari_tiket'); } catch (e) {}
const TIKET = { punya: false, tanyaT: -1e9 };
function sudahTiket() { return TIKET.punya; }
function cekGerbang(zLama) {
  if (TIKET.punya && zLama < 90.6 && player.z >= 90.6 && Math.abs(player.x - 30) <= 8) {
    TIKET.punya = false;
    hint('Kalian keluar dari taman. Kalau mau masuk lagi, beli tiket lagi di loket ya.', 4000);
    setTimeout(() => bicara('Kalau masuk lagi bayar tiket lagi lho.', 3), 600);
    return;
  }
  if (player.z >= 90.6 || zLama < 90.6 || Math.abs(player.x - 30) > 8 || sudahTiket()) return;
  player.z = 90.6;
  if (paused || performance.now() - TIKET.tanyaT < 4000) return;
  TIKET.tanyaT = performance.now();
  hint('Beli tiket masuk dulu di loket, rumah kecil di kiri dan kanan gerbang.', 3500);
  setTimeout(() => bicara('Eh, kita belum beli tiket. Ke loket dulu yuk.', 3.5), 500);
}
function bukaTiketMasuk() {
  const h = D.tiketMasuk != null ? D.tiketMasuk : 15000, tot = h * 2;
  if (sudahTiket()) { hint('Tiket sudah dibeli. Langsung masuk lewat gerbang.'); return; }
  kartu('🎟️', 'Loket Masuk', `<p style="text-align:center">Tiket masuk taman ${fmtRp(h)} per orang.<br>Untuk berdua: <b>${fmtRp(tot)}</b></p><div class="catatan">💰 Uang kalian: ${fmtRp(DOMPET.sisa)} · berlaku sampai kalian keluar taman</div>`, 'Bayar ' + fmtRp(tot), () => {
    if (!bayar(tot)) { hint('Uangnya nggak cukup untuk tiket masuk.', 3000); return; }
    TIKET.punya = true;
    hint('Tiket dibayar. Selamat bersenang-senang! 🎉', 3000); setTimeout(() => bicara('Yuk masuk! Jangan lepas tanganku ya.'), 800);
  });
  $('k-tutup').textContent = 'Nanti dulu';
}
// popcorn & minuman bioskop yang dibawa: tangan tidak bergandengan
const BAWA = { cowok: [], cewek: [], sejak: 0 };
const mPopcorn = new THREE.MeshLambertMaterial({ map: tex(64, 64, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#d23a3a'; c.fillRect(i * 8, 0, 8, h); } }) });
function modelBawaan(jenis) {
  const g = new THREE.Group();
  if (jenis === 'popcorn') {
    const c = new THREE.Mesh(cyl(0.085, 0.06, 0.18, 10), mPopcorn); c.position.y = 0.06; g.add(c);
    for (let i = 0; i < 7; i++) mesh(sph(0.03, 5, 4), '#f8e7a1', Math.cos(i) * 0.045, 0.16 + (i % 3) * 0.015, Math.sin(i * 1.7) * 0.045, g, false);
  } else {
    mesh(cyl(0.05, 0.04, 0.17, 10), '#2f6fb5', 0, 0.06, 0, g, false); mesh(cyl(0.053, 0.053, 0.015, 10), '#ffffff', 0, 0.15, 0, g, false);
    mesh(cyl(0.006, 0.006, 0.12, 4), '#e8836f', 0.015, 0.2, 0, g, false);
  }
  return g;
}
function aturBawa(pop, minum) {
  for (const P of [kamu, dia]) for (const a of P.arms) for (const c of [...a.hand.children]) if (c.userData.bawaan) a.hand.remove(c);
  const urut = []; for (let i = 0; i < Math.max(pop, minum); i++) { if (i < pop) urut.push('popcorn'); if (i < minum) urut.push('minum'); }
  BAWA.cowok = urut.length <= 2 ? urut : urut.slice(0, 2); BAWA.cewek = urut.length <= 2 ? [] : urut.slice(2, 4); BAWA.sejak = performance.now();
  [[dia, BAWA.cowok], [kamu, BAWA.cewek]].forEach(([P, list]) => list.forEach((j, i) => { const m = modelBawaan(j); m.userData.bawaan = true; m.position.y = -0.04; P.arms[i].hand.add(m); }));
}
function poseBawa(P, list, phase, amt) {
  P.arms.forEach((a, i) => {
    if (list[i]) { swingArm(a, -0.95, i ? -1 : 1); for (const c of a.hand.children) if (c.userData.bawaan) c.rotation.x = 0.95; }
    else swingArm(a, (i ? 1 : -1) * Math.sin(phase) * 0.5 * amt, i ? -1 : 1);
  });
}
const BALIK = { tahan: false, sisa: 0 };
function update(dt, t) {
  // gerak
  let jx = joy.x, jy = joy.y;
  if (keys.KeyW || keys.ArrowUp) jy = 1; if (keys.KeyS || keys.ArrowDown) jy = -1;
  if (keys.KeyA || keys.ArrowLeft) jx = -1; if (keys.KeyD || keys.ArrowRight) jx = 1;
  let mag = Math.min(1, Math.hypot(jx, jy));
  if (paused || !started || duduk || antriPemain || TOPI.anim || AMATI.aktif || USIR.dorong) { jx = jy = 0; mag = 0; }
  // kiri-kanan = berbelok (memutar arah), maju-mundur = jalan
  const belok = Math.abs(jx) < 0.12 ? 0 : jx;
  camYaw -= belok * 2.1 * dt;
  // tarik ke bawah = berbalik badan, lalu jalan ke arah sebaliknya
  const bawah = jy < -0.45 && Math.abs(jx) < Math.abs(jy);
  if (bawah && !BALIK.tahan) { BALIK.tahan = true; BALIK.sisa = Math.PI; }
  if (!bawah) BALIK.tahan = false;
  if (BALIK.sisa > 0) { const st = Math.min(BALIK.sisa, 5.5 * dt); camYaw += st; BALIK.sisa -= st; }
  const maju = BALIK.sisa > 0 ? 0 : bawah ? -jy : Math.abs(jy) < 0.12 ? 0 : Math.max(0, jy);
  mag = Math.min(1, Math.abs(maju));
  const fwdX = -Math.sin(camYaw), fwdZ = -Math.cos(camYaw);
  let mx = fwdX * maju, mz = fwdZ * maju; const ml = Math.hypot(mx, mz);
  const zSebelum = player.z;
  const run = keys.ShiftLeft || keys.ShiftRight;
  const spd = (run ? 6.5 : 4.2) * mag;
  if (ml > 0.01) {
    mx /= ml; mz /= ml;
    player.x += mx * spd * dt; player.z += mz * spd * dt;
    const p = { x: player.x, z: player.z }; resolve(p, 0.38); player.x = p.x; player.z = p.z;
    tabrakNpc(mx, mz);
  }
  cekGerbang(zSebelum); cekAirTerjun(zSebelum);
  const spdAntri = antriPemain ? gerakAntri(dt) : 0;
  player.speed = lerp(player.speed, Math.max(spd, spdAntri), Math.min(1, dt * 8));
  const targetT = mode === 'tpp' ? 1 : 0;
  modeT += clamp(targetT - modeT, -dt * 1.6, dt * 1.6);
  const e = ease(modeT);
  // arah badan
  if (antriPemain) {}
  else if (AMATI.suap) { const A = AMATI.suap.A; const want = Math.atan2(-(A.group.position.x - player.x), -(A.group.position.z - player.z)); player.yaw += angDiff(player.yaw, want) * Math.min(1, dt * 4); camYaw = player.yaw; }
  else if (modeT < 0.5 || mode === 'fpp') player.yaw += angDiff(player.yaw, camYaw) * Math.min(1, dt * 10);
  else player.yaw += angDiff(player.yaw, camYaw) * Math.min(1, dt * 7);
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

  updateJip(dt);
  if (duduk) posisiDuduk();
  // tangan bergandengan
  kamu.arms[0].pivot.getWorldPosition(tmpA); dia.arms[1].pivot.getWorldPosition(tmpB);
  const hand = tmpV.copy(tmpA).lerp(tmpB, lerp(0.58, 0.5, e));
  hand.y = lerp(1.18, 0.86, e) + Math.sin(player.phase) * 0.02;
  if (duduk && duduk.anim) {
    // saling berpegangan tangan saat naik / turun jip
    aimArm(kamu, kamu.arms[0], hand); aimArm(dia, dia.arms[1], hand); swingArm(kamu.arms[1], 0, -1); swingArm(dia.arms[0], 0, 1);
  } else if (duduk) {
    const lengan = duduk.meja ? -1.15 : -0.75;
    if (!animMakan(dt)) { swingArm(kamu.arms[0], lengan, 1); swingArm(kamu.arms[1], lengan, -1); swingArm(dia.arms[0], lengan, 1); swingArm(dia.arms[1], lengan, -1); }
  } else if (animTopi(dt)) {
  } else if (BAWA.cowok.length || BAWA.cewek.length) {
    poseBawa(dia, BAWA.cowok, partner.phase, Math.min(1, partner.speed / 3)); poseBawa(kamu, BAWA.cewek, player.phase, Math.min(1, player.speed / 3));
  } else if (AMATI.suap) {
    aimArm(kamu, kamu.arms[0], hand); aimArm(dia, dia.arms[1], hand);
    const A = AMATI.suap.A; A.head.getWorldPosition(tmpB); kamu.arms[1].pivot.getWorldPosition(tmpA);
    const d = tmpB.sub(tmpA); const L = d.length(); d.normalize().multiplyScalar(Math.min(L, kamu.arms[1].len * 1.3)); d.y = Math.max(d.y, -0.15);
    aimArm(kamu, kamu.arms[1], tmpA.add(d));
    swingArm(dia.arms[0], 0, -1);
  } else {
    aimArm(kamu, kamu.arms[0], hand); aimArm(dia, dia.arms[1], hand);
    swingArm(kamu.arms[1], -Math.sin(player.phase) * 0.5 * Math.min(1, player.speed / 3), 1);
    swingArm(dia.arms[0], Math.sin(partner.phase) * 0.5 * Math.min(1, partner.speed / 3), -1);
  }
  for (const h of kamu.headParts) h.visible = modeT > 0.35 || AMATI.aktif;

  // kamera
  const cp = Math.cos(camPitch);
  if (!LIHAT.tahan) { const k = 1 - Math.min(1, dt * 7); LIHAT.x *= k; LIHAT.y *= k; }
  const yawLihat = camYaw + LIHAT.x, pitchLihat = clamp(camPitch + LIHAT.y, -1.2, 1.3);
  const cpl = Math.cos(pitchLihat);
  const dX = -Math.sin(yawLihat) * cpl, dY = -Math.sin(pitchLihat), dZ = -Math.cos(yawLihat) * cpl;
  const pitchT = clamp(pitchLihat, -0.35, 1.15);
  const cpt = Math.cos(pitchT), dX2 = -Math.sin(yawLihat) * cpt, dY2 = -Math.sin(pitchT), dZ2 = -Math.cos(yawLihat) * cpt;
  const eyeX = player.x + fX * 0.13, eyeY = kamu.eye + kamu.group.position.y, eyeZ = player.z + fZ * 0.13;
  const midX = player.x + rX * 0.37, midZ = player.z + rZ * 0.37;
  const dalam = gedungDalam(player.x, player.z);
  distCam = lerp(distCam, dalam ? 3.0 : 5.2, Math.min(1, dt * 3));
  const dist = distCam;
  let tX = midX - dX2 * dist, tY = 1.45 + kamu.group.position.y - dY2 * dist, tZ = midZ - dZ2 * dist;
  tY = Math.max(0.4, tY);
  if (dalam) { tX = clamp(tX, dalam.x1 + 0.4, dalam.x2 - 0.4); tZ = clamp(tZ, dalam.z1 + 0.4, dalam.z2 - 0.4); tY = Math.min(tY, dalam.h - 0.5); }
  camera.position.set(lerp(eyeX, tX, e), lerp(eyeY, tY, e), lerp(eyeZ, tZ, e));
  const lX = lerp(dX, dX2, e), lY = lerp(dY, dY2, e), lZ = lerp(dZ, dZ2, e);
  camera.lookAt(camera.position.x + lX, camera.position.y + lY, camera.position.z + lZ);
  if (mode === 'tpp' && modeT > 0.9) camPitch = clamp(camPitch, -0.35, 1.15);
  if (AMATI.aktif) updateAmati(dt);
  if ((BAWA.cowok.length || BAWA.cewek.length) && !(duduk && duduk.bioskop) && performance.now() - BAWA.sejak > 150000) { aturBawa(0, 0); bicara('Popcorn sama minumnya sudah habis. Gandengan lagi yuk.', 4); }

  // bayangan mengikuti pemain


  // hewan
  for (const A of animals) if (A.group.visible || A.kej) updateAnimal(A, dt, t);
  updateBurung(dt, t);
  updateGedung(dt, t, dalam); updateUsir(dt, t); updateKejutan(dt, t); updateAntrian(dt); updateTegur(dt); if (started) updateWaktu(dt, dalam);
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
  if (nearest && started && !paused && !duduk && !antriPemain && !AMATI.aktif) {
    const nm = nearest.label ? '' : nearest.kind === 'hewan' ? INFO[nearest.data].nama : nearest.kind === 'papan' ? (nearest.data === 'peta' ? 'Peta' : (ZONES.find(z => z.id === nearest.data) || {}).nama) : LANDMARK[nearest.data].nama;
    ui.aksi.textContent = nearest.label || ('Lihat ' + nm); ui.aksi.classList.remove('sembunyi');
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
    if (A.timer <= 0) { A.state = 'idle'; A.timer = rand(2, 5); A.head.getWorldPosition(tmpB); hearts(tmpB, 4, '💛'); hint(`${INFO[A.kind].nama} senang diberi makan!`); }
  }
  if (A.state === 'kejutan' && A.kej) moving = updateKejutanHewan(A, dt, t) || moving;
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
/* ================================================================== kejutan (isi diatur di admin → kejutan.js) */
const KJ = window.KEJUTAN || {};
const KJT = (o, k, def) => (o && o[k] != null && String(o[k]).trim() !== '') ? o[k] : def;
const escH = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEJ = { kelinci: false, gajah: false, jerapah: false, aktif: null };
const GAJAH_SURAT = animals.filter(a => a.kind === 'gajah')[2] || null;   // dari 3 gajah, 1 membawa surat
const jalanAnim = new Set();

// ---- surat (amplop) ----
function texAmplop(lumpur) {
  return tex(256, 176, (c, w, h) => {
    c.fillStyle = '#fbf3e2'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d8c7a4'; c.lineWidth = 5; c.strokeRect(3, 3, w - 6, h - 6);
    c.beginPath(); c.moveTo(4, 6); c.lineTo(w / 2, h * 0.58); c.lineTo(w - 4, 6); c.stroke();
    c.fillStyle = '#d64545'; c.beginPath(); const x = w / 2, y = h * 0.58;
    c.moveTo(x, y + 16); c.bezierCurveTo(x - 30, y - 6, x - 12, y - 26, x, y - 10); c.bezierCurveTo(x + 12, y - 26, x + 30, y - 6, x, y + 16); c.fill();
    if (lumpur) for (let i = 0; i < 14; i++) { c.fillStyle = ['#6b4a2b', '#7d5a36', '#5a3d22'][i % 3]; c.globalAlpha = rand(0.45, 0.85); c.beginPath(); c.ellipse(rand(0, w), rand(0, h), rand(6, 26), rand(4, 16), rand(0, 3), 0, 7); c.fill(); }
    c.globalAlpha = 1;
  });
}
function buatAmplop(lumpur) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.015, 0.24), [mat('#efe3c8'), mat('#efe3c8'), new THREE.MeshLambertMaterial({ map: texAmplop(lumpur) }), mat('#efe3c8'), mat('#efe3c8'), mat('#efe3c8')]);
  g.add(m);
  return g;
}
const SURAT = [];
function taruhSurat(obj, x, z, data) {
  // surat diletakkan di bawah kaki kalian, bisa diketuk untuk dibuka
  scene.attach(obj); obj.position.set(x, 0.03, z); obj.rotation.set(0, rand(-0.6, 0.6), 0);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.2; obj.add(hit);
  const it = addInteract(obj, 'surat', data, 3); it.label = '💌 Buka surat';
  SURAT.push({ obj, t: 0 });
}
function bukaSurat(d) {
  const noda = d.lumpur ? Array.from({ length: 7 }, () => `<span style="position:absolute;left:${rand(2, 88)}%;top:${rand(2, 88)}%;width:${rand(18, 46)}px;height:${rand(12, 30)}px;border-radius:50%;background:#6b4a2b;opacity:${rand(0.25, 0.5).toFixed(2)};transform:rotate(${rand(0, 180) | 0}deg)"></span>`).join('') : '';
  const isi = escH(d.isi).replace(/\n/g, '<br>');
  kartu('💌', d.judul, `<div style="position:relative;overflow:hidden;background:repeating-linear-gradient(#fffaf0 0 27px,#e9dfc9 27px 28px);border-radius:12px;padding:16px 16px 18px;font-size:17px;line-height:28px;color:#3a2f25;box-shadow:inset 0 0 0 2px #e2d6bb">${noda}<div style="position:relative">${isi}</div></div>`);
}

// ---- rumah kelinci & kubangan lumpur gajah ----
const RUMAH_KELINCI = { x: 51, z: 40, pintu: [51, 41.1] };
{
  const g = new THREE.Group(); g.position.set(RUMAH_KELINCI.x, 0, RUMAH_KELINCI.z); scene.add(g);
  mesh(box(1.6, 0.9, 1.4), '#c98f55', 0, 0.45, 0, g);
  const atap = mesh(cone(1.3, 0.7, 4), '#b5452f', 0, 1.25, 0, g); atap.rotation.y = Math.PI / 4;
  const lubang = mesh(cyl(0.26, 0.26, 0.05, 14), '#2a1a10', 0, 0.3, 0.71, g, false); lubang.rotation.x = Math.PI / 2;
  const papan = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.24), new THREE.MeshLambertMaterial({ map: textTex(['RUMAH KELINCI'], { w: 384, h: 96, size: 46, bg: '#6b4a2b' }) }));
  papan.position.set(0, 0.74, 0.711); g.add(papan);
  mesh(cyl(0.6, 0.6, 0.04, 16), '#e7cf7a', 0, 0.02, 1.2, g, false);
  addCircle(RUMAH_KELINCI.x, RUMAH_KELINCI.z, 0.9);
}
const LUMPUR = { x: -82, z: 78 };
{
  const m = new THREE.Mesh(new THREE.CircleGeometry(2.6, 20), new THREE.MeshLambertMaterial({ color: '#5a3d22', polygonOffset: true, polygonOffsetFactor: -4 }));
  m.rotation.x = -Math.PI / 2; m.scale.set(1, 0.7, 1); m.position.set(LUMPUR.x, 0.035, LUMPUR.z); scene.add(m);
}

// ---- bunga jerapah ----
function buatBunga() {
  const g = new THREE.Group();
  mesh(cyl(0.012, 0.012, 0.26, 5), '#3f8a3a', 0, -0.13, 0, g, false);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const p = mesh(sph(0.05, 6, 5), '#f27aa6', Math.cos(a) * 0.055, 0, Math.sin(a) * 0.055, g, false); p.scale.y = 0.45; }
  mesh(sph(0.035, 6, 5), '#f6d24b', 0, 0.012, 0, g, false);
  const daun = mesh(sph(0.04, 5, 4), '#4f9a43', 0.03, -0.12, 0, g, false); daun.scale.set(1.2, 0.3, 0.6);
  return g;
}

// ---- semprotan air & pelangi ----
const SEMPROT = { n: 220, aktif: 0, sumber: new THREE.Vector3(), arah: new THREE.Vector3() };
{
  const geo = new THREE.BufferGeometry();
  SEMPROT.pos = new Float32Array(SEMPROT.n * 3); SEMPROT.vel = new Float32Array(SEMPROT.n * 3); SEMPROT.umur = new Float32Array(SEMPROT.n).fill(9);
  geo.setAttribute('position', new THREE.BufferAttribute(SEMPROT.pos, 3));
  SEMPROT.pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#cfeeff', size: 0.16, transparent: true, opacity: 0.85, depthWrite: false }));
  SEMPROT.pts.frustumCulled = false; SEMPROT.pts.visible = false; scene.add(SEMPROT.pts);
  const pel = new THREE.Group(); pel.visible = false; scene.add(pel);
  ['#ff4d4d', '#ff9a3c', '#ffe14d', '#5bd65b', '#4da6ff', '#5b5bd6', '#a64dff'].forEach((w, i) => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(9.6 - i * 0.32, 0.17, 6, 48, Math.PI), new THREE.MeshBasicMaterial({ color: w, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    pel.add(t);
  });
  SEMPROT.pelangi = pel; SEMPROT.pelT = 0;
}
function updateSemprot(dt) {
  const S = SEMPROT; let ada = false;
  if (S.aktif > 0) S.aktif -= dt;
  for (let i = 0; i < S.n; i++) {
    let u = S.umur[i];
    if (u > 1.6 && S.aktif > 0 && Math.random() < 0.5) {
      u = 0; S.pos.set([S.sumber.x, S.sumber.y, S.sumber.z], i * 3);
      S.vel[i * 3] = S.arah.x * 5 + rand(-0.6, 0.6); S.vel[i * 3 + 1] = rand(6.5, 8.5); S.vel[i * 3 + 2] = S.arah.z * 5 + rand(-0.6, 0.6);
    }
    if (u <= 1.6) {
      ada = true; u += dt;
      S.vel[i * 3 + 1] -= 9.8 * dt;
      S.pos[i * 3] += S.vel[i * 3] * dt; S.pos[i * 3 + 1] = Math.max(0, S.pos[i * 3 + 1] + S.vel[i * 3 + 1] * dt); S.pos[i * 3 + 2] += S.vel[i * 3 + 2] * dt;
    } else S.pos[i * 3 + 1] = -50;
    S.umur[i] = u;
  }
  S.pts.visible = ada; if (ada) S.pts.geometry.attributes.position.needsUpdate = true;
  if (S.pelT > 0) {
    S.pelT -= dt;
    const o = Math.min(1, Math.min(10 - S.pelT, S.pelT) / 1.5) * 0.55;
    S.pelangi.visible = true; for (const m of S.pelangi.children) m.material.opacity = Math.max(0, o);
  } else S.pelangi.visible = false;
}

// ---- jalannya kejutan hewan ----
function hadapkanKe(x, z) { const want = Math.atan2(-(x - player.x), -(z - player.z)); camYaw = player.yaw = want; }
function kejutanSetelahMakan(A) {
  if (KEJ.aktif) return false;
  if (A.kind === 'kelinci' && !KEJ.kelinci) { KEJ.kelinci = true; mulaiKejutan(A, 'kelinci'); return true; }
  if (A.kind === 'gajah' && A === GAJAH_SURAT && !KEJ.gajah) { KEJ.gajah = true; mulaiKejutan(A, 'gajahSurat'); return true; }
  if (A.kind === 'gajah') { mulaiKejutan(A, 'semprot'); return true; }
  if (A.kind === 'jerapah' && !KEJ.jerapah) { KEJ.jerapah = true; mulaiKejutan(A, 'bunga'); return true; }
  return false;
}
function mulaiKejutan(A, jenis) {
  setTimeout(() => {
    if (AMATI.aktif) selesaiAmati();
    hadapkanKe(A.group.position.x, A.group.position.z); if (mode === 'fpp') camPitch = 0.15;
    A.state = 'kejutan'; A.kej = { jenis, fase: 0, t: 0 }; KEJ.aktif = A;
    if (jenis === 'kelinci') { A.kej.target = RUMAH_KELINCI.pintu; setTimeout(() => bicara('Eh, kelincinya lari ke rumahnya. Mau ngapain ya?', 4), 600); }
    else if (jenis === 'gajahSurat') { A.kej.target = [LUMPUR.x + 1.5, LUMPUR.z]; setTimeout(() => bicara('Gajahnya jalan ke kubangan lumpur. Lihat deh!', 4), 600); }
    else if (jenis === 'semprot') { A.kej.target = null; setTimeout(() => bicara('Awas, gajahnya mau menyemprot air!', 3), 300); }
    else if (jenis === 'bunga') { A.kej.target = clampIn(A.encl, player.x, player.z, 1.4); setTimeout(() => bicara('Jerapahnya balik lagi. Kayaknya mau kasih sesuatu.', 4), 600); }
  }, 900);
}
function jalanKe(A, tx, tz, dt, sp) {
  const g = A.group, dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz);
  if (d < 0.25) return true;
  const want = Math.atan2(dx, dz); A.yaw += angDiff(A.yaw, want) * Math.min(1, dt * 5);
  const st = Math.min(d, sp * dt * clamp(1 - Math.abs(angDiff(A.yaw, want)) / 1.6, 0.2, 1));
  g.position.x += Math.sin(A.yaw) * st; g.position.z += Math.cos(A.yaw) * st;
  return false;
}
function selesaiKejutan(A) { A.state = 'idle'; A.timer = rand(2, 4); A.kej = null; A.sembunyi = false; KEJ.aktif = null; if (A.trunk) A.trunk.forEach((s, i) => s.rotation.x = i === 0 ? -0.25 : 0.12); }
function kakiDepan(jarak = 0.55) { const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw); return [player.x + fx * jarak - rx * 0.45, player.z + fz * jarak - rz * 0.45]; }
function updateKejutanHewan(A, dt, t) {
  const K = A.kej; K.t += dt; let gerak = false;
  const ke = (x, z, sp) => { const s = jalanKe(A, x, z, dt, sp); gerak = !s; return s; };
  if (K.jenis === 'kelinci') {
    if (K.fase === 0 && ke(K.target[0], K.target[1], 2.2)) { K.fase = 1; K.t = 0; }
    else if (K.fase === 1) { gerak = true; if (ke(RUMAH_KELINCI.x, RUMAH_KELINCI.z + 0.4, 1.2) || K.t > 1) { A.sembunyi = true; A.group.visible = false; K.fase = 2; K.t = 0; } }
    else if (K.fase === 2 && K.t > 2) {
      A.sembunyi = false; A.group.visible = true; A.group.position.set(RUMAH_KELINCI.pintu[0], 0, RUMAH_KELINCI.pintu[1] - 0.2); A.yaw = 0;
      K.surat = buatAmplop(false); K.surat.scale.setScalar(0.55); K.surat.rotation.x = 1.2; K.surat.position.set(0, -0.05, 0.16); A.head.add(K.surat);
      K.fase = 3; K.t = 0; bicara('Kelincinya keluar bawa surat! 💌', 4);
    }
    else if (K.fase === 3) { const p = kakiDepan(0.6); K.akhir = p; if (ke(p[0], p[1], 1.8)) { K.fase = 4; K.t = 0; } }
    else if (K.fase === 4) {
      A.graze = Math.min(1, K.t * 2);
      if (K.t > 0.7) { taruhSurat(K.surat, K.akhir[0], K.akhir[1], { judul: KJT(KJ.kelinci, 'judul', 'Surat dari Kelinci 🐰'), isi: KJT(KJ.kelinci, 'isi', 'Hai! Ada yang titip pesan buat kamu: kamu orang paling spesial hari ini 💛'), lumpur: false }); K.fase = 5; K.t = 0; hint('Kelinci menaruh surat di depan kakimu. Ketuk suratnya 💌', 5000); if (mode === 'fpp') camPitch = 0.5; }
    }
    else if (K.fase === 5) { A.graze = Math.max(0, 1 - K.t * 2); const [bx, bz] = clampIn(A.encl, A.group.position.x, A.group.position.z, 2); if (ke(bx, bz, 2) || K.t > 6) selesaiKejutan(A); }
  } else if (K.jenis === 'gajahSurat') {
    if (K.fase === 0 && ke(K.target[0], K.target[1], 1.4)) { K.fase = 1; K.t = 0; }
    else if (K.fase === 1) {
      A.graze = Math.min(1, K.t); if (Math.random() < dt * 3) { A.head.getWorldPosition(tmpB); tmpB.y = 0.4; hearts(tmpB, 1, '💦'); }
      if (K.t > 2.5) { K.surat = buatAmplop(true); K.surat.scale.setScalar(0.8); const ujung = A.trunk[A.trunk.length - 1]; K.surat.position.set(0, -0.3, 0.05); K.surat.rotation.x = 1.4; ujung.add(K.surat); K.fase = 2; K.t = 0; bicara('Gajahnya ambil surat dari lumpur! 😆', 4); }
    }
    else if (K.fase === 2) { A.graze = Math.max(0, 1 - K.t); const p = clampIn(A.encl, player.x, player.z, 1.6); if (ke(p[0], p[1], 1.2)) { K.fase = 3; K.t = 0; } }
    else if (K.fase === 3) {
      const want = Math.atan2(player.x - A.group.position.x, player.z - A.group.position.z); A.yaw += angDiff(A.yaw, want) * Math.min(1, dt * 4);
      A.trunk.forEach(s => s.rotation.x = lerp(s.rotation.x, -0.3, dt * 2));
      if (K.t > 1.4) {
        K.surat.getWorldPosition(tmpA); K.dari = tmpA.clone(); scene.attach(K.surat); K.akhir = kakiDepan(0.6); K.fase = 4; K.t = 0;
      }
    }
    else if (K.fase === 4) {
      const u = Math.min(1, K.t / 0.9);
      K.surat.position.set(lerp(K.dari.x, K.akhir[0], u), lerp(K.dari.y, 0.03, u) + Math.sin(u * Math.PI) * 0.6, lerp(K.dari.z, K.akhir[1], u)); K.surat.rotation.x = lerp(1.4, 0, u);
      if (u >= 1) { taruhSurat(K.surat, K.akhir[0], K.akhir[1], { judul: KJT(KJ.gajah, 'judul', 'Surat dari Gajah 🐘'), isi: KJT(KJ.gajah, 'isi', 'Maaf suratnya kena lumpur sedikit, tadi aku main di kubangan. Isinya tetap sama: kamu disayang banget! 💌'), lumpur: true }); hint('Gajah menaruh surat yang agak berlumpur di depan kakimu. Ketuk suratnya 💌', 5000); if (mode === 'fpp') camPitch = 0.5; K.fase = 5; K.t = 0; }
    }
    else if (K.fase === 5 && K.t > 1.5) selesaiKejutan(A);
  } else if (K.jenis === 'semprot') {
    const want = Math.atan2(player.x - A.group.position.x, player.z - A.group.position.z); A.yaw += angDiff(A.yaw, want) * Math.min(1, dt * 3);
    const naik = K.t < 1.2 ? K.t / 1.2 : (K.t > 5 ? Math.max(0, 1 - (K.t - 5)) : 1);
    A.trunk.forEach((s, i) => s.rotation.x = lerp(i === 0 ? -0.25 : 0.12, -0.48, naik));
    if (K.t > 1.2 && K.t < 4.6) {
      const ujung = A.trunk[A.trunk.length - 1]; tmpA.set(0, -0.3, 0); ujung.localToWorld(tmpA); SEMPROT.sumber.copy(tmpA);
      SEMPROT.arah.set(Math.sin(A.yaw) * 0.25, 0, Math.cos(A.yaw) * 0.25); SEMPROT.aktif = 0.1;
      if (!K.pelangi) { K.pelangi = true; const pl = SEMPROT.pelangi; pl.position.set(A.group.position.x, 0, A.group.position.z); pl.rotation.y = Math.atan2(player.x - A.group.position.x, player.z - A.group.position.z); SEMPROT.pelT = 10; setTimeout(() => bicara('Wah, ada pelanginya! 🌈', 4), 1500); }
    }
    if (K.t > 6.2) selesaiKejutan(A);
  } else if (K.jenis === 'bunga') {
    if (K.fase === 0 && ke(K.target[0], K.target[1], 1.5)) { K.fase = 1; K.t = 0; K.bunga = buatBunga(); K.bunga.position.set(0, -0.06, 0.32); K.bunga.rotation.x = Math.PI / 2; K.bunga.scale.setScalar(1.6); A.head.add(K.bunga); }
    else if (K.fase === 1) {
      const want = Math.atan2(player.x - A.group.position.x, player.z - A.group.position.z); A.yaw += angDiff(A.yaw, want) * Math.min(1, dt * 4);
      A.graze = Math.min(0.75, K.t * 0.5);
      if (K.t > 2) { K.bunga.getWorldPosition(tmpA); K.dari = tmpA.clone(); scene.attach(K.bunga); K.fase = 2; K.t = 0; }
    }
    else if (K.fase === 2) {
      const u = Math.min(1, K.t / 1.2), kepala = kamu.headParts[0]; tmpB.set(0.12, 0.12, 0.02); kepala.localToWorld(tmpB);
      K.bunga.position.lerpVectors(K.dari, tmpB, ease(u)); K.bunga.position.y += Math.sin(u * Math.PI) * 0.3;
      if (u >= 1) {
        kepala.attach(K.bunga); K.bunga.position.set(0.12, 0.12, 0.02); K.bunga.rotation.set(0, 0, -0.9); K.bunga.scale.setScalar(1.1);
        hearts(tmpB, 5, '🌸'); K.fase = 3; K.t = 0;
        kartu('🌸', 'Bunga dari Jerapah', `<p style="text-align:center;font-size:17px;line-height:1.5">${escH(KJT(KJ, 'jerapah', 'Bunga ini dari jerapah. Katanya, kamu cantik sekali hari ini 🌸')).replace(/\n/g, '<br>')}</p>`);
        setTimeout(() => bicara('Bunganya cocok banget di rambutmu.', 4), 400);
      }
    }
    else if (K.fase === 3) { A.graze = Math.max(0, 0.75 - K.t); if (K.t > 1.5) selesaiKejutan(A); }
  }
  return gerak;
}
function updateSurat(dt) {
  for (const s of SURAT) { s.t -= dt; if (s.t <= 0 && Math.hypot(s.obj.position.x - player.x, s.obj.position.z - player.z) < 25) { s.t = 1.6; hearts(s.obj.position.clone().setY(0.25), 1, '✨'); } }
}

// ---- kunang-kunang membentuk tulisan di air terjun (malam) ----
const KUNANG = { n: 520, fase: 'acak', t: 0, k: 0 };
{
  const n = KUNANG.n, geo = new THREE.BufferGeometry();
  KUNANG.pos = new Float32Array(n * 3); KUNANG.col = new Float32Array(n * 3); KUNANG.rumah = new Float32Array(n * 3); KUNANG.fasa = new Float32Array(n);
  for (let i = 0; i < n; i++) { KUNANG.rumah.set([rand(-11, 11), rand(1, 8), rand(-214, -199)], i * 3); KUNANG.fasa[i] = rand(0, 6.28); }
  KUNANG.pos.set(KUNANG.rumah);
  geo.setAttribute('position', new THREE.BufferAttribute(KUNANG.pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(KUNANG.col, 3));
  const glow = tex(64, 64, (c, w, h) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,200,0.9)'); g.addColorStop(1, 'rgba(255,255,150,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
  KUNANG.pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.36, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  KUNANG.pts.frustumCulled = false; KUNANG.pts.visible = false; scene.add(KUNANG.pts);
  // titik-titik tulisan dari kanvas
  const teks = String(KJT(KJ, 'kunang', 'I ❤ U')).split(/\||\n/).map(s => s.trim()).filter(Boolean).slice(0, 2);
  const c = document.createElement('canvas'); c.width = 640; c.height = 220; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const fs = teks.length > 1 ? 92 : 140;
  teks.forEach((s, i) => { let f = fs; x.font = `700 ${f}px Fredoka, system-ui, sans-serif`; while (x.measureText(s).width > 610 && f > 30) { f -= 4; x.font = `700 ${f}px Fredoka, system-ui, sans-serif`; } x.fillText(s, 320, 110 + (i - (teks.length - 1) / 2) * 104); });
  const d = x.getImageData(0, 0, 640, 220).data, cand = [];
  for (let py = 0; py < 220; py += 3) for (let px = 0; px < 640; px += 3) if (d[(py * 640 + px) * 4 + 3] > 140) cand.push([(px - 320) / 640 * 12, 7.2 + (110 - py) / 220 * 4.1]);
  cand.sort(() => Math.random() - 0.5);
  KUNANG.target = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const p = cand.length ? cand[i % cand.length] : [rand(-8, 8), rand(3, 9)]; KUNANG.target.set([p[0], p[1], -205.5 + rand(-0.15, 0.15)], i * 3); }
}
function updateKunang(dt, t) {
  const K = KUNANG, malam = WAKTU.jam >= 18.5 || WAKTU.jam < 5.5;
  const tampil = malam && atBuka() && Math.hypot(player.x - AIR_TERJUN.x, player.z - AIR_TERJUN.z) < 70 && !gedungDalam(player.x, player.z);
  K.pts.visible = tampil; if (!tampil) return;
  K.t += dt;
  if (K.fase === 'acak' && K.t > 6) { K.fase = 'bentuk'; K.t = 0; }
  else if (K.fase === 'bentuk' && K.t > 3) { K.fase = 'tahan'; K.t = 0; }
  else if (K.fase === 'tahan' && K.t > 10) { K.fase = 'acak'; K.t = 0; }
  const ke = K.fase === 'acak' ? 0 : 1;
  K.k += (ke - K.k) * Math.min(1, dt * (ke ? 0.9 : 0.6));
  for (let i = 0; i < K.n; i++) {
    const f = K.fasa[i], j = i * 3;
    const ax = K.rumah[j] + Math.sin(t * 0.4 + f) * 1.6, ay = K.rumah[j + 1] + Math.sin(t * 0.7 + f * 2) * 0.8, az = K.rumah[j + 2] + Math.cos(t * 0.5 + f) * 1.2;
    const bx = K.target[j] + Math.sin(t * 2 + f) * 0.04, by = K.target[j + 1] + Math.cos(t * 2.2 + f) * 0.04, bz = K.target[j + 2];
    const u = clamp(K.k * 1.15 - (f / 6.28) * 0.15, 0, 1), e = u * u * (3 - 2 * u);
    K.pos[j] = lerp(ax, bx, e); K.pos[j + 1] = lerp(ay, by, e); K.pos[j + 2] = lerp(az, bz, e);
    const kedip = 0.35 + 0.65 * Math.max(0, Math.sin(t * (1.5 + f * 0.3) + f * 3)) * (1 - e * 0.6) + e * 0.55;
    K.col[j] = 0.85 * kedip; K.col[j + 1] = 1.0 * kedip; K.col[j + 2] = 0.35 * kedip;
  }
  K.pts.geometry.attributes.position.needsUpdate = true; K.pts.geometry.attributes.color.needsUpdate = true;
  if (K.fase === 'tahan' && !K.dilihat && K.t > 1 && Math.hypot(player.x, player.z + 205) < 35) { K.dilihat = true; setTimeout(() => bicara('Lihat kunang-kunangnya… membentuk tulisan! ✨', 5), 300); }
}

// ---- kenangan di layar bioskop setelah film selesai ----
const KEN = { sudah: false, aktif: false };
function adaKenangan() { const k = KJ.kenangan || {}; return !!((k.foto && k.foto.length) || k.video || (k.pesan && String(k.pesan).trim())); }
function layarTeks(baris, sub) { BIOS.layarMat.map = textTex(baris, { w: 1024, h: 440, size: 54, size2: 40, bg: '#1d1626', border: '#1d1626' }); BIOS.layarMat.needsUpdate = true; }
function mulaiKenangan() {
  if (KEN.sudah || !adaKenangan() || !(duduk && duduk.bioskop)) return false;
  KEN.sudah = true; KEN.aktif = true; BIOS.status = 'putar';
  if (BIOS.video) { BIOS.video.pause(); }
  hint('Eh, masih ada yang diputar di layar… 💞', 3500);
  const k = KJ.kenangan, langkah = [];
  langkah.push(cb => { layarTeks(['Kenangan Kita 💞']); setTimeout(cb, 3500); });
  if (k.video) langkah.push(cb => {
    const v = siapkanVideo(k.video); KEN.v = v; const vt = new THREE.VideoTexture(v); vt.colorSpace = THREE.SRGBColorSpace; KEN.vt = vt;
    BIOS.layarMat.map = vt; BIOS.layarMat.needsUpdate = true;
    v.onended = () => { vt.dispose(); KEN.v = null; cb(); }; v.onerror = () => cb();
    v.play().catch(() => { hint('Ketuk layar untuk memutar video kenangan.', 3000); setTimeout(cb, 4000); });
  });
  for (const src of (k.foto || [])) langkah.push(cb => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      BIOS.layarMat.map = tex(1024, 440, (c, w, h) => { c.fillStyle = '#100c14'; c.fillRect(0, 0, w, h); const s = Math.min(w / img.width, h / img.height); const iw = img.width * s, ih = img.height * s; c.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih); });
      BIOS.layarMat.needsUpdate = true; setTimeout(cb, 4500);
    };
    img.onerror = () => cb(); img.src = src;
  });
  if (k.pesan && String(k.pesan).trim()) langkah.push(cb => {
    BIOS.layarMat.map = tex(1024, 440, (c, w, h) => {
      c.fillStyle = '#1d1626'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffe9f1'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '600 40px Fredoka, system-ui, sans-serif';
      const kata = String(k.pesan).replace(/\n/g, ' \n ').split(' '), baris = []; let b = '';
      for (const kt of kata) { if (kt === '\n') { baris.push(b); b = ''; continue; } const coba = b ? b + ' ' + kt : kt; if (c.measureText(coba).width > 560) { baris.push(b); b = kt; } else b = coba; }
      if (b) baris.push(b); baris.slice(0, 7).forEach((s, i, a) => c.fillText(s, w / 2, h / 2 + (i - (a.length - 1) / 2) * 52));
    });
    BIOS.layarMat.needsUpdate = true; setTimeout(cb, 7000);
  });
  let i = 0;
  const lanjut = () => {
    if (!KEN.aktif) return;
    if (i < langkah.length) { langkah[i++](lanjut); return; }
    KEN.aktif = false;
    setTimeout(() => bicara('Makasih ya untuk semua kenangan ini. 💞', 5), 300);
    setTimeout(() => { if (duduk && duduk.bioskop) berdiri(); }, 4000);
  };
  lanjut();
  return true;
}

// ---- kue ulang tahun dari pelayan + rombongan + backsound ----
const KUE = { sudah: false, obj: null, rombongan: [], api: [], audio: null };
function modelKue() {
  const g = new THREE.Group();
  mesh(cyl(0.24, 0.24, 0.02, 20), '#ffffff', 0, 0.01, 0, g, false);
  mesh(cyl(0.18, 0.18, 0.13, 20), '#f7c6d6', 0, 0.085, 0, g);
  mesh(cyl(0.185, 0.185, 0.025, 20), '#ffffff', 0, 0.15, 0, g, false);
  mesh(cyl(0.12, 0.12, 0.1, 18), '#fff4e8', 0, 0.21, 0, g);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; mesh(sph(0.018, 5, 4), '#d23a3a', Math.cos(a) * 0.15, 0.17, Math.sin(a) * 0.15, g, false); }
  const api = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2, x = Math.cos(a) * 0.07, z = Math.sin(a) * 0.07;
    mesh(cyl(0.007, 0.007, 0.08, 5), ['#5aa7dc', '#f2d14b', '#e8836f', '#6aa64e', '#d98ad6'][i], x, 0.3, z, g, false);
    const f = new THREE.Mesh(cone(0.012, 0.035, 6), new THREE.MeshBasicMaterial({ color: '#ffb43a' })); f.position.set(x, 0.358, z); g.add(f); api.push(f);
  }
  return { g, api };
}
let laguSintetis = null;
function putarLaguUltah() {
  if (!suaraOn) return;
  const src = KJT(KJ.ultah, 'lagu', '');
  if (src) { try { const a = new Audio(src); a.volume = 0.9; KUE.audio = a; a.play().catch(() => {}); return; } catch (e) {} }
  // tanpa backsound dari admin: melodi selamat ulang tahun sederhana
  if (!actx) return;
  const N = { G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784 };
  const not = [['G4', .75], ['G4', .25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2], ['G4', .75], ['G4', .25], ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2], ['G4', .75], ['G4', .25], ['G5', 1], ['E5', 1], ['C5', 1], ['B4', 1], ['A4', 2], ['F5', .75], ['F5', .25], ['E5', 1], ['C5', 1], ['D5', 1], ['C5', 2]];
  let t0 = actx.currentTime + 0.1; const bt = 0.42;
  for (const [n, d] of not) {
    const o = actx.createOscillator(), g = actx.createGain(); o.type = 'triangle'; o.frequency.value = N[n];
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.18, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t0 + d * bt * 0.95);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + d * bt); t0 += d * bt;
  }
}
// kue datang dulu; pesanan makanan ditahan sampai permohonan ditulis, lilin ditiup, dan kue dirapikan pelayan
function cekKueUltah(m) {
  if (KUE.tahan) return true;
  const U = KJ.ultah; if (!U || U.aktif === false || KUE.sudah) return false;
  KUE.sudah = true; KUE.tahan = true; KUE.meja = m;
  KUE.jadwal = setTimeout(() => { if (duduk && duduk.meja === m) kirimKue(m); else { KUE.sudah = false; KUE.tahan = false; } }, 3000);
  return true;
}
function lepasTahanKue() {
  KUE.tahan = false; const m = KUE.meja;
  if (m && duduk && duduk.meja === m && pesanan.some(p => !p.dikirim)) setTimeout(() => { if (duduk && duduk.meja === m) kirimPelayan(m); }, 800);
}
function kirimKue(m) {
  const k = KIOS.reduce((a, b) => Math.hypot(b.depan[0] - m.x, b.depan[1] - m.z) < Math.hypot(a.depan[0] - m.x, a.depan[1] - m.z) ? b : a);
  const lewat = [m.x, m.z - 2.7];
  const N = buatNpc(k.depan, { baju: '#f8f4ea', celana: '#26262b', cewek: false });
  N.x = k.depan[0]; N.z = k.depan[1]; N.speed = 1.0; N.pelayan = true; N.gedung = 'fc'; N.bawa = true;
  const baki = new THREE.Group(); baki.position.set(0, 1.02, 0.42); N.P.group.add(baki);
  const kue = modelKue(); baki.add(kue.g); KUE.api = kue.api;
  N.jalur = [lewat, [m.x, m.z - 1.35]];
  KUE.rombongan = [N];
  const posisi = [[m.x - 1.5, m.z - 1.4], [m.x + 1.5, m.z - 1.4], [m.x - 2.1, m.z], [m.x + 2.1, m.z]];
  posisi.forEach((p, i) => {
    const R = buatNpc(k.depan, { baju: i % 2 ? '#f8f4ea' : '#e8836f', celana: '#26262b' });
    R.x = k.depan[0] + rand(-0.3, 0.3); R.z = k.depan[1]; R.speed = 1.0; R.pelayan = true; R.gedung = 'fc'; R.tunda = 0.9 * (i + 1);
    R.jalur = [lewat, p];
    R.onArrive = () => { R.yaw = Math.atan2(-(m.x - R.x), -(m.z + 0.4 - R.z)); R.tepuk = true; };
    KUE.rombongan.push(R);
  });
  putarLaguUltah();
  hint('Eh, ada pelayan datang bawa kue… 🎂🎵', 4000);
  N.onArrive = () => {
    N.yaw = Math.PI; N.bawa = false; N.tepuk = false;
    N.P.group.remove(baki);
    kue.g.position.set(m.x, 0.8, m.z); kue.g.scale.setScalar(1.25); kue.g.rotation.set(0, 0, 0); scene.add(kue.g); KUE.obj = kue.g;
    const it = addInteract(kue.g, 'kue', m, 0); it.label = '🎂 Kue ulang tahun';
    const nama = KJT(KJ.ultah, 'nama', '');
    npcBicara = N; npcBicaraT = 5; npcKonteks = 'pelayan'; gelNpc.textContent = `Selamat ulang tahun${nama ? ', Kak ' + nama : ', Kak'}! 🎂`; gelNpc.classList.remove('sembunyi');
    setTimeout(() => { N.tepuk = true; }, 600);
    setTimeout(() => tanyaTiup(), 3500);
  };
}
function tanyaTiup() {
  if (!KUE.obj || KUE.ditiup) return;
  const U = KJ.ultah || {}, nama = KJT(U, 'nama', '');
  rantaiTanya = rantaiTanya.then(() => new Promise(res => {
    kartu('🎂', 'Selamat Ulang Tahun' + (nama ? ', ' + nama : '') + '!', `<p style="text-align:center;font-size:17px;line-height:1.5">${escH(KJT(U, 'ucapan', 'Semoga semua harapanmu terkabul. Terima kasih sudah jadi orang paling spesial 💖')).replace(/\n/g, '<br>')}</p><label style="display:block;font-weight:600;margin-top:10px">🙏 Tulis permohonanmu dulu</label><textarea id="wish" maxlength="300" rows="3" placeholder="Aku berharap…" style="width:100%;box-sizing:border-box;font:inherit;padding:10px;border-radius:12px;border:1.5px solid #e2dccd;margin-top:6px"></textarea><div class="catatan">Setelah menulis permohonan, tiup lilinnya.</div>`, 'Tiup lilin 🕯️', () => {
      const w = ($('wish').value || '').trim();
      if (!w) { res(); hint('Tulis permohonannya dulu ya, baru tiup lilin 🙏', 3000); setTimeout(tanyaTiup, 400); return; }
      KUE.wish = w; try { localStorage.setItem('safari_wish', JSON.stringify({ wish: w, waktu: Date.now() })); } catch (e) {}
      tiupLilin(); res();
    });
    setTimeout(() => { const i = $('wish'); if (i) { i.focus(); i.onkeydown = e => e.stopPropagation(); i.onkeyup = e => e.stopPropagation(); } }, 50);
    $('k-tutup').textContent = 'Nanti dulu'; kartuTidak = () => { res(); hint('Pesanan makanan diantar setelah tiup lilin. Ketuk kuenya kalau sudah siap 🎂', 4000); };
  }));
}
function tiupLilin() {
  if (KUE.ditiup) return; KUE.ditiup = true;
  for (const f of KUE.api) f.visible = false;
  const p = KUE.obj.position.clone().setY(1.1);
  hearts(p, 8, '🎉'); setTimeout(() => hearts(p, 6, '💖'), 400);
  setTimeout(() => bicara(KJT(KJ.ultah, 'kataPasangan', 'Selamat ulang tahun, sayang. Semoga semua harapanmu terkabul. 💖'), 6), 700);
  for (const R of KUE.rombongan) if (KUE.rombongan.indexOf(R) > 0) { npcBicara = R; npcBicaraT = 2.5; gelNpc.textContent = 'Yeay! 🎉'; gelNpc.classList.remove('sembunyi'); break; }
  const m = KUE.obj ? MEJA.find(x => Math.abs(x.x - KUE.obj.position.x) < 0.01 && Math.abs(x.z - KUE.obj.position.z) < 0.01) : null;
  setTimeout(() => {
    const k = m ? KIOS.reduce((a, b) => Math.hypot(b.depan[0] - m.x, b.depan[1] - m.z) < Math.hypot(a.depan[0] - m.x, a.depan[1] - m.z) ? b : a) : KIOS[0];
    KUE.rombongan.forEach((R, i) => { R.tepuk = false; R.jalur = [m ? [m.x + (i - 2) * 0.6, m.z - 2.7] : [R.x, R.z - 1], k.depan]; R.pergi = true; R.tunda = i * 0.4; });
    KUE.rombongan = [];
  }, 3500);
  if (KUE.wish) setTimeout(() => hint('✨ Permohonanmu sudah terucap. Semoga terkabul!', 3500), 1500);
  // setelah rombongan pergi, pelayan datang merapikan kue, baru pesanan diantar
  setTimeout(() => rapikanKue(m), 9000);
}
function rapikanKue(m) {
  if (!KUE.obj || !m || !(duduk && duduk.meja === m)) { hapusKue(); lepasTahanKue(); return; }
  const k = KIOS.reduce((a, b) => Math.hypot(b.depan[0] - m.x, b.depan[1] - m.z) < Math.hypot(a.depan[0] - m.x, a.depan[1] - m.z) ? b : a);
  const N = buatNpc(k.depan, { baju: '#f8f4ea', celana: '#26262b', rambut: '#1a1a1a' });
  N.x = k.depan[0]; N.z = k.depan[1]; N.speed = 1.5; N.pelayan = true; N.gedung = 'fc';
  N.jalur = [[m.x, m.z - 2.7], [m.x, m.z - 1.35]];
  N.onArrive = () => {
    N.yaw = Math.PI; N.diamT = 1.6;
    npcBicara = N; npcBicaraT = 3; npcKonteks = 'pelayan'; gelNpc.textContent = 'Permisi, kuenya saya rapikan dulu ya, Kak. Pesanannya segera diantar.'; gelNpc.classList.remove('sembunyi');
    setTimeout(() => {
      const g = KUE.obj; hapusKue();
      if (g) { const baki = new THREE.Group(); baki.position.set(0, 1.02, 0.42); N.P.group.add(baki); mesh(box(0.55, 0.03, 0.38), '#6b4a2b', 0, 0, 0, baki, false); g.position.set(0, 0.02, 0); g.scale.setScalar(0.8); baki.add(g); N.bawa = true; }
      N.jalur = [[m.x, m.z - 2.7], k.depan]; N.pergi = true;
      lepasTahanKue();
    }, 1500);
  };
}
function hapusKue() {
  if (!KUE.obj) return;
  scene.remove(KUE.obj); const ix = interactables.findIndex(x => x.obj === KUE.obj); if (ix >= 0) interactables.splice(ix, 1);
  KUE.obj = null;
}
function updateKue(dt, t) {
  for (const f of KUE.api) if (f.visible) f.scale.set(1, 0.8 + Math.sin(t * 20 + f.position.x * 50) * 0.25, 1);
  for (const R of KUE.rombongan) if (R.tepuk && Math.random() < dt * 0.9) { tmpB.set(R.x, 2.1, R.z); hearts(tmpB, 1, pick(['🎵', '👏', '🎶'])); }
}

// ---- spot foto: buka kamera HP ----
const SPOT = [];
function spotFoto(x, z, rot, nama) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
  for (const sx of [-1.25, 1.25]) mesh(cyl(0.07, 0.07, 2.6, 6), '#6b4a2b', sx, 1.3, 0, g);
  const w = '#f27aa6';
  mesh(box(2.6, 0.16, 0.12), w, 0, 2.5, 0, g); mesh(box(2.6, 0.16, 0.12), w, 0, 0.6, 0, g);
  mesh(box(0.16, 2.0, 0.12), w, -1.25, 1.55, 0, g); mesh(box(0.16, 2.0, 0.12), w, 1.25, 1.55, 0, g);
  const papan = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5), new THREE.MeshLambertMaterial({ map: textTex(['📸 SPOT FOTO'], { w: 512, h: 116, size: 60, bg: '#2f5d3a', border: '#f2d14b' }), side: THREE.DoubleSide }));
  papan.position.set(0, 2.95, 0); g.add(papan);
  const tanda = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), new THREE.MeshLambertMaterial({ map: textTex(['📷'], { w: 128, h: 128, size: 70, bg: '#f2d14b', border: '#ffffff' }), polygonOffset: true, polygonOffsetFactor: -4 }));
  tanda.rotation.x = -Math.PI / 2; tanda.position.set(0, 0.04, 1.6); g.add(tanda);
  addCircle(x + Math.cos(rot) * 1.25, z - Math.sin(rot) * 1.25, 0.2); addCircle(x - Math.cos(rot) * 1.25, z + Math.sin(rot) * 1.25, 0.2);
  const it = addInteract(g, 'spotFoto', nama, 5); it.label = '📸 Foto pakai kamera HP';
  SPOT.push(g);
}
spotFoto(38.5, 86, 0.5, 'Pintu Masuk');
spotFoto(9, -196, 0.5, 'Air Terjun');
spotFoto(73, -12, 0.3, 'Taman Rekreasi');

const KAM = { stream: null, depan: true };
const kamEl = document.createElement('div');
kamEl.id = 'kamera'; kamEl.className = 'layar-penuh sembunyi';
kamEl.style.cssText = 'background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:60;padding:0';
kamEl.innerHTML = `<div id="kam-bingkai" style="position:relative;width:min(100vw,calc((100vh - 120px)*3/4));aspect-ratio:3/4;overflow:hidden;background:#111">
  <video id="kam-video" playsinline autoplay muted style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>
  <canvas id="kam-hias" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></canvas></div>
  <div style="display:flex;gap:18px;align-items:center;margin-top:16px">
  <button id="kam-tutup" class="tbl" style="width:52px;height:52px;font-size:20px">✕</button>
  <button id="kam-jepret" style="width:74px;height:74px;border-radius:50%;border:5px solid #fff;background:#f27aa6;font-size:28px">📸</button>
  <button id="kam-ganti" class="tbl" style="width:52px;height:52px;font-size:20px">🔄</button></div>`;
document.body.appendChild(kamEl);
function gambarHias(c, w, h, nama) {
  const s = w / 600;
  c.strokeStyle = '#f27aa6'; c.lineWidth = 26 * s; c.strokeRect(13 * s, 13 * s, w - 26 * s, h - 26 * s);
  c.strokeStyle = '#ffffff'; c.lineWidth = 5 * s; c.strokeRect(30 * s, 30 * s, w - 60 * s, h - 60 * s);
  c.fillStyle = 'rgba(47,93,58,0.88)'; const bh = 92 * s; c.fillRect(26 * s, h - bh - 26 * s, w - 52 * s, bh);
  c.fillStyle = '#fffaf0'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `600 ${34 * s}px Fredoka, system-ui, sans-serif`; c.fillText(KJT(KJ, 'judulFoto', 'Liburan di Taman Safari 💛'), w / 2, h - bh / 2 - 26 * s - 14 * s);
  const tg = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  c.font = `400 ${22 * s}px Fredoka, system-ui, sans-serif`; c.fillText(`📍 ${nama} · ${tg}`, w / 2, h - bh / 2 - 26 * s + 22 * s);
  c.font = `${44 * s}px system-ui`; c.fillText('🦒', 70 * s, 78 * s); c.fillText('🐘', w - 70 * s, 78 * s);
}
async function bukaKamera(nama) {
  KAM.nama = nama;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { hint('Browser ini belum bisa membuka kamera. Coba Chrome atau Safari terbaru lewat https.', 5000); return; }
  paused = true; kamEl.classList.remove('sembunyi');
  const cv = $('kam-hias'), r = $('kam-bingkai').getBoundingClientRect(); cv.width = Math.round(r.width * 2); cv.height = Math.round(r.height * 2);
  gambarHias(cv.getContext('2d'), cv.width, cv.height, nama);
  await nyalakanKamera();
}
async function nyalakanKamera() {
  matikanKamera();
  try {
    KAM.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: KAM.depan ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
    const v = $('kam-video'); v.srcObject = KAM.stream; v.style.transform = KAM.depan ? 'scaleX(-1)' : 'none'; await v.play().catch(() => {});
  } catch (e) {
    tutupKamera(); hint('Kamera tidak bisa dibuka. Izinkan akses kamera untuk halaman ini di pengaturan browser.', 5500);
  }
}
function matikanKamera() { if (KAM.stream) { KAM.stream.getTracks().forEach(t => t.stop()); KAM.stream = null; } }
function tutupKamera() { matikanKamera(); kamEl.classList.add('sembunyi'); paused = false; }
$('kam-tutup').onclick = tutupKamera;
$('kam-ganti').onclick = () => { KAM.depan = !KAM.depan; nyalakanKamera(); };
$('kam-jepret').onclick = () => {
  const v = $('kam-video'); if (!v.videoWidth) return;
  const W = 1200, H = 1600, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const s = Math.max(W / v.videoWidth, H / v.videoHeight), vw = v.videoWidth * s, vh = v.videoHeight * s;
  x.save(); if (KAM.depan) { x.translate(W, 0); x.scale(-1, 1); } x.drawImage(v, (W - vw) / 2, (H - vh) / 2, vw, vh); x.restore();
  gambarHias(x, W, H, KAM.nama);
  const url = c.toDataURL('image/jpeg', 0.92);
  matikanKamera(); kamEl.classList.add('sembunyi');
  $('foto-img').src = url; $('foto-unduh').href = url; $('foto-unduh').download = 'foto-safari.jpg';
  $('hasil-foto').classList.remove('sembunyi');
};

var kejSiap = false;
function updateKejutan(dt, t) { if (!kejSiap) return; updateSemprot(dt); updateSurat(dt); updateKunang(dt, t); updateKue(dt, t); }
grid.clear(); buildGrid();
kejSiap = true;

window.__safari = { WAHANA, tawarWahana, get NAIK_W() { return NAIK_W; }, animals, mulaiFilm, berdiri, KEJ, kejutanSetelahMakan, mulaiKejutan, KUNANG, KUE, kirimKue, tanyaTiup, mulaiKenangan, KEN, bukaKamera, SURAT, GAJAH_SURAT, USIR, get SATPAM() { return SATPAM; }, atBuka, JIP, HALTE, LIHAT, naikJip, turunJip, get NAIK() { return NAIK; }, statusJip, LOKET_MASUK, bukaTiketMasuk, STOK, BAWA, TIKET, aturBawa, bukaBooth, bukaFilm, DOMPET, pesanan: () => pesanan, NUMPANG, BALIK, MEJA, duduk: (i) => dudukMeja(MEJA[i]), AMATI, amati: mulaiAmati, info: () => ({ calls: renderer.info.render.calls, tri: renderer.info.render.triangles }), player, npcs, BIOS, ANTRIAN, WAKTU, TOPI, inter: () => interactables, open: (k) => { const it = interactables.find(i => i.kind === k); if (it) openInter(it); }, setMode: (m) => { mode = m; setModeLabel(); }, get modeT() { return modeT; }, cam: (y, p) => { camYaw = y; camPitch = p; }, tp: (x, z, yaw) => { player.x = x; player.z = z; if (yaw != null) { player.yaw = yaw; camYaw = yaw; } partner.x = x + 0.7; partner.z = z; } };
