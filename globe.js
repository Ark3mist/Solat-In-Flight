/* Solat In Flight — globe view. Orthographic projection on a <canvas>, no
 * dependencies, works offline. Needs solat.js and world.js loaded first.
 *
 * Draws: land, day/twilight/night shading from the sun's true position,
 * prayer lines (where each prayer is starting at the chosen instant), the
 * route (flown / to fly), waypoints, prayer events on the route, the Kaaba,
 * and the aircraft. Drag to rotate. */
(function (root) {
  "use strict";
  const S = root.Solat;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  // Prayer lines: colour + how to find the line at time t.
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

  // ---- land mask (equirectangular bitmap, built once) ----------------------
  const MW = 1440, MH = 720;          // 0.25 deg per pixel
  let LAND = null;
  function landMask() {
    if (LAND) return LAND;
    const cv = document.createElement("canvas"); cv.width = MW; cv.height = MH;
    const g = cv.getContext("2d");
    g.fillStyle = "#000"; g.beginPath();
    for (const d of root.WORLD_LAND || []) {
      let lon = 0, lat = 0;
      for (let i = 0; i < d.length; i += 2) {
        lon += d[i]; lat += d[i + 1];
        const x = (lon / 10 + 180) * (MW / 360), y = (90 - lat / 10) * (MH / 180);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
    }
    g.fill("nonzero");
    const px = g.getImageData(0, 0, MW, MH).data;
    LAND = new Uint8Array(MW * MH);
    for (let i = 0; i < LAND.length; i++) LAND[i] = px[i * 4 + 3] > 127 ? 1 : 0;
    return LAND;
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

  // Sub-solar point at t.
  function subsolar(t) {
    const { dec, eot } = S.sunPosition(t);
    const minutes = (((t % S.DAY) + S.DAY) % S.DAY) / S.MIN;
    let lon = (720 - minutes - eot) / 4;
    lon = ((lon + 540) % 360) - 180;
    return { lat: dec * R2D, lon };
  }

  // Points (lat, lon) where a prayer starts at time t, for an observer at altFt.
  function prayerLine(name, t, conv, altFt) {
    const ih = ((conv.ihtiyat || S.DEFAULT_IHTIYAT)[name] || 0) * S.MIN;
    const ss = subsolar(t - ih);          // event raw time = t - ihtiyat
    const dec = ss.lat * D2R;
    const dip = S.dipDeg(altFt);
    const twDip = conv.dipOnTwilight ? dip : 0;
    if (name === "Zuhr") {
      const seg = [];
      for (let lat = -89; lat <= 89; lat += 1) seg.push([lat, ss.lon]);
      return [seg];
    }
    const morning = name === "Fajr" || name === "Sunrise";
    const segs = []; let seg = [];
    for (let lat = -89.5; lat <= 89.5; lat += 0.5) {
      const phi = lat * D2R;
      let alt;
      if (name === "Asr") {
        const zen = Math.abs(phi - dec);
        alt = Math.atan(1 / (conv.asr + Math.tan(zen)));
      } else {
        alt = -({ Fajr: conv.fajr + twDip, Sunrise: 0.833 + dip, Maghrib: 0.833 + dip, Isha: conv.isha + twDip }[name]) * D2R;
      }
      const c = (Math.sin(alt) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
      if (c < -1 || c > 1) { if (seg.length > 1) segs.push(seg); seg = []; continue; }
      const H = Math.acos(c) * R2D;
      seg.push([lat, ss.lon + (morning ? -H : H)]);
    }
    if (seg.length > 1) segs.push(seg);
    return segs;
  }

  function create(canvas, opts) {
    const g = canvas.getContext("2d");
    const view = { lat: 20, lon: 60, follow: true };
    let last = null, img = null;

    // drag to rotate
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, lat: view.lat, lon: view.lon }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const r = canvas.clientWidth / 2.2;
      view.lon = drag.lon - (e.clientX - drag.x) / r * R2D;
      view.lat = Math.max(-85, Math.min(85, drag.lat + (e.clientY - drag.y) / r * R2D));
      if (view.follow) { view.follow = false; opts && opts.onFollowChange && opts.onFollowChange(false); }
      if (last) draw(last);
    });
    const end = () => { drag = null; };
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);

    function size() {
      const css = canvas.clientWidth || 400;
      const dpr = Math.min(root.devicePixelRatio || 1, 2);
      const px = Math.round(Math.min(css * dpr, 900));
      if (canvas.width !== px || canvas.height !== px) { canvas.width = canvas.height = px; img = null; }
      return px;
    }

    function draw(p) {
      last = p;
      const { route, t, conv, events, colors } = p;
      const N = size(), cx = N / 2, cy = N / 2, R = N / 2 - Math.max(6, N * 0.03);
      const here = route.state(t);
      if (view.follow) { view.lat = Math.max(-60, Math.min(60, here.lat)); view.lon = here.lon; }

      // frame at view centre
      const C = vec(view.lat, view.lon);
      const l0 = view.lon * D2R, f0 = view.lat * D2R;
      const E = [-Math.sin(l0), Math.cos(l0), 0];
      const Nn = [-Math.sin(f0) * Math.cos(l0), -Math.sin(f0) * Math.sin(l0), Math.cos(f0)];
      const ss = subsolar(t), SV = vec(ss.lat, ss.lon);

      // ---- raster pass: land/ocean + day/night ----
      const mask = landMask();
      if (!img) img = g.createImageData(N, N);
      const d = img.data;
      const cOcean = hexRgb(colors.ocean), cLand = hexRgb(colors.land);
      const cNightO = hexRgb(colors.nightOcean), cNightL = hexRgb(colors.nightLand), bg = hexRgb(colors.bg);
      const sDay = Math.sin(-0.833 * D2R), sNight = Math.sin(-18 * D2R);
      for (let y = 0; y < N; y++) {
        const Y = (cy - y - 0.5) / R;
        for (let x = 0; x < N; x++) {
          const X = (x + 0.5 - cx) / R, rr = X * X + Y * Y, o = (y * N + x) * 4;
          if (rr > 1) { d[o] = bg[0]; d[o + 1] = bg[1]; d[o + 2] = bg[2]; d[o + 3] = 0; continue; }
          const Z = Math.sqrt(1 - rr);
          const px = Z * C[0] + X * E[0] + Y * Nn[0], py = Z * C[1] + X * E[1] + Y * Nn[1], pz = Z * C[2] + X * E[2] + Y * Nn[2];
          const lat = Math.asin(pz) * R2D, lon = Math.atan2(py, px) * R2D;
          let mx = Math.floor((lon + 180) * (MW / 360)); if (mx >= MW) mx = MW - 1;
          let my = Math.floor((90 - lat) * (MH / 180)); if (my >= MH) my = MH - 1;
          const land = mask[my * MW + mx];
          const s = px * SV[0] + py * SV[1] + pz * SV[2];
          let n = (sDay - s) / (sDay - sNight); n = n < 0 ? 0 : n > 1 ? 1 : n; n = n * n * (3 - 2 * n);
          const a = land ? cLand : cOcean, b = land ? cNightL : cNightO;
          const shade = 0.82 + 0.18 * Z;
          d[o] = (a[0] + (b[0] - a[0]) * n) * shade;
          d[o + 1] = (a[1] + (b[1] - a[1]) * n) * shade;
          d[o + 2] = (a[2] + (b[2] - a[2]) * n) * shade;
          d[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);

      // ---- vector helpers ----
      const proj = (lat, lon) => {
        const P = vec(lat, lon);
        return { x: cx + dot(P, E) * R, y: cy - dot(P, Nn) * R, z: dot(P, C) };
      };
      const lw = N / 450;
      function polyline(pts, style) {
        const { dash, ...rest } = style;
        g.save(); Object.assign(g, rest); if (dash) g.setLineDash(dash); g.beginPath();
        let pen = false;
        for (const [lat, lon] of pts) {
          const q = proj(lat, lon);
          if (q.z < 0.02) { pen = false; continue; }
          if (pen) g.lineTo(q.x, q.y); else { g.moveTo(q.x, q.y); pen = true; }
        }
        g.stroke(); g.restore();
      }
      // Labels are queued, then placed by priority with simple collision avoidance.
      const queue = [];
      function label(text, x, y, color, opts2 = {}) { queue.push({ text, x, y, color, opts2, pri: opts2.pri || 0 }); }
      function flushLabels(reserved) {
        const boxes = reserved.slice();
        queue.sort((a, b) => b.pri - a.pri);
        for (const L of queue) {
          g.save();
          g.font = `${L.opts2.weight || 600} ${Math.round((L.opts2.size || 11) * lw)}px system-ui, -apple-system, sans-serif`;
          const w = g.measureText(L.text).width, h = (L.opts2.size || 11) * lw * 1.25;
          const align = L.opts2.align || "left";
          let y = L.y, ok = false;
          for (let k = 0; k < 8 && !ok; k++) {
            const x0 = align === "right" ? L.x - w : L.x;
            const box = [x0 - 2, y - h / 2, x0 + w + 2, y + h / 2];
            ok = !boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
            if (ok) { boxes.push(box); drawLabel(L.text, L.x, y, L.color, L.opts2); }
            else y += (k % 2 ? -1 : 1) * h * (k + 1);
          }
          g.restore();
        }
      }
      function drawLabel(text, x, y, color, opts2 = {}) {
        g.save();
        g.font = `${opts2.weight || 600} ${Math.round((opts2.size || 11) * lw)}px system-ui, -apple-system, sans-serif`;
        g.textAlign = opts2.align || "left"; g.textBaseline = "middle";
        g.lineWidth = 3 * lw; g.strokeStyle = colors.halo; g.lineJoin = "round";
        g.strokeText(text, x, y); g.fillStyle = color; g.fillText(text, x, y);
        g.restore();
      }

      // graticule
      const grat = { strokeStyle: colors.grid, lineWidth: 0.7 * lw };
      for (let lon = -180; lon < 180; lon += 30) { const pts = []; for (let lat = -90; lat <= 90; lat += 3) pts.push([lat, lon]); polyline(pts, grat); }
      for (let lat = -60; lat <= 60; lat += 30) { const pts = []; for (let lon = -180; lon <= 180; lon += 3) pts.push([lat, lon]); polyline(pts, lat === 0 ? { ...grat, lineWidth: 1.2 * lw } : grat); }

      // prayer lines at time t (for the aircraft's current altitude)
      for (const L of LINES) {
        if (p.hidden && p.hidden[L.name]) continue;
        const segs = prayerLine(L.name, t, conv, here.alt);
        for (const seg of segs) {
          polyline(seg, { strokeStyle: colors.halo, lineWidth: 4.5 * lw, globalAlpha: 0.55, lineCap: "round" });
          polyline(seg, { strokeStyle: L.color, lineWidth: 2.2 * lw, lineCap: "round" });
        }
        // label: visible point nearest the aircraft (on screen)
        const ap = proj(here.lat, here.lon);
        let best = null;
        for (const seg of segs) for (const [la, lo] of seg) {
          const q = proj(la, lo); if (q.z < 0.25) continue;
          const dd = (q.x - ap.x) ** 2 + (q.y - ap.y) ** 2;
          if (dd < (48 * lw) ** 2) continue;            // keep clear of the aircraft
          if (!best || dd < best.dd) best = { ...q, dd };
        }
        if (best) {
          label(L.name, best.x + 6 * lw, best.y, L.color, { size: 12, weight: 700, pri: 1 });
        }
      }

      // Kaaba
      const kb = proj(S.KAABA.lat, S.KAABA.lon);
      if (kb.z > 0) {
        g.save(); g.fillStyle = colors.ink; g.strokeStyle = colors.halo; g.lineWidth = 2 * lw;
        const k = 5 * lw; g.beginPath(); g.rect(kb.x - k, kb.y - k, 2 * k, 2 * k); g.stroke(); g.fill(); g.restore();
        label("Makkah", kb.x + 8 * lw, kb.y, colors.ink, { size: 10, weight: 600, pri: 0 });
      }

      // route: flown solid, to fly dashed (sampled along the time axis)
      const n = 300, flown = [], toFly = [];
      for (let i = 0; i <= n; i++) {
        const tt = route.start + (route.end - route.start) * i / n, s = route.state(tt);
        if (tt <= t) flown.push([s.lat, s.lon]); else toFly.push([s.lat, s.lon]);
      }
      flown.push([here.lat, here.lon]); toFly.unshift([here.lat, here.lon]);
      polyline(toFly, { strokeStyle: colors.halo, lineWidth: 4 * lw, globalAlpha: 0.6 });
      polyline(toFly, { strokeStyle: colors.route, lineWidth: 2.2 * lw, dash: [7 * lw, 5 * lw] });
      polyline(flown, { strokeStyle: colors.halo, lineWidth: 5 * lw, globalAlpha: 0.6 });
      polyline(flown, { strokeStyle: colors.accent, lineWidth: 3.2 * lw });

      // waypoints
      route.wps.forEach((w, i) => {
        const q = proj(w.lat, w.lon); if (q.z < 0.05) return;
        g.save(); g.fillStyle = colors.halo; g.strokeStyle = colors.ink; g.lineWidth = 1.5 * lw;
        g.beginPath(); g.arc(q.x, q.y, (i === 0 || i === route.wps.length - 1 ? 4.5 : route.wps.length > 20 ? 2.2 : 3.2) * lw, 0, 2 * Math.PI); g.fill(); g.stroke(); g.restore();
        // long OFP routes: label ends plus ~10 evenly spaced fixes
        const ends = i === 0 || i === route.wps.length - 1;
        const every = Math.max(1, Math.ceil(route.wps.length / 12));
        if (ends || i % every === 0) label(w.name, q.x + 7 * lw, q.y - 9 * lw, colors.ink, { size: ends ? 11 : 10, weight: ends ? 700 : 600, pri: ends ? 2 : -1 });
      });

      // prayer events on the route
      for (const e of events || []) {
        const q = proj(e.lat, e.lon); if (q.z < 0.05) continue;
        const col = (LINES.find((L) => L.name === e.name) || {}).color || colors.ink;
        const passed = e.t <= t;
        g.save(); g.fillStyle = passed ? col : colors.halo; g.strokeStyle = col; g.lineWidth = 2.5 * lw;
        g.beginPath(); g.arc(q.x, q.y, 5.5 * lw, 0, 2 * Math.PI); g.fill(); g.stroke(); g.restore();
        label(`${e.name} ${p.fmtTime(e.t)}`, q.x - 9 * lw, q.y + 12 * lw, col, { size: 11, weight: 700, align: "right", pri: 3 });
      }

      // aircraft, nose along the track
      const a = proj(here.lat, here.lon);
      if (a.z > 0) {
        const ahead = S.gcInterp(here, { lat: here.lat + Math.cos(here.track * D2R), lon: here.lon + Math.sin(here.track * D2R) / Math.max(0.2, Math.cos(here.lat * D2R)) }, 0.5);
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

      flushLabels(a.z > 0 ? [[a.x - 16 * lw, a.y - 16 * lw, a.x + 16 * lw, a.y + 16 * lw]] : []);

      // rim
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.strokeStyle = colors.grid; g.lineWidth = 1.5 * lw; g.stroke(); g.restore();
    }

    return {
      draw,
      setFollow(v) { view.follow = !!v; if (last) draw(last); },
      get follow() { return view.follow; },
    };
  }

  root.SolatGlobe = { create, LINES, subsolar, prayerLine };
})(typeof window !== "undefined" ? window : globalThis);
