export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const { VectorTile } = require('@mapbox/vector-tile');
const Pbf = require('pbf');

const Z = 14, NT = 2 ** Z, LAT0 = 40.7821, LNG0 = 72.3442, MX = 84300, MY = 110574, C = 1728, NP = 4;
const tileX = (lng: number) => Math.floor((lng + 180) / 360 * NT);
const tileY = (lat: number) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * NT); };

function rdp(p: number[][], eps: number): number[][] {
  if (p.length < 3) return p;
  const [ax, az] = p[0], [bx, bz] = p[p.length - 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
  let m = 0, k = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const d = Math.abs(dz * p[i][0] - dx * p[i][1] + bx * az - bz * ax) / L;
    if (d > m) { m = d; k = i; }
  }
  if (m <= eps) return [p[0], p[p.length - 1]];
  return [...rdp(p.slice(0, k + 1), eps).slice(0, -1), ...rdp(p.slice(k), eps)];
}

export async function GET(req: Request) {
  const part = (Number(new URL(req.url).searchParams.get('p')) || 0) % NP;
  try {
    const tj = await (await fetch('https://tiles.openfreemap.org/planet')).json();
    const tpl: string = tj.tiles[0], dLat = 1760 / MY, dLng = 1760 / MX, jobs: number[][] = [];
    for (let x = tileX(LNG0 - dLng); x <= tileX(LNG0 + dLng); x++)
      for (let y = tileY(LAT0 + dLat); y <= tileY(LAT0 - dLat); y++) jobs.push([x, y]);
    const out: any[] = [];
    await Promise.all(jobs.filter((_, i) => i % NP === part).map(async ([x, y]) => {
      const r = await fetch(tpl.replace('{z}', String(Z)).replace('{x}', String(x)).replace('{y}', String(y)));
      if (!r.ok) throw new Error('tile HTTP ' + r.status);
      const layer = new VectorTile(new Pbf(new Uint8Array(await r.arrayBuffer()))).layers.building;
      if (!layer) return;
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i), g = f.toGeoJSON(x, y, Z).geometry, p = f.properties || {};
        const polys: number[][][][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        for (const poly of polys) {
          const ring0 = poly[0]; if (!ring0 || ring0.length < 4) continue;
          let sx = 0, sy = 0; for (const q of ring0) { sx += q[0]; sy += q[1]; }
          if (tileX(sx / ring0.length) !== x || tileY(sy / ring0.length) !== y) continue; // tile-buffer duplicates
          let ring = ring0.slice(0, -1).map(([lo, la]) => [(lo - LNG0) * MX + C, -(la - LAT0) * MY + C]);
          let cx = 0, cz = 0; for (const q of ring) { cx += q[0]; cz += q[1]; } cx /= ring.length; cz /= ring.length;
          if (Math.abs(cx - C) > 1730 || Math.abs(cz - C) > 1730) continue;
          let a = 0; for (let k = 0; k < ring.length; k++) { const q = ring[(k + 1) % ring.length]; a += ring[k][0] * q[1] - q[0] * ring[k][1]; }
          const area = Math.abs(a) / 2; if (area < 25) continue;
          ring = rdp(ring, 0.8); if (ring.length < 3) continue;
          const hv = Number(p.render_height), est = !(hv > 0);
          const h = est ? (area < 120 ? 4.5 : area < 500 ? 7 : area < 2000 ? 12 : 15) : hv;
          out.push([Math.round(cx), Math.round(cz), Math.round(h * 10) / 10, Number(p.render_min_height) || 0, est ? 1 : 0,
            ring.flatMap(([px, pz]) => [Math.round((px - cx) * 4), Math.round((pz - cz) * 4)])]);
        }
      }
    }));
    return Response.json({ b: out }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
