'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { sb } from '@/lib/supabase';

type Parcel = { id: number; cx: number; cy: number; kind: string; insta: string; paid: boolean; created_at: string };
const GW = 36, P = 12, TTL = 30 * 60e3, PRICE: Record<string, number> = { house: 25000, shop: 50000 };
const CARD = process.env.NEXT_PUBLIC_PAY_CARD || 'karta raqami kiritilmagan', CONTACT = process.env.NEXT_PUBLIC_CONTACT || '';
const isRoad = (c: number, r: number) => c % 5 === 4 || r % 5 === 4;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const rnd = (seed: number) => { let s = seed || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const WALLS = ['#e8dcc8', '#d9a066', '#b5c4d1', '#c9a0a0', '#a9c9a4', '#e3d08a', '#9fb4c9'], ROOFS = ['#7a2e2e', '#2f3e5c', '#3b5b3b', '#4a3a2a', '#5a2f5a', '#222831'];
const mixc = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

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
    g.add(boxm(w, h, d, wallMat(wall, 3, 1), 0, h / 2, 0), boxm(w + 0.6, 0.5, d + 0.6, flat('#555b66'), 0, h + 0.25, 0));
    const aw = boxm(w, 0.3, 2, flat(['#c0392b', '#2e86c1', '#27ae60', '#f39c12'][Math.floor(r() * 4)]), 0, 3.2, d / 2 + 0.9); aw.rotation.x = 0.35; g.add(aw);
    g.add(boxm(w * 0.8, 1.1, 0.3, new THREE.MeshBasicMaterial({ map: textTex("DO'KON", '#ffe9a8', '#2a160a') }), 0, h - 0.2, d / 2 + 0.2));
  } else {
    const f = 1 + Math.floor(r() * 3), w = 7 + r() * 1.5, d = 6 + r() * 1.5, h = 3.2 * f; g.userData.top = h + 3.5;
    g.add(boxm(w, h, d, wallMat(wall, 2, f), 0, h / 2, 0));
    const rf = mesh(new THREE.ConeGeometry((Math.max(w, d) / 2 + 0.6) / 0.707, 3, 4), flat(roof), 0, h + 1.5, 0); rf.rotation.y = Math.PI / 4; g.add(rf);
    g.add(boxm(1.1, 2, 0.2, flat('#5b2a1e'), 0, 1, d / 2 + 0.1), boxm(0.9, 2, 0.9, flat('#7a5c4a'), w / 3, h + 2.2, 0));
  }
  return g;
};
const hold = () => { const g = new THREE.Group(); g.add(boxm(P - 3, 0.6, P - 3, flat(0xf6b040), 0, 0.3, 0)); g.userData.top = 1; return g; };

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
  [[46, 120, 0], [36, 100, 120], [26, 80, 220]].forEach(([w, h, y]) =>
    g.add(boxm(w, h, w, wallMat('#7a8798', 1, 1, [Math.round(w / 3.5), Math.round(h / 3)]), 0, y + h / 2, 0), boxm(w + 1.5, 2, w + 1.5, gold, 0, y + h, 0)));
  const sign = new THREE.MeshBasicMaterial({ map: textTex('MAGA', '#ffd76a', '#1a1208') });
  const crown = new THREE.Mesh(BOX, [sign, sign, gold, gold, sign, sign]); crown.scale.set(32, 8, 32); crown.position.y = 304; g.add(crown);
  g.add(mesh(new THREE.CylinderGeometry(0.4, 1.2, 50, 6), gold, 0, 333, 0), mesh(new THREE.SphereGeometry(1.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b3b }), 0, 360, 0));
  return g;
};

