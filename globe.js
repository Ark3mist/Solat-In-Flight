/* SolAir — globe view. Orthographic projection on a <canvas>, no
 * dependencies, works offline. Needs solat.js and world.js loaded first;
 * world50.js (1:50m coastline) is loaded on demand when zoomed in.
 *
 * Draws: land (vector, so it stays sharp at any zoom), day/twilight/night
 * shading from the sun's true position, prayer lines (where each prayer is
 * starting at the chosen instant), the route through every fix, prayer events
 * labelled relative to the nearest fix, the sun and moon (with its phase) over
 * the points where they are overhead, the Kaaba, the aircraft and a scale bar.
 * Drag to rotate; wheel / pinch / double-tap / buttons to zoom. */
(function (root) {
  "use strict";
  const S = root.Solat;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const ZMIN = 1, ZMAX = 80, HI_RES_FROM = 2.5;

  const LINES = [
    { name: "Fajr",    color: "#8b5cf6" },
    { name: "Sunrise", color: "#f97316" },
    { name: "Zuhr",    color: "#eab308" },
    { name: "Asr",     color: "#22c55e" },
    { name: "Maghrib", color: "#ef4444" },
    { name: "Isha",    color: "#3b82f6" },
  ];

  const vec = (lat, lon) => { const a = lat * D2R, b = lon * D2R; return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // ---- land: rings as unit vectors with a bounding cap for culling ----------
  function prepRings(data, scale) {
    const rings = [];
    for (const d of data || []) {
      const n = d.length / 2, v = new Float64Array(n * 3);
      let lon = 0, lat = 0, sx = 0, sy = 0, sz = 0;
      for (let i = 0; i < n; i++) {
        lon += d[2 * i]; lat += d[2 * i + 1];
        const a = (lat / scale) * D2R, b = (lon / scale) * D2R, ca = Math.cos(a);
        v[3 * i] = ca * Math.cos(b); v[3 * i + 1] = ca * Math.sin(b); v[3 * i + 2] = Math.sin(a);
        sx += v[3 * i]; sy += v[3 * i + 1]; sz += v[3 * i + 2];
      }
      const m = Math.hypot(sx, sy, sz) || 1, c = [sx / m, sy / m, sz / m];
      let minDot = 1;
      for (let i = 0; i < n; i++) minDot = Math.min(minDot, c[0] * v[3 * i] + c[1] * v[3 * i + 1] + c[2] * v[3 * i + 2]);
      rings.push({ v, n, c, cap: Math.acos(Math.max(-1, Math.min(1, minDot))) });
    }
    return rings;
  }
  let LAND110 = null, LAND50 = null, loading50 = false;
  function land(zoom, onLoaded) {
    if (!LAND110) LAND110 = prepRings(root.WORLD_LAND, 10);
    if (zoom < HI_RES_FROM) return LAND110;
    if (LAND50) return LAND50;
    if (root.WORLD_LAND_50) { LAND50 = prepRings(root.WORLD_LAND_50, 100); return LAND50; }
    if (!loading50 && typeof document !== "undefined") {
      loading50 = true;
      const s = document.createElement("script");
      s.src = "world50.js";
      s.onload = () => { LAND50 = prepRings(root.WORLD_LAND_50, 100); onLoaded && onLoaded(); };
      s.onerror = () => { loading50 = false; };
      document.head.appendChild(s);
    }
    return LAND110;
  }

  function hexRgb(c) {
    c = String(c).trim();
    let m = /^#([0-9a-f]{6})$/i.exec(c);
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4), 16)];
    m = /^#([0-9a-f]{3})$/i.exec(c);
    if (m) return m[1].split("").map((h) => parseInt(h + h, 16));
    m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) return m[1].split(",").slice(0, 3).map((v) => +v);
    return [128, 128, 128];
  }

  function subsolar(t) {
    const { dec, eot } = S.sunPosition(t);
    const minutes = (((t % S.DAY) + S.DAY) % S.DAY) / S.MIN;
    let lon = (720 - minutes - eot) / 4;
    lon = ((lon + 540) % 360) - 180;
    return { lat: dec * R2D, lon };
  }

  // Points where a prayer starts at time t (observer at altFt), within a latitude band.
  function prayerLine(name, t, conv, altFt, latMin = -89.5, latMax = 89.5, step = 0.5) {
    // Isha as a fixed interval after sunset: where Maghrib was ishaMin minutes ago
    if (name === "Isha" && conv.ishaMin > 0) return prayerLine("Maghrib", t - conv.ishaMin * S.MIN, Object.assign({}, conv, { ishaMin: 0 }), altFt, latMin, latMax, step);
    const ih = ((conv.ihtiyat || S.DEFAULT_IHTIYAT)[name] || 0) * S.MIN;
    const ss = subsolar(t - ih);
    const dec = ss.lat * D2R, dip = S.dipDeg(altFt), twDip = conv.dipOnTwilight ? dip : 0;
    latMin = Math.max(-89.5, latMin); latMax = Math.min(89.5, latMax);
    if (name === "Zuhr") {
      const seg = [];
      for (let lat = latMin; lat <= latMax + 1e-9; lat += step) seg.push([lat, ss.lon]);
      return [seg];
    }
    const morning = name === "Fajr" || name === "Sunrise";
    const segs = []; let seg = [];
    for (let lat = latMin; lat <= latMax + 1e-9; lat += step) {
      const phi = lat * D2R;
      let alt;
      if (name === "Asr") alt = Math.atan(1 / (conv.asr + Math.tan(Math.abs(phi - dec))));
      else alt = -({ Fajr: conv.fajr + twDip, Sunrise: 0.833 + dip, Maghrib: 0.833 + dip, Isha: conv.isha + twDip }[name]) * D2R;
      const c = (Math.sin(alt) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
      if (c < -1 || c > 1) { if (seg.length > 1) segs.push(seg); seg = []; continue; }
      const H = Math.acos(c) * R2D;
      seg.push([lat, ss.lon + (morning ? -H : H)]);
    }
    if (seg.length > 1) segs.push(seg);
    return segs;
  }

  function create(canvas, opts = {}) {
    const g = canvas.getContext("2d");
    const view = { lat: 20, lon: 60, zoom: 1, follow: true };
    const over = document.createElement("canvas");
    const og = over.getContext("2d");
    let last = null, raf = 0;
    const redraw = () => { if (!last) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => draw(last)); };
    const changed = () => opts.onViewChange && opts.onViewChange({ ...view });

    function setZoom(z) { view.zoom = Math.max(ZMIN, Math.min(ZMAX, z)); changed(); redraw(); }
    function unfollow() { if (view.follow) { view.follow = false; opts.onFollowChange && opts.onFollowChange(false); } }

    // ---- pointer: drag to rotate, two fingers to pinch-zoom ----
    const ptrs = new Map();
    let gest = null;
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const p = [...ptrs.values()];
      gest = p.length >= 2
        ? { pinch: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), zoom: view.zoom }
        : { x: e.clientX, y: e.clientY, lat: view.lat, lon: view.lon };
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!ptrs.has(e.pointerId) || !gest) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const p = [...ptrs.values()];
      if (p.length >= 2 && gest.pinch) {
        setZoom(gest.zoom * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / gest.pinch);
        return;
      }
      if (gest.pinch) return;
      const r = (canvas.clientWidth / 2.1) * view.zoom;          // CSS px per radian
      const dx = e.clientX - gest.x, dy = e.clientY - gest.y;
      if (Math.abs(dx) + Math.abs(dy) < 3) return;
      unfollow();
      view.lat = Math.max(-85, Math.min(85, gest.lat + dy / r * R2D));
      view.lon = gest.lon - dx / r * R2D / Math.max(0.2, Math.cos(view.lat * D2R));
      redraw();
    });
    const up = (e) => { ptrs.delete(e.pointerId); gest = null; };
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(view.zoom * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    canvas.addEventListener("dblclick", (e) => { e.preventDefault(); setZoom(view.zoom * 2); });

    function size() {
      const css = canvas.clientWidth || 400;
      const dpr = Math.min(root.devicePixelRatio || 1, 3);
      const px = Math.round(Math.min(css * dpr, 2000));
      if (canvas.width !== px || canvas.height !== px) canvas.width = canvas.height = px;
      return px;
    }

    function draw(p) {
      last = p;
      const { route, t, conv, events, colors } = p;
      const N = size(), cx = N / 2, cy = N / 2;
      const R = (N / 2 - Math.max(6, N * 0.03)) * view.zoom;
      const lw = N / 450;                                        // constant on-screen sizes
      const here = route.state(t);
      if (view.follow) { view.lat = Math.max(-75, Math.min(75, here.lat)); view.lon = here.lon; }

      const C = vec(view.lat, view.lon);
      const l0 = view.lon * D2R, f0 = view.lat * D2R;
      const E = [-Math.sin(l0), Math.cos(l0), 0];
      const Nn = [-Math.sin(f0) * Math.cos(l0), -Math.sin(f0) * Math.sin(l0), Math.cos(f0)];
      // angular radius of what is on screen
      const va = Math.min(Math.PI / 2, Math.asin(Math.min(1, (N * 0.75) / R)) + 0.02);
      const vaDeg = va * R2D;
      const latLo = view.lat - vaDeg, latHi = view.lat + vaDeg;
      const lonSpan = vaDeg >= 89 || Math.abs(view.lat) + vaDeg >= 89 ? 180 : vaDeg / Math.cos((Math.abs(view.lat) + vaDeg) * D2R);

      // Clip a land ring to the visible hemisphere. A stretch that runs behind the globe is
      // replaced by the matching arc of the rim, swept the way the hidden coast actually goes,
      // so the fill never cuts a chord across the sea.
      function clipRing(v, n){
        const P = new Float64Array(n * 3);
        let start = -1;
        for (let i = 0; i < n; i++) {
          const x = v[3 * i], y = v[3 * i + 1], z = v[3 * i + 2];
          P[3 * i] = x * E[0] + y * E[1] + z * E[2]; P[3 * i + 1] = x * Nn[0] + y * Nn[1] + z * Nn[2]; P[3 * i + 2] = x * C[0] + y * C[1] + z * C[2];
          if (start < 0 && P[3 * i + 2] >= 0) start = i;
        }
        if (start < 0) return;                                   // wholly behind the globe
        const ang = (X, Y) => Math.atan2(-Y, X);                 // screen angle of a rim point
        const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
        const cross = (a, b) => {                                // where edge a->b meets the horizon (Z = 0)
          const za = P[3 * a + 2], zb = P[3 * b + 2], t = za / (za - zb);
          const X = P[3 * a] + t * (P[3 * b] - P[3 * a]), Y = P[3 * a + 1] + t * (P[3 * b + 1] - P[3 * a + 1]), m = Math.hypot(X, Y) || 1;
          return [X / m, Y / m];
        };
        g.moveTo(cx + P[3 * start] * R, cy - P[3 * start + 1] * R);
        let hidden = false, a0 = 0, last = 0, sweep = 0;
        for (let k = 1; k <= n; k++) {
          const i = (start + k) % n, p = (start + k - 1) % n, Z = P[3 * i + 2];
          if (!hidden && Z < 0) {                                // leaving the visible side
            const [X, Y] = cross(p, i);
            g.lineTo(cx + X * R, cy - Y * R);
            hidden = true; a0 = last = ang(X, Y); sweep = 0;
          }
          if (hidden) {
            let X, Y;
            if (Z >= 0) [X, Y] = cross(p, i); else { X = P[3 * i]; Y = P[3 * i + 1]; }
            const a = ang(X, Y); sweep += wrap(a - last); last = a;
            if (Z >= 0) {                                        // back on the visible side
              g.arc(cx, cy, R, a0, a0 + sweep, sweep < 0);
              hidden = false;
            }
          }
          if (!hidden) g.lineTo(cx + P[3 * i] * R, cy - P[3 * i + 1] * R);
        }
        g.closePath();
      }

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, N, N);
      g.save();
      g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.clip();
      g.fillStyle = colors.ocean; g.fillRect(0, 0, N, N);

      // ---- land (vector) ----
      const rings = land(view.zoom, redraw);
      g.beginPath();
      for (const ring of rings) {
        // cull rings entirely off screen
        const ang = Math.acos(Math.max(-1, Math.min(1, dot(ring.c, C))));
        if (ang - ring.cap > va) continue;
        clipRing(ring.v, ring.n);
      }
      g.fillStyle = colors.land; g.fill("evenodd");
      g.strokeStyle = colors.coast; g.lineWidth = Math.max(0.6, 0.7 * lw); g.stroke();

      // ---- night / twilight overlay (smooth, rendered small and scaled up) ----
      const M = Math.min(N, 480);
      if (over.width !== M) { over.width = over.height = M; }
      const img = og.createImageData(M, M), d = img.data;
      const ss = subsolar(t), SV = vec(ss.lat, ss.lon), nc = hexRgb(colors.night);
      const sDay = Math.sin(-0.833 * D2R), sNight = Math.sin(-18 * D2R), k = N / M;
      for (let y = 0; y < M; y++) {
        const Y = (cy - (y + 0.5) * k) / R;
        for (let x = 0; x < M; x++) {
          const X = ((x + 0.5) * k - cx) / R, rr = X * X + Y * Y, o = (y * M + x) * 4;
          if (rr > 1) { d[o + 3] = 0; continue; }
          const Z = Math.sqrt(1 - rr);
          const s = (Z * C[0] + X * E[0] + Y * Nn[0]) * SV[0] + (Z * C[1] + X * E[1] + Y * Nn[1]) * SV[1] + (Z * C[2] + X * E[2] + Y * Nn[2]) * SV[2];
          let n = (sDay - s) / (sDay - sNight); n = n < 0 ? 0 : n > 1 ? 1 : n; n = n * n * (3 - 2 * n);
          d[o] = nc[0]; d[o + 1] = nc[1]; d[o + 2] = nc[2]; d[o + 3] = Math.round(n * 205);
        }
      }
      og.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
      g.drawImage(over, 0, 0, N, N);
      g.restore();

      // ---- vector helpers ----
      const proj = (lat, lon) => { const P = vec(lat, lon); return { x: cx + dot(P, E) * R, y: cy - dot(P, Nn) * R, z: dot(P, C) }; };
      const onScreen = (q, m = 40 * lw) => q.z > 0.02 && q.x > -m && q.y > -m && q.x < N + m && q.y < N + m;
      function polyline(pts, style) {
        const { dash, ...rest } = style;
        g.save(); Object.assign(g, rest); if (dash) g.setLineDash(dash); g.beginPath();
        let pen = false;
        for (const [lat, lon] of pts) {
          const q = proj(lat, lon);
          if (q.z < 0.01) { pen = false; continue; }
          if (pen) g.lineTo(q.x, q.y); else { g.moveTo(q.x, q.y); pen = true; }
        }
        g.stroke(); g.restore();
      }
      const queue = [];
      const label = (text, x, y, color, o = {}) => queue.push({ text, x, y, color, o, pri: o.pri || 0 });
      function drawLabel(L, y) {
        g.save();
        g.font = `${L.o.weight || 600} ${Math.round((L.o.size || 11) * lw)}px system-ui, -apple-system, sans-serif`;
        g.textAlign = L.o.align || "left"; g.textBaseline = "middle";
        g.lineWidth = 3 * lw; g.strokeStyle = colors.halo; g.lineJoin = "round";
        g.strokeText(L.text, L.x, y); g.fillStyle = L.color; g.fillText(L.text, L.x, y);
        g.restore();
      }
      function flushLabels(reserved) {
        const boxes = reserved.slice();
        queue.sort((a, b) => b.pri - a.pri);
        for (const L of queue) {
          g.save();
          g.font = `${L.o.weight || 600} ${Math.round((L.o.size || 11) * lw)}px system-ui, -apple-system, sans-serif`;
          const w = g.measureText(L.text).width, h = (L.o.size || 11) * lw * 1.25;
          g.restore();
          const x0 = (L.o.align === "right") ? L.x - w : L.x;
          const tries = L.o.fixed ? 1 : 8;
          for (let k2 = 0, y = L.y; k2 < tries; k2++, y = L.y + (k2 % 2 ? 1 : -1) * h * Math.ceil(k2 / 2)) {
            const box = [x0 - 2, y - h / 2, x0 + w + 2, y + h / 2];
            if (!boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) { boxes.push(box); drawLabel(L, y); break; }
          }
        }
      }

      // ---- graticule (density follows zoom) ----
      const step = view.zoom < 2 ? 30 : view.zoom < 5 ? 10 : view.zoom < 15 ? 5 : view.zoom < 40 ? 2 : 1;
      const ds = Math.max(0.1, Math.min(3, step / 10));
      const grat = { strokeStyle: colors.grid, lineWidth: 0.8 * lw };
      const gLat0 = Math.max(-90, Math.floor(latLo / step) * step), gLat1 = Math.min(90, Math.ceil(latHi / step) * step);
      const gLon0 = lonSpan >= 180 ? -180 : Math.floor((view.lon - lonSpan) / step) * step;
      const gLon1 = lonSpan >= 180 ? 180 : Math.ceil((view.lon + lonSpan) / step) * step;
      for (let lon = gLon0; lon < gLon1 + 1e-9; lon += step) { const pts = []; for (let lat = gLat0; lat <= gLat1; lat += ds) pts.push([lat, lon]); polyline(pts, grat); }
      for (let lat = Math.ceil(gLat0 / step) * step; lat <= gLat1; lat += step) {
        if (Math.abs(lat) >= 90) continue;
        const pts = []; for (let lon = gLon0; lon <= gLon1; lon += ds) pts.push([lat, lon]);
        polyline(pts, lat === 0 ? { ...grat, lineWidth: 1.4 * lw } : grat);
      }
      // grid labels when zoomed in
      if (view.zoom >= 2) {
        const lbl = (v, pos, neg) => `${Math.abs(v)}°${v === 0 ? "" : v > 0 ? pos : neg}`;
        for (let lat = Math.ceil(gLat0 / step) * step; lat <= gLat1; lat += step) {
          const q = proj(lat, view.lon); if (onScreen(q, 0)) label(lbl(lat, "N", "S"), 6 * lw, q.y - 7 * lw, colors.muted, { size: 9, weight: 500, pri: -3 });
        }
        for (let lon = gLon0; lon <= gLon1; lon += step) {
          const q = proj(view.lat, lon); const ln = ((lon + 540) % 360) - 180;
          if (onScreen(q, 0)) label(lbl(ln, "E", "W"), q.x + 3 * lw, N - 30 * lw, colors.muted, { size: 9, weight: 500, pri: -3 });
        }
      }

      // ---- prayer lines at time t (for the aircraft's current altitude) ----
      const lstep = view.zoom > 20 ? 0.02 : view.zoom > 8 ? 0.05 : view.zoom > 3 ? 0.2 : 0.5;
      const ap = proj(here.lat, here.lon);
      for (const L of LINES) {
        if (p.hidden && p.hidden[L.name]) continue;
        const segs = prayerLine(L.name, t, conv, here.alt, latLo - 1, latHi + 1, lstep);
        for (const seg of segs) {
          polyline(seg, { strokeStyle: colors.halo, lineWidth: 4.5 * lw, globalAlpha: 0.55, lineCap: "round" });
          polyline(seg, { strokeStyle: L.color, lineWidth: 2.2 * lw, lineCap: "round" });
        }
        let best = null;
        for (const seg of segs) for (const [la, lo] of seg) {
          const q = proj(la, lo); if (!onScreen(q, -20 * lw) || q.z < 0.2) continue;
          const dd = (q.x - ap.x) ** 2 + (q.y - ap.y) ** 2;
          if (dd < (48 * lw) ** 2) continue;
          if (!best || dd < best.dd) best = { ...q, dd };
        }
        if (best) label(L.name, best.x + 6 * lw, best.y, L.color, { size: 12, weight: 700, pri: 1 });
      }

      // ---- sun and moon over their sub-points (edge marker when out of view) ----
      const mp = S.moonPosition(t);
      const flat = (V) => ({ X: dot(V, E), Y: dot(V, Nn), Z: dot(V, C) });
      const sS = flat(SV), mS = flat(vec(mp.sublat, mp.sublon));
      function place(B) {
        const x = cx + B.X * R, y = cy - B.Y * R, m = 22 * lw;
        if (B.Z > 0 && x > m && y > m && x < N - m && y < N - m) return { x, y, edge: false };
        // off the visible disc: pin to the canvas edge in the body's direction
        let dx = B.X, dy = -B.Y; const h = Math.hypot(dx, dy);
        if (h < 1e-6) { dx = 0; dy = -1; } else { dx /= h; dy /= h; }
        const sx = dx ? (N / 2 - m) / Math.abs(dx) : Infinity, sy = dy ? (N / 2 - m) / Math.abs(dy) : Infinity;
        const s2 = Math.min(sx, sy, B.Z > 0 ? Math.hypot(x - cx, y - cy) : Infinity);
        return { x: cx + dx * s2, y: cy + dy * s2, edge: true };
      }
      const bodies = [];
      if (!(p.hidden && p.hidden.Sun)) {
        const q = place(sS), r = 9 * lw;
        g.save(); g.globalAlpha = q.edge ? 0.7 : 1; g.translate(q.x, q.y);
        g.strokeStyle = "#f59e0b"; g.lineWidth = 2 * lw; g.lineCap = "round";
        for (let k2 = 0; k2 < 8; k2++) { const a2 = k2 * Math.PI / 4; g.beginPath(); g.moveTo(Math.cos(a2) * r * 1.35, Math.sin(a2) * r * 1.35); g.lineTo(Math.cos(a2) * r * 1.85, Math.sin(a2) * r * 1.85); g.stroke(); }
        g.beginPath(); g.arc(0, 0, r, 0, 2 * Math.PI); g.fillStyle = "#fbbf24"; g.fill();
        g.lineWidth = 1.5 * lw; g.strokeStyle = colors.halo; g.stroke(); g.restore();
        bodies.push([q.x - r * 1.9, q.y - r * 1.9, q.x + r * 1.9, q.y + r * 1.9]);
        side(q.edge ? "Sun " + arrow(q) : "Sun", q, 20 * lw, "#d97706");
      }
      if (!(p.hidden && p.hidden.Moon)) {
        const q = place(mS), r = 13 * lw;
        // lit limb faces the sun, seen along the globe surface
        const MV = vec(mp.sublat, mp.sublon), sm = dot(SV, MV);
        const Tg = [SV[0] - sm * MV[0], SV[1] - sm * MV[1], SV[2] - sm * MV[2]];   // great-circle direction moon -> sun
        const tx = dot(Tg, E), ty = dot(Tg, Nn);
        const ang = Math.hypot(tx, ty) < 1e-9 ? 0 : Math.atan2(-ty, tx);
        g.save(); g.globalAlpha = q.edge ? 0.75 : 1; g.translate(q.x, q.y); g.rotate(ang);
        g.beginPath(); g.arc(0, 0, r, 0, 2 * Math.PI); g.fillStyle = "#3b4252"; g.fill();
        // lit part: sun-side half disc plus/minus the terminator ellipse
        const kx = r * Math.abs(2 * mp.illum - 1);
        g.beginPath(); g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
        if (mp.illum >= 0.5) g.ellipse(0, 0, kx, r, 0, Math.PI / 2, -Math.PI / 2, false);   // gibbous: bulge into dark half
        else g.ellipse(0, 0, kx, r, 0, Math.PI / 2, -Math.PI / 2, true);                     // crescent: cut back
        g.closePath(); g.fillStyle = "#f1f5f9"; g.fill();
        g.beginPath(); g.arc(0, 0, r + 0.75 * lw, 0, 2 * Math.PI); g.lineWidth = 1.5 * lw; g.strokeStyle = colors.halo; g.stroke();
        g.beginPath(); g.arc(0, 0, r, 0, 2 * Math.PI); g.lineWidth = 0.8 * lw; g.strokeStyle = "#94a3b8"; g.stroke();
        g.restore();
        bodies.push([q.x - r - 3 * lw, q.y - r - 3 * lw, q.x + r + 3 * lw, q.y + r + 3 * lw]);
        side(`Moon ${Math.round(mp.illum * 100)}%${q.edge ? " " + arrow(q) : ""}`, q, 18 * lw, colors.ink);
      }
      function side(text, q, off, col) {     // label on the side facing the centre
        const right = q.x < N * 0.7;
        label(text, q.x + (right ? off : -off), q.y, col, { size: 11, weight: 700, pri: 1.2, align: right ? "left" : "right" });
      }
      function arrow(q) {
        const a3 = Math.atan2(q.y - cy, q.x - cx), k3 = Math.round(((a3 * R2D + 360 + 22.5) % 360) / 45) % 8;
        return ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"][k3];
      }

      // ---- Kaaba ----
      const kb = proj(S.KAABA.lat, S.KAABA.lon);
      if (kb.z > 0) {
        g.save(); g.fillStyle = colors.ink; g.strokeStyle = colors.halo; g.lineWidth = 2 * lw;
        const kk = 5 * lw; g.beginPath(); g.rect(kb.x - kk, kb.y - kk, 2 * kk, 2 * kk); g.stroke(); g.fill(); g.restore();
        label("Makkah", kb.x + 8 * lw, kb.y, colors.ink, { size: 10, weight: 600, pri: 0 });
      }

      // ---- route: exact great-circle legs through every fix ----
      const segNm = Math.max(1, 40 / view.zoom);
      const flown = [], toFly = [];
      const W = route.wps;
      for (let i = 0; i + 1 < W.length; i++) {
        const a = W[i], b = W[i + 1], legNm = S.gcNm(a, b), n = Math.max(1, Math.ceil(legNm / segNm));
        for (let j = (i === 0 ? 0 : 1); j <= n; j++) {
          const f = j / n, q = S.gcInterp(a, b, f), tt = a.eto + (b.eto - a.eto) * f;
          (tt <= t ? flown : toFly).push([q.lat, q.lon]);
        }
      }
      flown.push([here.lat, here.lon]); toFly.unshift([here.lat, here.lon]);
      polyline(toFly, { strokeStyle: colors.halo, lineWidth: 4 * lw, globalAlpha: 0.6 });
      polyline(toFly, { strokeStyle: colors.route, lineWidth: 2.2 * lw, dash: [7 * lw, 5 * lw] });
      polyline(flown, { strokeStyle: colors.halo, lineWidth: 5 * lw, globalAlpha: 0.6 });
      polyline(flown, { strokeStyle: colors.accent, lineWidth: 3.2 * lw });

      // ---- waypoints: all labelled once zoomed in ----
      const every = view.zoom >= 3 ? 1 : Math.max(1, Math.ceil(W.length / 12));
      W.forEach((w, i) => {
        const q = proj(w.lat, w.lon); if (!onScreen(q)) return;
        const ends = i === 0 || i === W.length - 1;
        g.save(); g.fillStyle = colors.halo; g.strokeStyle = colors.ink; g.lineWidth = 1.5 * lw;
        g.beginPath(); g.arc(q.x, q.y, (ends ? 4.5 : W.length > 20 && view.zoom < 3 ? 2.2 : 3.4) * lw, 0, 2 * Math.PI); g.fill(); g.stroke(); g.restore();
        if (ends || i % every === 0) {
          label(w.name, q.x + 7 * lw, q.y - 9 * lw, colors.ink, { size: ends ? 11 : 10, weight: ends || view.zoom >= 3 ? 700 : 600, pri: ends ? 2 : view.zoom >= 3 ? 1.5 : -1 });
          if (view.zoom >= 6) {
            const d = new Date(w.eto);
            label(String(d.getUTCHours()).padStart(2, "0") + String(d.getUTCMinutes()).padStart(2, "0") + "Z", q.x + 7 * lw, q.y + 4 * lw, colors.muted, { size: 9, weight: 500, pri: 0.5, fixed: true });
          }
        }
      });

      // ---- prayer events on the route ----
      for (const e of events || []) {
        const q = proj(e.lat, e.lon); if (!onScreen(q)) continue;
        const col = (LINES.find((L) => L.name === e.name) || {}).color || colors.ink;
        const passed = e.t <= t;
        g.save(); g.fillStyle = passed ? col : colors.halo; g.strokeStyle = col; g.lineWidth = 2.5 * lw;
        g.beginPath(); g.arc(q.x, q.y, 5.5 * lw, 0, 2 * Math.PI); g.fill(); g.stroke(); g.restore();
        label(`${e.name} ${p.fmtTime(e.t, e.name)}`, q.x - 9 * lw, q.y + 12 * lw, col, { size: 11, weight: 700, align: "right", pri: 3 });
        if (view.zoom >= 2.5) label(S.fixRef(e), q.x - 9 * lw, q.y + 25 * lw, col, { size: 10, weight: 600, align: "right", pri: 2.5 });
      }

      // ---- aircraft, nose along the track ----
      const a = proj(here.lat, here.lon);
      if (a.z > 0) {
        const ahead = S.gcInterp(here, { lat: here.lat + Math.cos(here.track * D2R), lon: here.lon + Math.sin(here.track * D2R) / Math.max(0.2, Math.cos(here.lat * D2R)) }, 0.05);
        const b = proj(ahead.lat, ahead.lon);
        const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
        g.save(); g.translate(a.x, a.y); g.rotate(ang); g.scale(lw * 1.05, lw * 1.05);
        g.beginPath();
        g.moveTo(0, -13); g.lineTo(2.2, -6); g.lineTo(12, 1); g.lineTo(12, 4); g.lineTo(2.2, 1); g.lineTo(1.6, 8);
        g.lineTo(5, 11); g.lineTo(5, 13); g.lineTo(0, 11.5); g.lineTo(-5, 13); g.lineTo(-5, 11); g.lineTo(-1.6, 8);
        g.lineTo(-2.2, 1); g.lineTo(-12, 4); g.lineTo(-12, 1); g.lineTo(-2.2, -6); g.closePath();
        g.lineWidth = 3; g.strokeStyle = colors.halo; g.stroke(); g.fillStyle = colors.ink; g.fill();
        g.restore();
      }
      flushLabels((a.z > 0 ? [[a.x - 16 * lw, a.y - 16 * lw, a.x + 16 * lw, a.y + 16 * lw]] : []).concat(bodies));

      // ---- rim + scale bar ----
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.strokeStyle = colors.grid; g.lineWidth = 1.5 * lw; g.stroke(); g.restore();
      const nmPerPx = (180 * 60 / Math.PI) / R;
      const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
      const L = nice.find((v) => v / nmPerPx >= 70 * lw) || 2000, px = L / nmPerPx;
      const bx = 12 * lw, by = N - 12 * lw;
      g.save(); g.strokeStyle = colors.halo; g.lineWidth = 5 * lw; g.lineCap = "round";
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + px, by); g.stroke();
      g.strokeStyle = colors.ink; g.lineWidth = 2 * lw; g.beginPath();
      g.moveTo(bx, by - 4 * lw); g.lineTo(bx, by); g.lineTo(bx + px, by); g.lineTo(bx + px, by - 4 * lw); g.stroke(); g.restore();
      drawLabel({ text: `${L} nm`, x: bx + px + 6 * lw, color: colors.ink, o: { size: 10, weight: 600 } }, by - 2 * lw);
    }

    return {
      draw(p) { last = p; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => draw(p)); },
      setFollow(v) { view.follow = !!v; redraw(); },
      zoomBy(f) { setZoom(view.zoom * f); },
      setZoom,
      reset() { view.zoom = 1; view.follow = true; opts.onFollowChange && opts.onFollowChange(true); changed(); redraw(); },
      get view() { return { ...view }; },
    };
  }

  root.SolatGlobe = { create, LINES, subsolar, prayerLine };
})(typeof window !== "undefined" ? window : globalThis);
