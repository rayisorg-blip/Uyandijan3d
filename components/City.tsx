'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { sb } from '@/lib/supabase';

type Parcel = { id: number; cx: number; cy: number; kind: string; insta: string; paid: boolean; created_at: string };
const GW = 36, P = 12, N = GW * P, TTL = 30 * 60e3, PRICE: Record<string, number> = { house: 25000, shop: 50000 };
const CARD = process.env.NEXT_PUBLIC_PAY_CARD || 'karta raqami kiritilmagan', CONTACT = process.env.NEXT_PUBLIC_CONTACT || '';
const HW = [1.6, 2.3, 3, 4.5], RW = [3.2, 4.6, 6, 9];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const rnd = (seed: number) => { let s = seed || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const WALLS = ['#e8dcc8', '#d9a066', '#b5c4d1', '#c9a0a0', '#a9c9a4', '#e3d08a', '#9fb4c9'], ROOFS = ['#7a2e2e', '#2f3e5c', '#3b5b3b', '#4a3a2a', '#5a2f5a', '#222831'];
const mixc = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
// terrain height: gentle hills in the city, mountains around it
const H = (x: number, z: number) => {
  const rim = clamp((Math.hypot(x - N / 2, z - N / 2) - 330) / 180, 0, 1);
  return 8 + 4 * Math.sin(x / 90) * Math.cos(z / 110) + 2.5 * Math.sin((x + z) / 80 + 1) + 0.8 * Math.sin(x / 27) * Math.sin(z / 33) + 60 * rim * rim;
};

const winMats: THREE.MeshLambertMaterial[] = [], texCache: Record<string, THREE.CanvasTexture> = {};
const winTex = (lit: boolean, cols: number, rows: number) => {
  const k = `${lit}${cols}${rows}`; if (texCache[k]) return texCache[k];
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  g.fillStyle = lit ? '#000' : '#fff'; g.fillRect(0, 0, 128, 128);
  const w = 128 / cols, h = 128 / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    g.fillStyle = lit ? ((i * 7 + j * 3) % 4 ? '#ffc766' : '#000') : '#33415c';
    g.fillRect(i * w + w * 0.22, j * h + h * 0.2, w * 0.56, h * 0.55);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (texCache[k] = t);
};
const wallMat = (color: string, cols: number, rows: number, rep?: number[]) => {
  const tex = (lit: boolean) => { const b = winTex(lit, cols, rows); if (!rep) return b; const t = b.clone(); t.needsUpdate = true; t.repeat.set(rep[0], rep[1]); return t; };
  const m = new THREE.MeshLambertMaterial({ color, map: tex(false), emissive: 0xffffff, emissiveMap: tex(true), emissiveIntensity: 0 });
  winMats.push(m); return m;
};
const textTex = (txt: string, fg: string, bg: string) => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128); g.fillStyle = fg; g.font = '900 88px Nunito, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 256, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
const flat = (c: string | number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const BOX = new THREE.BoxGeometry(1, 1, 1);
const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const boxm = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => { const m = mesh(BOX, mat, x, y, z); m.scale.set(w, h, d); return m; };

const build = (p: Parcel) => {
  const r = rnd(hash(p.insta)), g = new THREE.Group(), wall = WALLS[Math.floor(r() * WALLS.length)], roof = ROOFS[Math.floor(r() * ROOFS.length)];
  if (p.kind === 'shop') {
    const w = 9.5, d = 7, h = 4.6; g.userData.top = h + 1;
    g.add(boxm(w + 0.4, 2.4, d + 0.4, flat('#6b6258'), 0, -1, 0), boxm(w, h, d, wallMat(wall, 3, 1), 0, h / 2, 0), boxm(w + 0.6, 0.5, d + 0.6, flat('#555b66'), 0, h + 0.25, 0));
    const aw = boxm(w, 0.3, 2, flat(['#c0392b', '#2e86c1', '#27ae60', '#f39c12'][Math.floor(r() * 4)]), 0, 3.2, d / 2 + 0.9); aw.rotation.x = 0.35; g.add(aw);
    g.add(boxm(w * 0.8, 1.1, 0.3, new THREE.MeshBasicMaterial({ map: textTex("DO'KON", '#ffe9a8', '#2a160a') }), 0, h - 0.2, d / 2 + 0.2));
  } else {
    const f = 1 + Math.floor(r() * 3), w = 7 + r() * 1.5, d = 6 + r() * 1.5, h = 3.2 * f; g.userData.top = h + 3.5;
    g.add(boxm(w + 0.4, 2.4, d + 0.4, flat('#6b6258'), 0, -1, 0), boxm(w, h, d, wallMat(wall, 2, f), 0, h / 2, 0));
    const rf = mesh(new THREE.ConeGeometry((Math.max(w, d) / 2 + 0.6) / 0.707, 3, 4), flat(roof), 0, h + 1.5, 0); rf.rotation.y = Math.PI / 4; g.add(rf);
    g.add(boxm(1.1, 2, 0.2, flat('#5b2a1e'), 0, 1, d / 2 + 0.1), boxm(0.9, 2, 0.9, flat('#7a5c4a'), w / 3, h + 2.2, 0));
  }
  return g;
};
const hold = () => { const g = new THREE.Group(); g.add(boxm(P - 3, 0.8, P - 3, flat(0xf6b040), 0, 0.3, 0)); g.userData.top = 1; return g; };

const WHEEL = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 8), WM = flat('#111');
const HEAD = new THREE.MeshBasicMaterial({ color: 0xfff2b0 }), TAIL = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
const carMesh = (color: number, van: boolean) => {
  const g = new THREE.Group(), m = flat(color), glass = flat('#1b2230');
  g.add(boxm(4.4, van ? 2.3 : 1.1, 2, m, 0, van ? 1.65 : 0.95, 0));
  g.add(van ? boxm(1.2, 0.9, 2.02, glass, 1.4, 2.0, 0) : boxm(2.3, 0.9, 1.8, glass, -0.2, 1.95, 0));
  for (const sx of [-1.4, 1.4]) for (const sz of [-1, 1]) { const w = mesh(WHEEL, WM, sx, 0.45, sz); w.rotation.x = Math.PI / 2; g.add(w); }
  for (const sz of [-0.7, 0.7]) g.add(boxm(0.1, 0.3, 0.4, HEAD, 2.2, 1, sz), boxm(0.1, 0.3, 0.4, TAIL, -2.2, 1, sz));
  return g;
};
const tower = () => {
  const g = new THREE.Group(), gold = new THREE.MeshLambertMaterial({ color: 0xffc94a, emissive: 0x5a3d00 });
  g.add(boxm(52, 40, 52, flat('#555a63'), 0, -16, 0));
  [[46, 120, 0], [36, 100, 120], [26, 80, 220]].forEach(([w, h, y]) =>
    g.add(boxm(w, h, w, wallMat('#7a8798', 1, 1, [Math.round(w / 3.5), Math.round(h / 3)]), 0, y + h / 2, 0), boxm(w + 1.5, 2, w + 1.5, gold, 0, y + h, 0)));
  const sign = new THREE.MeshBasicMaterial({ map: textTex('MAGA', '#ffd76a', '#1a1208') });
  const crown = new THREE.Mesh(BOX, [sign, sign, gold, gold, sign, sign]); crown.scale.set(32, 8, 32); crown.position.y = 304; g.add(crown);
  g.add(mesh(new THREE.CylinderGeometry(0.4, 1.2, 50, 6), gold, 0, 333, 0), mesh(new THREE.SphereGeometry(1.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b3b }), 0, 360, 0));
  return g;
};
// road / river ribbons that follow the terrain
const ribbon = (lines: number[][], w: number, dy: number, color: string, po: number) => {
  const pos: number[] = [], idx: number[] = []; let base = 0;
  for (const L of lines) {
    const n = L.length / 2;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = L[b * 2] - L[a * 2], tz = L[b * 2 + 1] - L[a * 2 + 1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const x = L[i * 2], z = L[i * 2 + 1], y = H(x, z) + dy;
      pos.push(x - tz * w / 2, y, z + tx * w / 2, x + tz * w / 2, y, z - tx * w / 2);
      if (i < n - 1) { const k = base + i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    base += n * 2;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: po, polygonOffsetUnits: po }));
};

