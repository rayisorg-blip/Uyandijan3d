import './globals.css';

export const metadata = { title: 'ANDIJON 3D CITY', description: 'Your city. Your home. Your virtual world.' };

const PATCH = `(function () {
  var of = window.fetch, KEY = 'andijan_roads_v2';
  var LAT0 = 40.7821, LNG0 = 72.3442, U = 8, N = 432, Z = 14, NT = Math.pow(2, Z);
  var CLASSMAP = { motorway: 2, trunk: 2, primary: 2, secondary: 1, tertiary: 1, minor: 0 };
  var dlat = 1728 / 110574, dlng = 1728 / 84300;
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
  function Reader(b, s, e) { this.b = b; this.p = s || 0; this.e = e == null ? b.length : e; }
  Reader.prototype.varint = function () { var r = 0, m = 1, c; do { c = this.b[this.p++]; r += (c & 127) * m; m *= 128; } while (c & 128); return r; };
  function skip(r, w) {
    if (w === 0) r.varint(); else if (w === 1) r.p += 8; else if (w === 2) r.p += r.varint(); else if (w === 5) r.p += 4; else throw "tile format";
  }
  function utf8(b, s, e) { return new TextDecoder().decode(b.subarray(s, e)); }
  function decodeValue(buf, s, e) {
    var r = new Reader(buf, s, e), out = null;
    while (r.p < r.e) {
      var k = r.varint(), f = k >> 3, w = k & 7;
      if (f === 1 && w === 2) { var len = r.varint(); out = utf8(buf, r.p, r.p + len); r.p += len; } else skip(r, w);
    }
    return out;
  }
  function decodeLayer(buf, s, e) {
    var r = new Reader(buf, s, e), L = { name: '', keys: [], vals: [], feats: [], ext: 4096 };
    while (r.p < r.e) {
      var k = r.varint(), f = k >> 3, w = k & 7;
      if (w === 2) {
        var len = r.varint(), end = r.p + len;
        if (f === 1) L.name = utf8(buf, r.p, end);
        else if (f === 2) L.feats.push([r.p, end]);
        else if (f === 3) L.keys.push(utf8(buf, r.p, end));
        else if (f === 4) L.vals.push(decodeValue(buf, r.p, end));
        r.p = end;
      } else if (f === 5 && w === 0) L.ext = r.varint(); else skip(r, w);
    }
    return L;
  }
  function decodeTile(buf) {
    var layers = {}, r = new Reader(buf);
    while (r.p < r.e) {
      var k = r.varint(), f = k >> 3, w = k & 7;
      if (f === 3 && w === 2) {
        var len = r.varint(), end = r.p + len, L = decodeLayer(buf, r.p, end);
        if (L.name === 'transportation' || L.name === 'waterway') layers[L.name] = L;
        r.p = end;
      } else skip(r, w);
    }
    return layers;
  }
  function decodeFeature(buf, s, e) {
    var r = new Reader(buf, s, e), F = { tags: [], type: 0, geom: [] };
    while (r.p < r.e) {
      var k = r.varint(), f = k >> 3, w = k & 7;
      if (w === 2 && (f === 2 || f === 4)) {
        var len = r.varint(), end = r.p + len, arr = f === 2 ? F.tags : F.geom;
        while (r.p < end) arr.push(r.varint());
        r.p = end;
      } else if (f === 3 && w === 0) F.type = r.varint(); else skip(r, w);
    }
    return F;
  }
  function polylines(F) {
    var out = [], cur = null, x = 0, y = 0, g = F.geom, i = 0;
    while (i < g.length) {
      var cmd = g[i] & 7, n = g[i++] >>> 3;
      for (var j = 0; j < n; j++) {
        if (cmd === 7) continue;
        var dx = g[i++], dy = g[i++];
        x += (dx >>> 1) ^ -(dx & 1); y += (dy >>> 1) ^ -(dy & 1);
        if (cmd === 1) { cur = []; out.push(cur); }
        cur.push([x, y]);
      }
    }
    return out;
  }
  function tileX(lng) { return Math.floor((lng + 180) / 360 * NT); }
  function tileY(lat) { var r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * NT); }
  async function load() {
    var tj = await (await of('https://tiles.openfreemap.org/planet')).json();
    var tpl = tj.tiles[0], jobs = [];
    for (var X = tileX(LNG0 - dlng); X <= tileX(LNG0 + dlng); X++)
      for (var Y = tileY(LAT0 + dlat); Y <= tileY(LAT0 - dlat); Y++) jobs.push([X, Y]);
    var res = await Promise.all(jobs.map(function (t) {
      return of(tpl.replace('{z}', Z).replace('{x}', t[0]).replace('{y}', t[1]))
        .then(function (r) { if (!r.ok) throw 'HTTP ' + r.status; return r.arrayBuffer(); })
        .then(function (ab) { return [t, new Uint8Array(ab)]; });
    }));
    var out = [];
    res.forEach(function (it) {
      var TX = it[0][0], TY = it[0][1], buf = it[1], layers = decodeTile(buf);
      ['transportation', 'waterway'].forEach(function (name) {
        var L = layers[name]; if (!L) return;
        L.feats.forEach(function (fr) {
          var F = decodeFeature(buf, fr[0], fr[1]); if (F.type !== 2) return;
          var props = {}, i;
          for (i = 0; i + 1 < F.tags.length; i += 2) props[L.keys[F.tags[i]]] = L.vals[F.tags[i + 1]];
          var c = props['class'], cls = null;
          if (name === 'waterway') { if (c === 'river' || c === 'canal') cls = 3; } else cls = CLASSMAP[c];
          if (cls == null) return;
          polylines(F).forEach(function (pl) {
            var run = [];
            function flush() { if (run.length >= 4) out.push([cls, run]); run = []; }
            pl.forEach(function (p) {
              var lng = (TX + p[0] / L.ext) / NT * 360 - 180;
              var lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (TY + p[1] / L.ext) / NT))) * 180 / Math.PI;
              var x = (lng - LNG0) * 84300 / U + N / 2, z = -(lat - LAT0) * 110574 / U + N / 2;
              if (x < -10 || x > N + 10 || z < -10 || z > N + 10) { flush(); return; }
              var n = run.length;
              if (n >= 2 && Math.hypot(x - run[n - 2], z - run[n - 1]) < 2) return;
              run.push(Math.round(x * 10) / 10, Math.round(z * 10) / 10);
            });
            flush();
          });
        });
      });
    });
    if (!out.length) throw "bo'sh javob";
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
    banner("⏳ Andijon yo'llari yuklanmoqda, 5-20 soniya kuting...");
    return load().then(function (lines) {
      try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), lines: lines })); } catch (e) {}
      banner('');
      return reply(lines);
    }).catch(function (e) {
      banner("❌ Yo'llar yuklanmadi: " + String((e && e.message) || e), true);
      return of('/api/andijan');
    });
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
