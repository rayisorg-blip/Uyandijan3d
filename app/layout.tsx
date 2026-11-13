import './globals.css';

export const metadata = { title: 'ANDIJON 3D CITY', description: 'Your city. Your home. Your virtual world.' };

const PATCH = `(function () {
  var of = window.fetch;
  var LAT0 = 40.7821, LNG0 = 72.3442, U = 8, N = 432;
  var CLS = { motorway: 2, trunk: 2, primary: 2, secondary: 1, tertiary: 1 };
  function banner(t, bad) {
    var b = document.getElementById('road-status');
    if (!t) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('div'); b.id = 'road-status';
      b.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:99;background:#fbf0dc;border:3px solid #e9d6b0;border-radius:14px;padding:8px 14px;font:700 13px system-ui;box-shadow:0 3px 0 #c9b387;max-width:90vw;text-align:center';
      document.body.appendChild(b);
    }
    b.textContent = t; b.style.color = bad ? '#b3261e' : '#3b2412';
  }
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
    banner("⏳ Andijon xaritasi yuklanmoqda...");
    return of('/andijan.json')
      .then(function (r) { if (!r.ok) throw 'andijan.json topilmadi (HTTP ' + r.status + ')'; return r.json(); })
      .then(function (j) {
        var lines = conv(j); if (!lines.length) throw "fayl bo'sh yoki noto'g'ri";
        banner('');
        return reply(lines);
      })
      .catch(function (e) { banner('❌ ' + String((e && e.message) || e), true); return reply([]); });
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