export default function City() {
  const box = useRef<HTMLDivElement>(null), tagsEl = useRef<HTMLDivElement>(null), S = useRef<any>({ groups: new Map(), tags: new Map() }), ps = useRef<Parcel[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]), [welcome, setWelcome] = useState(true), [sel, setSel] = useState<null | { cx: number; cy: number; parcel?: Parcel }>(null);
  const [nick, setNick] = useState(''), [q, setQ] = useState(''), [kind, setKind] = useState('house'), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const [off, setOff] = useState(0), [now, setNow] = useState(new Date()), [rev, setRev] = useState(0);
  const live = parcels.filter(p => p.paid).length;
  const clk = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(now.getTime() + off * 36e5));

  useEffect(() => {
    const s = S.current, el = box.current!, W = () => el.clientWidth, H2 = () => el.clientHeight;
    s.groups = new Map(); s.tags.forEach((t: any) => t.el.remove()); s.tags = new Map(); s.rotate = true; s.cars = [];
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W(), H2()); el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, W() / H2(), 1, 3000), tgt0 = new THREE.Vector3(N / 2, 20, 190);
    camera.position.set(N / 2 + 120, 110, 380);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(tgt0); controls.enableDamping = true; controls.maxPolarAngle = 1.45; controls.minDistance = 12; controls.maxDistance = 700; controls.autoRotateSpeed = 0.5;
    controls.screenSpacePanning = false; controls.panSpeed = 1.3;
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.addEventListener('start', () => (s.anim = null));
    s.scene = scene; s.camera = camera; s.controls = controls; s.home = { tp: tgt0.clone(), cp: camera.position.clone() };
    const amb = new THREE.AmbientLight(0xffffff, 0.8), sun = new THREE.DirectionalLight(0xffe0b0, 0.8); sun.position.set(200, 300, 100); scene.add(amb, sun);
    scene.fog = new THREE.Fog(0x9ec9ff, 300, 1200); scene.background = new THREE.Color(0x9ec9ff);

    // terrain with hills
    const tg = new THREE.PlaneGeometry(1500, 1500, 200, 200); tg.rotateX(-Math.PI / 2); tg.translate(N / 2, 0, N / 2);
    const tp = tg.attributes.position, col = new Float32Array(tp.count * 3), c1 = new THREE.Color(), rock = new THREE.Color('#8a7f6e');
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), z = tp.getZ(i), h = H(x, z); tp.setY(i, h);
      c1.setHSL(0.27 + 0.03 * Math.sin(x / 40 + z / 55), 0.38, clamp(0.26 + h / 150, 0.2, 0.42));
      if (h > 30) c1.lerp(rock, clamp((h - 30) / 40, 0, 1));
      col.set([c1.r, c1.g, c1.b], i * 3);
    }
    tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.computeVertexNormals();
    const terrain = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true })); scene.add(terrain);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), flat('#2a4f27')); under.rotation.x = -Math.PI / 2; under.position.set(N / 2, -1, N / 2); scene.add(under);
    const tw = tower(); tw.position.set(N / 2, H(N / 2, -90), -90); scene.add(tw);

    const d = new THREE.Object3D(), rt = rnd(7);
    s.loadCity = (lines: [number, number[]][]) => {
      // roads and river
      const by: number[][][] = [[], [], [], []]; lines.forEach(([c, L]) => by[c].push(L));
      scene.add(ribbon(by[3], RW[3], 0.05, '#3f7fbf', -1));
      for (const c of [0, 1, 2]) { scene.add(ribbon(by[c], RW[c] + 2.2, 0.08, '#8c8c86', -1)); scene.add(ribbon(by[c], RW[c], 0.12, '#3a3d44', -2)); }
      scene.add(ribbon(by[2], 0.3, 0.16, '#e8e0b0', -3));
      // which plots are free + which way the road is
      const blocked = new Uint8Array(GW * GW), fd = new Float32Array(GW * GW).fill(1e9), fx = new Float32Array(GW * GW), fz = new Float32Array(GW * GW);
      lines.forEach(([c, L]) => {
        for (let i = 1; i < L.length / 2; i++) {
          const x0 = L[i * 2 - 2], z0 = L[i * 2 - 1], x1 = L[i * 2], z1 = L[i * 2 + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 3));
          for (let k = 0; k < n; k++) {
            const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n, rr = HW[c] + 5.5;
            for (let cx = Math.max(0, Math.floor((x - 36) / P)); cx <= Math.min(GW - 1, Math.floor((x + 36) / P)); cx++)
              for (let cz = Math.max(0, Math.floor((z - 36) / P)); cz <= Math.min(GW - 1, Math.floor((z + 36) / P)); cz++) {
                const px = cx * P + P / 2, pz = cz * P + P / 2, dd = Math.hypot(px - x, pz - z), id = cz * GW + cx;
                if (dd < rr) blocked[id] = 1;
                if (dd < fd[id]) { fd[id] = dd; fx[id] = x - px; fz[id] = z - pz; }
              }
          }
        }
      });
      s.blocked = blocked; s.fd = fd; s.fx = fx; s.fz = fz;
      // trees in free plots + forest on the mountains
      const spots: number[][] = [];
      for (let c = 0; c < GW; c++) for (let r = 0; r < GW; r++) if (!blocked[r * GW + c] && rt() < 0.6) spots.push([c * P + P / 2 + (rt() < 0.5 ? -5 : 5), r * P + P / 2 + (rt() < 0.5 ? -5 : 5), 0.8 + rt() * 0.7]);
      for (let i = 0; i < 500; i++) { const a = rt() * 6.283, rr = 340 + rt() * 200; spots.push([N / 2 + Math.cos(a) * rr, N / 2 + Math.sin(a) * rr, 1.4 + rt() * 1.4]); }
      const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 2.4, 5), flat('#5b3b22'), spots.length), crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2, 0), flat('#ffffff'), spots.length);
      spots.forEach(([x, z, k], i) => {
        const h = H(x, z); d.rotation.set(0, 0, 0); d.scale.setScalar(k); d.position.set(x, h + 1.2 * k, z); d.updateMatrix(); trunks.setMatrixAt(i, d.matrix);
        d.position.y = h + 3.6 * k; d.updateMatrix(); crowns.setMatrixAt(i, d.matrix); crowns.setColorAt(i, new THREE.Color().setHSL(0.28 + rt() * 0.08, 0.5, 0.25 + rt() * 0.12));
      });
      scene.add(trunks, crowns);
      // street lamps along the roads
      const lamps: number[][] = [];
      lines.forEach(([c, L]) => {
        if (c === 3) return; const step = c === 0 ? 46 : 30; let sd = 0, next = 12, side = 1;
        for (let i = 1; i < L.length / 2; i++) {
          const x0 = L[i * 2 - 2], z0 = L[i * 2 - 1], x1 = L[i * 2], z1 = L[i * 2 + 1], len = Math.hypot(x1 - x0, z1 - z0); if (!len) continue;
          const tx = (x1 - x0) / len, tz = (z1 - z0) / len;
          while (next <= sd + len) { const a = next - sd, o = (HW[c] + 1.4) * side; lamps.push([x0 + tx * a - tz * o, z0 + tz * a + tx * o]); side = -side; next += step; }
          sd += len;
        }
      });
      lamps.length = Math.min(lamps.length, 2500);
      const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 5), flat('#3b3f46'), lamps.length), heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd27a }), lamps.length);
      const glowPos = new Float32Array(lamps.length * 3);
      d.rotation.set(0, 0, 0); d.scale.setScalar(1);
      lamps.forEach(([x, z], i) => { const h = H(x, z); d.position.set(x, h + 3, z); d.updateMatrix(); poles.setMatrixAt(i, d.matrix); d.position.y = h + 6.1; d.updateMatrix(); heads.setMatrixAt(i, d.matrix); glowPos.set([x, h + 6.1, z], i * 3); });
      const gc = document.createElement('canvas'); gc.width = gc.height = 64; const gg = gc.getContext('2d')!, gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,220,140,1)'); gr.addColorStop(0.3, 'rgba(255,190,90,0.45)'); gr.addColorStop(1, 'rgba(255,170,60,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64);
      const gtex = new THREE.CanvasTexture(gc), glowGeo = new THREE.BufferGeometry(); glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
      s.glow = new THREE.Points(glowGeo, new THREE.PointsMaterial({ map: gtex, size: 14, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: gtex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), lamps.length);
      d.rotation.x = -Math.PI / 2; lamps.forEach(([x, z], i) => { d.position.set(x, H(x, z) + 0.4, z); d.updateMatrix(); s.pool.setMatrixAt(i, d.matrix); }); d.rotation.set(0, 0, 0);
      scene.add(poles, heads, s.glow, s.pool);
      // Uzbek traffic on the real roads
      const rc = rnd(99), COL = [0xf5f5f5, 0xf5f5f5, 0xf5f5f5, 0x15171c, 0xb9bfc7, 0x2a4f9c, 0x8a1b1b];
      const cl = lines.filter(([c, L]) => c >= 1 && c < 3 && L.length >= 8).map(([c, L]) => {
        const cum = [0]; for (let i = 1; i < L.length / 2; i++) cum.push(cum[i - 1] + Math.hypot(L[i * 2] - L[i * 2 - 2], L[i * 2 + 1] - L[i * 2 - 1]));
        return { c, L, cum, len: cum[cum.length - 1] };
      }).filter(o => o.len > 60);
      if (cl.length) for (let i = 0; i < 50; i++) { const o = cl[Math.floor(rc() * cl.length)], m = carMesh(COL[Math.floor(rc() * COL.length)], rc() < 0.3); s.cars.push({ m, o, s: rc() * o.len, dir: rc() < 0.5 ? 1 : -1, v: 8 + rc() * 6 }); scene.add(m); }
      s.apply(); setRev(r => r + 1);
    };
    const place = (c: any) => {
      const { L, cum } = c.o; let i = 1; while (i < cum.length - 1 && cum[i] < c.s) i++;
      const x0 = L[i * 2 - 2], z0 = L[i * 2 - 1], x1 = L[i * 2], z1 = L[i * 2 + 1], len = cum[i] - cum[i - 1] || 1, t = clamp((c.s - cum[i - 1]) / len, 0, 1);
      const tx = (x1 - x0) / len * c.dir, tz = (z1 - z0) / len * c.dir, x = x0 + (x1 - x0) * t - tz * HW[c.o.c] * 0.5, z = z0 + (z1 - z0) * t + tx * HW[c.o.c] * 0.5;
      c.m.position.set(x, H(x, z), z); c.m.rotation.y = Math.atan2(-tz, tx);
    };
    fetch('/api/andijan').then(r => r.json()).then(j => { if (j.lines?.length) s.loadCity(j.lines); else setMsg("Andijon yo'llari yuklanmadi. Vercel'da Redeploy qiling."); }).catch(() => setMsg("Andijon yo'llari yuklanmadi."));

    s.apply = () => {
      const hr: number = s.hour ?? 18.5, sn = Math.sin((hr - 6) / 12 * Math.PI), n = clamp(0.5 - sn * 2.2, 0, 1);
      const sky = n < 0.5 ? mixc([135, 190, 255], [217, 150, 130], n * 2) : mixc([217, 150, 130], [20, 30, 74], (n - 0.5) * 2), colr = `rgb(${sky})`, e = clamp(n * 1.5, 0, 1);
      (scene.background as THREE.Color).set(colr); (scene.fog as THREE.Fog).color.set(colr);
      amb.intensity = 0.95 - 0.5 * n; sun.intensity = 0.9 - 0.75 * n;
      winMats.forEach(m => (m.emissiveIntensity = e));
      if (s.glow) { (s.glow.material as THREE.PointsMaterial).opacity = e; (s.pool.material as THREE.Material).opacity = e * 0.55; }
    };
    s.apply();

    const ray = new THREE.Raycaster(), cvs = renderer.domElement;
    const hl = new THREE.Mesh(new THREE.BoxGeometry(P - 1, 1.2, P - 1), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5 })); hl.visible = false; scene.add(hl); s.hl = hl;
    let down = [0, 0, 0];
    cvs.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY, Date.now()]; });
    cvs.addEventListener('pointerup', e => {
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8 || Date.now() - down[2] > 500) return;
      const b = cvs.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), camera);
      const hit = ray.intersectObject(terrain)[0]; if (hit) s.pick(Math.floor(hit.point.x / P), Math.floor(hit.point.z / P));
    });

    let raf = 0, last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (s.anim) { controls.target.lerp(s.anim.tp, 0.06); camera.position.lerp(s.anim.cp, 0.06); if (camera.position.distanceTo(s.anim.cp) < 0.6) s.anim = null; }
      controls.target.x = clamp(controls.target.x, -40, N + 40); controls.target.z = clamp(controls.target.z, -150, N + 40);
      controls.autoRotate = s.rotate; controls.update();
      for (const c of s.cars) { c.s += c.dir * c.v * dt; if (c.s > c.o.len) { c.s = c.o.len; c.dir = -1; } else if (c.s < 0) { c.s = 0; c.dir = 1; } place(c); }
      const hw = W() / 2, hh = H2() / 2;
      for (const tg2 of s.tags.values()) {
        const v = tg2.pos.clone().project(camera);
        if (v.z > 1 || camera.position.distanceTo(tg2.pos) > 280) { tg2.el.style.display = 'none'; continue; }
        tg2.el.style.display = 'block'; tg2.el.style.transform = `translate(${v.x * hw + hw}px,${-v.y * hh + hh}px) translate(-50%,-100%)`;
      }
      renderer.render(scene, camera); raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onR = () => { renderer.setSize(W(), H2()); camera.aspect = W() / H2(); camera.updateProjectionMatrix(); };
    addEventListener('resize', onR);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', onR); renderer.dispose(); renderer.domElement.remove(); };
  }, []);

  useEffect(() => { S.current.rotate = welcome; }, [welcome]);
  useEffect(() => { const [h, m] = clk.split(':').map(Number); S.current.hour = (h % 24) + m / 60; S.current.apply?.(); }, [clk]);

  useEffect(() => {
    sb.from('parcels').select('*').then(({ data }) => data && setParcels(data as Parcel[]));
    const ch = sb.channel('parcels').on('postgres_changes', { event: '*', schema: 'public', table: 'parcels' }, (pl: any) => {
      if (pl.eventType === 'DELETE') setParcels(a => a.filter(p => p.id !== pl.old.id)); else setParcels(a => [...a.filter(p => p.id !== pl.new.id), pl.new]);
    }).subscribe();
    const saved = localStorage.getItem('insta'); if (saved) { setNick(saved); setQ(saved); }
    const t = setInterval(() => { setNow(new Date()); setParcels(a => [...a]); }, 30000);
    return () => { sb.removeChannel(ch); clearInterval(t); };
  }, []);

  useEffect(() => {   // put houses into the 3D scene
    const s = S.current; ps.current = parcels; if (!s.scene) return;
    const liveP = parcels.filter(p => p.paid || Date.now() - +new Date(p.created_at) < TTL), ids = new Set(liveP.map(p => p.id));
    for (const [id, g] of s.groups) if (!ids.has(id)) { s.scene.remove(g); s.groups.delete(id); s.tags.get(id)?.el.remove(); s.tags.delete(id); }
    for (const p of liveP) {
      const key = p.id + (p.paid ? 'p' : 'u') + (s.fd ? 'f' : 'n'), ex = s.groups.get(p.id);
      if (ex && ex.userData.key === key) continue;
      if (ex) { s.scene.remove(ex); s.tags.get(p.id)?.el.remove(); }
      const g = p.paid ? build(p) : hold(), x = p.cx * P + P / 2, z = p.cy * P + P / 2, id = p.cy * GW + p.cx;
      g.position.set(x, H(x, z), z); if (s.fd && s.fd[id] < 1e8) g.rotation.y = Math.atan2(s.fx[id], s.fz[id]);
      g.userData.key = key; s.scene.add(g); s.groups.set(p.id, g);
      const el = document.createElement('div'); el.className = 'nc-tag'; el.textContent = (p.paid ? '' : '⏳ ') + p.insta; tagsEl.current!.appendChild(el);
      s.tags.set(p.id, { el, pos: new THREE.Vector3(x, g.position.y + g.userData.top + 2.5, z) });
    }
    s.apply?.();
  }, [parcels, rev]);

  S.current.pick = (cx: number, cy: number) => {
    const s = S.current, hl = s.hl;
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GW || s.blocked?.[cy * GW + cx]) { setSel(null); if (hl) hl.visible = false; setMsg("Bu yer yo'l yoki daryo, uy qurib bo'lmaydi"); return; }
    const parcel = ps.current.find(p => p.cx === cx && p.cy === cy && (p.paid || Date.now() - +new Date(p.created_at) < TTL));
    hl.position.set(cx * P + P / 2, H(cx * P + P / 2, cy * P + P / 2) + 0.4, cy * P + P / 2); hl.visible = true; setSel({ cx, cy, parcel }); setDone(false); setMsg('');
  };
  const fly = (cx: number, cy: number) => { const x = cx * P + P / 2, z = cy * P + P / 2, h = H(x, z); S.current.anim = { tp: new THREE.Vector3(x, h, z), cp: new THREE.Vector3(x + 28, h + 26, z + 38) }; };
  const zoom = (k: number) => { const s = S.current; s.anim = null; s.camera.position.lerpVectors(s.controls.target, s.camera.position, k); };
  const find = (v: string) => {
    const k = v.trim().replace(/^@/, '').toLowerCase(); if (!k) return;
    const p = ps.current.find(x => x.insta.toLowerCase() === k) || ps.current.find(x => x.insta.toLowerCase().includes(k));
    if (!p) { setNick(k.replace(/[^a-z0-9._]/g, '')); setMsg(`"${k}" topilmadi.`); setSel(null); return; }
    localStorage.setItem('insta', p.insta); setWelcome(false); setMsg(''); fly(p.cx, p.cy); S.current.pick(p.cx, p.cy);
  };
  const startBuild = () => {
    let best: number[] | null = null, bd = 1e9;
    for (let x = 0; x < GW; x++) for (let y = 0; y < GW; y++) if (!S.current.blocked?.[y * GW + x] && !ps.current.some(p => p.cx === x && p.cy === y)) { const dd = Math.hypot(x - GW / 2, y - GW / 2); if (dd < bd) { bd = dd; best = [x, y]; } }
    setWelcome(false); setMsg(''); if (best) { fly(best[0], best[1]); S.current.pick(best[0], best[1]); }
  };
  const order = async () => {
    const insta = nick.trim().replace(/^@/, ''); if (!sel) return;
    if (!/^[A-Za-z0-9._]{2,30}$/.test(insta)) return setMsg("Nik faqat lotin harf, raqam, nuqta va _ bo'lishi kerak");
    setBusy(true); setMsg('');
    const { data, error } = await sb.rpc('order_parcel', { p_cx: sel.cx, p_cy: sel.cy, p_kind: kind, p_insta: insta });
    setBusy(false); if (error) return setMsg(error.message);
    localStorage.setItem('insta', insta); setParcels(a => [...a.filter(p => p.id !== data.id), data]); setDone(true);
  };

  return <div className="nc">
    <style>{CSS}</style>
    <div ref={box} className="nc-3d" /><div ref={tagsEl} className="nc-tags" />
    <div className="nc-card"><b>ANDIJON 3D CITY</b><span>{live} aholi</span></div>
    <button className="nc-chip" onClick={() => setOff(o => (o + 3) % 24)}>🕒 {clk}</button>
    <div className="nc-zoom">
      <button onClick={() => zoom(0.7)}>+</button><button onClick={() => zoom(1.4)}>−</button><button onClick={() => (S.current.anim = { ...S.current.home })}>⌂</button>
    </div>
    <div className="nc-bottom">
      {msg && !sel && <div className="nc-bar" style={{ flexDirection: 'column' }}><span>{msg}</span>{msg.includes('topilmadi') && <button className="go" onClick={startBuild}>🏗 Mening uyim yo&apos;q — qurish</button>}</div>}
      <div className="nc-bar"><input placeholder="Instagram nik…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && find(q)} /><button className="go" onClick={() => find(q)}>Uyimni topish</button></div>
    </div>

    {sel && <div className="nc-sheet">
      {sel.parcel ? <>
        <h3>{sel.parcel.kind === 'shop' ? '🏪' : '🏠'} @{sel.parcel.insta}</h3>
        <span>{sel.parcel.paid ? 'Sotib olingan' : "⏳ To'lov kutilmoqda"}</span>
      </> : done ? <>
        <h3>✅ Buyurtma qabul qilindi</h3>
        <span>Yer 30 daqiqaga band. {PRICE[kind].toLocaleString()} so&apos;m to&apos;lang:</span><b>{CARD}</b>
        <span>To&apos;lov chekini {CONTACT || "Instagram'ga"} yuboring. Tasdiqlangach uyingiz paydo bo&apos;ladi.</span>
      </> : <>
        <h3>Bo&apos;sh yer</h3>
        <div className="nc-row"><button className={kind === 'house' ? 'go' : ''} onClick={() => setKind('house')}>🏠 Uy {PRICE.house.toLocaleString()}</button><button className={kind === 'shop' ? 'go' : ''} onClick={() => setKind('shop')}>🏪 Do&apos;kon {PRICE.shop.toLocaleString()}</button></div>
        <input placeholder="Uy tepasida chiqadigan Instagram nik" value={nick} onChange={e => setNick(e.target.value)} />
        <button className="go" disabled={busy} onClick={order}>{PRICE[kind].toLocaleString()} so&apos;m — sotib olish</button>
      </>}
      {msg && <span className="err">{msg}</span>}
      <button onClick={() => { setSel(null); if (S.current.hl) S.current.hl.visible = false; }}>Yopish</button>
    </div>}

    {welcome && <div className="nc-welcome">
      <h1>Andijon 3D City&apos;ga xush kelibsiz</h1>
      <p>Har bir Instagram nik — bitta uy. Sizniki shaharda turibdimi?</p>
      <div className="nc-sign">
        <h2>UYINGIZNI TOPING</h2>
        <input placeholder="Instagram nikingiz" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && find(q)} />
        <button className="dark" onClick={() => find(q)}>Uyimni topish</button>
        {msg && <span className="err">{msg}</span>}
        {msg.includes('topilmadi') && <button className="dark" onClick={startBuild}>🏗 Uy qurish</button>}
      </div>
      <small>Aholi: {live} · shahar o&apos;sib bormoqda</small>
      <button className="ghost" onClick={() => setWelcome(false)}>Shunchaki aylanib ko&apos;rish</button>
    </div>}
  </div>;
}