export default function City() {
  const box = useRef<HTMLDivElement>(null), tagsEl = useRef<HTMLDivElement>(null), S = useRef<any>({ groups: new Map(), tags: new Map() }), ps = useRef<Parcel[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]), [welcome, setWelcome] = useState(true), [sel, setSel] = useState<null | { cx: number; cy: number; parcel?: Parcel }>(null);
  const [nick, setNick] = useState(''), [q, setQ] = useState(''), [kind, setKind] = useState('house'), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const [off, setOff] = useState(0), [now, setNow] = useState(new Date());
  const live = parcels.filter(p => p.paid).length;
  const clk = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(now.getTime() + off * 36e5));

  useEffect(() => {
    const s = S.current, el = box.current!, W = () => el.clientWidth, H = () => el.clientHeight;
    s.groups = new Map(); s.tags.forEach((t: any) => t.el.remove()); s.tags = new Map(); s.rotate = true;
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W(), H()); el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, W() / H(), 1, 3000), tgt0 = new THREE.Vector3(GW * P / 2, 70, 40);
    camera.position.set(GW * P / 2 + 170, 150, GW * P + 60);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(tgt0); controls.enableDamping = true; controls.maxPolarAngle = 1.45; controls.minDistance = 15; controls.maxDistance = 700; controls.autoRotateSpeed = 0.5;
    controls.addEventListener('start', () => (s.anim = null));
    s.scene = scene; s.camera = camera; s.controls = controls; s.home = { tp: tgt0.clone(), cp: camera.position.clone() };
    const amb = new THREE.AmbientLight(0xffffff, 0.8), sun = new THREE.DirectionalLight(0xffe0b0, 0.8); sun.position.set(200, 300, 100); scene.add(amb, sun);
    scene.fog = new THREE.Fog(0x9ec9ff, 200, 1100); scene.background = new THREE.Color(0x9ec9ff);

    // ground: lawns (empty plots), roads, sidewalks
    const U = 48, cv = document.createElement('canvas'); cv.width = cv.height = GW * U; const g = cv.getContext('2d')!;
    for (let c = 0; c < GW; c++) for (let r = 0; r < GW; r++) {
      const x = c * U, y = r * U, v = c % 5 === 4, hz = r % 5 === 4;
      if (!v && !hz) { g.fillStyle = '#2d5a2b'; g.fillRect(x, y, U, U); g.fillStyle = '#34692f'; g.fillRect(x + 3, y + 3, U - 6, U - 6); continue; }
      g.fillStyle = '#3a3d44'; g.fillRect(x, y, U, U); g.fillStyle = '#8c8c86';
      if (v && !hz) { g.fillRect(x, y, 6, U); g.fillRect(x + U - 6, y, 6, U); }
      if (hz && !v) { g.fillRect(x, y, U, 6); g.fillRect(x, y + U - 6, U, 6); }
      g.fillStyle = '#e8e0b0';
      if (v && !hz) g.fillRect(x + U / 2 - 1.5, y + 8, 3, 14);
      if (hz && !v) g.fillRect(x + 8, y + U / 2 - 1.5, 14, 3);
    }
    const gt = new THREE.CanvasTexture(cv); gt.colorSpace = THREE.SRGBColorSpace; gt.anisotropy = 8;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GW * P, GW * P), new THREE.MeshLambertMaterial({ map: gt }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(GW * P / 2, 0, GW * P / 2); scene.add(ground);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), flat('#2a4f27')); outer.rotation.x = -Math.PI / 2; outer.position.set(GW * P / 2, -0.2, GW * P / 2); scene.add(outer);

    // trees
    const rt = rnd(7), spots: number[][] = [], d = new THREE.Object3D();
    for (let c = 0; c < GW; c++) for (let r = 0; r < GW; r++) if (!isRoad(c, r) && rt() < 0.6) spots.push([c * P + P / 2 + (rt() < 0.5 ? -5 : 5), r * P + P / 2 + (rt() < 0.5 ? -5 : 5), 0.8 + rt() * 0.7]);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 2.4, 5), flat('#5b3b22'), spots.length), crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2, 0), flat('#ffffff'), spots.length);
    spots.forEach(([x, z, k], i) => {
      d.scale.setScalar(k); d.position.set(x, 1.2 * k, z); d.updateMatrix(); trunks.setMatrixAt(i, d.matrix);
      d.position.y = 3.6 * k; d.updateMatrix(); crowns.setMatrixAt(i, d.matrix); crowns.setColorAt(i, new THREE.Color().setHSL(0.28 + rt() * 0.08, 0.5, 0.25 + rt() * 0.12));
    });
    scene.add(trunks, crowns);

    // street lamps along every road
    const lamps: number[][] = [];
    for (let k = 4; k < GW; k += 5) for (let i = 0; i < GW; i++) if (i % 5 !== 4)
      lamps.push([k * P + (i % 2 ? 0.9 : P - 0.9), i * P + P / 2], [i * P + P / 2, k * P + (i % 2 ? P - 0.9 : 0.9)]);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 5), flat('#3b3f46'), lamps.length), heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd27a }), lamps.length);
    const glowPos = new Float32Array(lamps.length * 3);
    d.scale.setScalar(1);
    lamps.forEach(([x, z], i) => { d.position.set(x, 3, z); d.updateMatrix(); poles.setMatrixAt(i, d.matrix); d.position.y = 6.1; d.updateMatrix(); heads.setMatrixAt(i, d.matrix); glowPos.set([x, 6.1, z], i * 3); });
    const gc = document.createElement('canvas'); gc.width = gc.height = 64; const gg = gc.getContext('2d')!, gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,220,140,1)'); gr.addColorStop(0.3, 'rgba(255,190,90,0.45)'); gr.addColorStop(1, 'rgba(255,170,60,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64);
    const gtex = new THREE.CanvasTexture(gc), glowGeo = new THREE.BufferGeometry(); glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
    const glow = new THREE.Points(glowGeo, new THREE.PointsMaterial({ map: gtex, size: 14, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: gtex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), lamps.length);
    d.rotation.x = -Math.PI / 2; lamps.forEach(([x, z], i) => { d.position.set(x, 0.06, z); d.updateMatrix(); pool.setMatrixAt(i, d.matrix); }); d.rotation.set(0, 0, 0);
    scene.add(poles, heads, glow, pool);

    // Uzbek traffic
    const cars: any[] = [], rc = rnd(99), COL = [0xf5f5f5, 0xf5f5f5, 0xf5f5f5, 0x15171c, 0xb9bfc7, 0x2a4f9c, 0x8a1b1b];
    for (let i = 0; i < 46; i++) { const m = carMesh(COL[Math.floor(rc() * COL.length)], rc() < 0.3); cars.push({ m, axis: i % 2 ? 'x' : 'z', road: 4 + 5 * Math.floor(rc() * 7), dir: rc() < 0.5 ? 1 : -1, pos: rc() * GW * P, v: 9 + rc() * 6 }); scene.add(m); }
    const place = (c: any) => {
      const L = c.road * P + P / 2, o = 2.4 * c.dir;
      if (c.axis === 'x') { c.m.position.set(c.pos, 0, L + o); c.m.rotation.y = c.dir > 0 ? 0 : Math.PI; } else { c.m.position.set(L - o, 0, c.pos); c.m.rotation.y = c.dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
    };

    const tw = tower(); tw.position.set(GW * P / 2, 0, -90); scene.add(tw);

    // day / night
    s.apply = () => {
      const hr: number = s.hour ?? 18.5, sn = Math.sin((hr - 6) / 12 * Math.PI), n = clamp(0.5 - sn * 2.2, 0, 1);
      const sky = n < 0.5 ? mixc([135, 190, 255], [217, 150, 130], n * 2) : mixc([217, 150, 130], [10, 16, 48], (n - 0.5) * 2), col = `rgb(${sky})`, e = clamp(n * 1.5, 0, 1);
      (scene.background as THREE.Color).set(col); (scene.fog as THREE.Fog).color.set(col);
      amb.intensity = 0.95 - 0.7 * n; sun.intensity = 0.9 - 0.8 * n;
      winMats.forEach(m => (m.emissiveIntensity = e)); (glow.material as THREE.PointsMaterial).opacity = e; (pool.material as THREE.Material).opacity = e * 0.55;
    };
    s.apply();

    // tap a plot
    const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt = new THREE.Vector3(), cvs = renderer.domElement;
    const hl = new THREE.Mesh(new THREE.BoxGeometry(P - 1, 0.4, P - 1), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5 })); hl.visible = false; scene.add(hl); s.hl = hl;
    let down = [0, 0, 0];
    cvs.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY, Date.now()]; });
    cvs.addEventListener('pointerup', e => {
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8 || Date.now() - down[2] > 500) return;
      const b = cvs.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), camera);
      if (ray.ray.intersectPlane(plane, pt)) s.pick(Math.floor(pt.x / P), Math.floor(pt.z / P));
    });

    let raf = 0, last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (s.anim) { controls.target.lerp(s.anim.tp, 0.06); camera.position.lerp(s.anim.cp, 0.06); if (camera.position.distanceTo(s.anim.cp) < 0.6) s.anim = null; }
      controls.autoRotate = s.rotate; controls.update();
      for (const c of cars) { c.pos = (c.pos + c.dir * c.v * dt + GW * P) % (GW * P); place(c); }
      const hw = W() / 2, hh = H() / 2;
      for (const tg of s.tags.values()) {
        const v = tg.pos.clone().project(camera);
        if (v.z > 1 || camera.position.distanceTo(tg.pos) > 280) { tg.el.style.display = 'none'; continue; }
        tg.el.style.display = 'block'; tg.el.style.transform = `translate(${v.x * hw + hw}px,${-v.y * hh + hh}px) translate(-50%,-100%)`;
      }
      renderer.render(scene, camera); raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onR = () => { renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); };
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
      const key = p.id + (p.paid ? 'p' : 'u'), ex = s.groups.get(p.id);
      if (ex && ex.userData.key === key) continue;
      if (ex) { s.scene.remove(ex); s.tags.get(p.id)?.el.remove(); }
      const g = p.paid ? build(p) : hold();
      g.position.set(p.cx * P + P / 2, 0, p.cy * P + P / 2); g.userData.key = key; s.scene.add(g); s.groups.set(p.id, g);
      const el = document.createElement('div'); el.className = 'nc-tag'; el.textContent = (p.paid ? '' : '⏳ ') + p.insta; tagsEl.current!.appendChild(el);
      s.tags.set(p.id, { el, pos: new THREE.Vector3(g.position.x, g.userData.top + 2.5, g.position.z) });
    }
    s.apply?.();
  }, [parcels]);

  S.current.pick = (cx: number, cy: number) => {
    const hl = S.current.hl;
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GW || isRoad(cx, cy)) { setSel(null); if (hl) hl.visible = false; return; }
    const parcel = ps.current.find(p => p.cx === cx && p.cy === cy && (p.paid || Date.now() - +new Date(p.created_at) < TTL));
    hl.position.set(cx * P + P / 2, 0.2, cy * P + P / 2); hl.visible = true; setSel({ cx, cy, parcel }); setDone(false); setMsg('');
  };
  const fly = (cx: number, cy: number) => { const x = cx * P + P / 2, z = cy * P + P / 2; S.current.anim = { tp: new THREE.Vector3(x, 0, z), cp: new THREE.Vector3(x + 28, 26, z + 38) }; };
  const zoom = (k: number) => { const s = S.current; s.anim = null; s.camera.position.lerpVectors(s.controls.target, s.camera.position, k); };
  const find = (v: string) => {
    const k = v.trim().replace(/^@/, '').toLowerCase(); if (!k) return;
    const p = ps.current.find(x => x.insta.toLowerCase() === k) || ps.current.find(x => x.insta.toLowerCase().includes(k));
    if (!p) { setNick(k.replace(/[^a-z0-9._]/g, '')); setMsg(`"${k}" topilmadi.`); setSel(null); return; }
    localStorage.setItem('insta', p.insta); setWelcome(false); setMsg(''); fly(p.cx, p.cy); S.current.pick(p.cx, p.cy);
  };
  const startBuild = () => {
    let best: number[] | null = null, bd = 1e9;
    for (let x = 0; x < GW; x++) for (let y = 0; y < GW; y++) if (!isRoad(x, y) && !ps.current.some(p => p.cx === x && p.cy === y)) { const dd = Math.hypot(x - GW / 2, y - GW / 2); if (dd < bd) { bd = dd; best = [x, y]; } }
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
