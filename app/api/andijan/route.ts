export const maxDuration = 30;

const LAT0 = 40.7821, LNG0 = 72.3442, U = 8, N = 432;
const toXZ = (lat: number, lon: number) => [(lon - LNG0) * 84300 / U + N / 2, -(lat - LAT0) * 110574 / U + N / 2];
const CLS: Record<string, number> = { motorway: 2, trunk: 2, primary: 2, secondary: 1, tertiary: 1 };
const HOSTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

export async function GET() {
  const dlat = 1728 / 110574, dlng = 1728 / 84300;
  const bb = `${LAT0 - dlat},${LNG0 - dlng},${LAT0 + dlat},${LNG0 + dlng}`;
  const q = `[out:json][timeout:25];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street)$"](${bb});way["waterway"~"^(river|canal|stream)$"](${bb}););out geom;`;
  for (const host of HOSTS) {
    try {
      const r = await fetch(host, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'AndijonCity/1.0' },
        signal: AbortSignal.timeout(9000),
      });
      if (!r.ok) continue;
      const j = await r.json(), lines: any[] = [];
      for (const w of j.elements ?? []) {
        if (!w.geometry) continue;
        const cls = w.tags?.waterway ? 3 : (CLS[w.tags?.highway] ?? 0);
        let run: number[] = [];
        const flush = () => { if (run.length >= 4) lines.push([cls, run]); run = []; };
        for (const p of w.geometry) {
          const [x, z] = toXZ(p.lat, p.lon);
          if (x < -10 || x > N + 10 || z < -10 || z > N + 10) { flush(); continue; }
          const n = run.length;
          if (n >= 2 && Math.hypot(x - run[n - 2], z - run[n - 1]) < 2) continue;
          run.push(Math.round(x * 10) / 10, Math.round(z * 10) / 10);
        }
        flush();
      }
      if (!lines.length) continue;
      return Response.json({ lines }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } });
    } catch {}
  }
  return Response.json({ lines: [] }, { status: 502 });
}