const CSS = `@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;900&display=swap');
.nc{position:fixed;inset:0;overflow:hidden;font-family:Nunito,system-ui,sans-serif;color:#3b2412}
.nc-3d,.nc-tags{position:absolute;inset:0}.nc-tags{pointer-events:none;overflow:hidden}
.nc-tag{position:absolute;left:0;top:0;display:none;background:#fff;border-radius:10px;padding:2px 9px;font-weight:900;font-size:12px;box-shadow:0 2px 6px #0006;white-space:nowrap}
.nc-card,.nc-chip,.nc-sheet,.nc-bar{background:#fbf0dc;border:3px solid #e9d6b0;border-radius:18px;box-shadow:0 4px 0 #c9b387}
.nc-card{position:absolute;top:12px;left:12px;padding:8px 14px;display:flex;flex-direction:column}.nc-card b{font-size:18px;font-weight:900}.nc-card span{font-size:13px}
.nc .nc-chip{position:absolute;top:12px;right:12px;padding:8px 12px;font:900 13px Nunito;color:#3b2412;cursor:pointer}
.nc-zoom{position:absolute;right:12px;bottom:90px;display:flex;flex-direction:column;gap:8px}
.nc .nc-zoom button{width:44px;height:44px;border-radius:14px;border:3px solid #e9d6b0;background:#fbf0dc;font:900 20px Nunito;color:#3b2412;box-shadow:0 3px 0 #c9b387;padding:0}
.nc-bottom{position:absolute;left:12px;right:70px;bottom:12px;display:flex;flex-direction:column;gap:8px;max-width:560px}
.nc-bar{display:flex;gap:8px;padding:8px;align-items:center;font-weight:700}
.nc input{flex:1;min-width:0;background:#fff;border:2px dashed #b08a55;border-radius:12px;padding:10px 12px;font:900 16px Nunito;color:#3b2412}
.nc button{font:900 15px Nunito;color:#3b2412;background:#fff7e6;border:2px solid #b08a55;border-radius:12px;padding:10px 14px;cursor:pointer}
.nc button.go{background:#f6b040;border:3px solid #3b2412;box-shadow:0 3px 0 #3b2412}.nc button:disabled{opacity:.5}
.nc-sheet{position:absolute;left:12px;right:12px;bottom:80px;max-width:420px;padding:14px;display:flex;flex-direction:column;gap:8px;z-index:4}
.nc-sheet h3{margin:0;font-weight:900}.nc-row{display:flex;gap:8px}.nc-row button{flex:1}.err{color:#b3261e;font-weight:900}
.nc-welcome{position:absolute;inset:0;z-index:9;background:rgba(10,8,22,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:16px;color:#fff7e6}
.nc-welcome h1{margin:0;font-size:clamp(28px,6vw,52px);font-weight:900;text-shadow:0 3px 12px #000a}.nc-welcome p{margin:0;font-weight:700}
.nc-sign{width:min(420px,100%);background:linear-gradient(#d8975a,#b87333);border:4px solid #8a5524;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;transform:rotate(-1.5deg);box-shadow:0 8px 24px #0008}
.nc-sign h2{margin:0;font-weight:900;color:#3b2412}.nc button.dark{background:#2a160a;border:0;color:#ffd27a;padding:13px}
.nc button.ghost{background:transparent;border:2px solid #ffd27a;color:#ffd27a;border-radius:999px;padding:10px 20px}`;
