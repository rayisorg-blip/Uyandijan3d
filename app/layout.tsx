import './globals.css';

export const metadata = { title: 'ANDIJON 3D CITY', description: 'Your city. Your home. Your virtual world.' };

const PATCH = `(function () {
  var of = window.fetch, KEY = 'andijan_roads_v1';
  var LAT0 = 40.7821, LNG0 = 72.3442, U = 8, N = 432;
  var CLS = { motorway: 2, trunk: 2, primary: 2, secondary: 1, tertiary: 1 };
  var HOSTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
  var dlat = 1728 / 110574, dlng = 1728 / 84300;
  var bb = (LAT0 - dlat) + ',' + (LNG0 - dlng) + ',' + (LAT0 + dlat) + ',' + (LNG0 + dlng);
  var q = '[out:json][timeout:60];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street)$"](' + bb + ');way["waterway"~"^(river|canal|stream)$"](' + bb + '););out tags geom;';
  function conv(j) {
    var out = [], els = j.elements || [];
    for (var a = 0; a < els.length; a++) {
      var w = els[a]; if (!w.geometry) continue;
      var t = w.tags || {}, cls = t.waterway ? 3 : (CLS[t.highway] || 0), run = [];
      var flush = function () { if (run.length >= 4) out.push([cls, run]); run = []; };
      for (var b = 0; b < w.geometry.length; b++) {
        var p = w.geometry[b]; if (!p) continue;
        var x = (p.lon - LNG0) * 84300 / U + N / 2, z = -(p.lat - LAT0) * 110574 / U + N / 2;
        if (x < -10 || x > N + 10 || z < -10 || z > N + 10) { flush(); continue; }
        var n = run.length;
        if (n >= 2 && Math.hypot(x - run[n - 2], z - run[n - 1]) < 2) continue;
        run.push(Math.round(x * 10) / 10, Math.round(z * 10) / 10);
      }
      flush();
    }
    return out;
  }
  function reply(lines) { return new Response(JSON.stringify({ lines: lines }), { headers: { 'Content-Type': 'application/json' } }); }
  window.fetch = function (input) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/andijan') < 0) return of.apply(this, arguments);
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (c && c.lines && c.lines.length && c.t > Date.now() - 864e5) return Promise.resolve(reply(c.lines));
    } catch (e) {}
    function tryHost(i) {
      if (i >= HOSTS.length) return of('/api/andijan');
      var ac = new AbortController(), timer = setTimeout(function () { ac.abort(); }, 40000);
      return of(HOSTS[i], { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ac.signal })
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (j) {
          clearTimeout(timer);
          var lines = conv(j); if (!lines.length) throw 0;
          try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), lines: lines })); } catch (e) {}
          return reply(lines);
        })
        .catch(function () { clearTimeout(timer); return tryHost(i + 1); });
    }
    return tryHost(0);
  };
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><script dangerouslySetInnerHTML={{ __html: PATCH }} /></head>
      <body>{children}</body>
    </html>
  );
}
