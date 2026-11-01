/* Solat In Flight — solver. No dependencies, works offline.
 * Port of solat_route.py. Times are epoch milliseconds (UTC). */
(function (root) {
  "use strict";
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const MIN = 60000, DAY = 86400000;

  const CONVENTIONS = {
    jakim:    { name: "JAKIM (Fajr 20°, Isha 18°)", fajr: 20, isha: 18, asr: 1 },
    workbook: { name: "Excel v3.7 (Fajr 18°, Isha 18°)", fajr: 18, isha: 18, asr: 1 },
    mwl:      { name: "MWL (Fajr 18°, Isha 17°)", fajr: 18, isha: 17, asr: 1 },
  };
  const DEFAULT_IHTIYAT = { Fajr: 0, Sunrise: 0, Zuhr: 2, Asr: 0, Maghrib: 1, Isha: 0 };

  // Airport coordinates (from the workbook STN sheet).
  const STATIONS = {
    MEL: "S3740.4 E14450.6", KUL: "N0244.6 E10141.9", LHR: "N5128.7 W00027.7",
    DXB: "N2515.2 E05521.9", BNE: "S2723.1 E15307.1", MED: "N2433.0 E03942.4",
    DPS: "S0844.9 E11510.2", CGK: "S0607.4 E10639.7", DAC: "N2350.6 E09023.9",
    MAA: "N1259.7 E08010.5", KIX: "N3426.1 E13514.0", BKK: "N1341.2 E10044.9",
    JED: "N2140.9 E03909.4", HKG: "N2218.5 E11354.9", SIN: "N0121.6 E10359.4",
    PVG: "N3108.7 E12147.6", DEL: "N2834.1 E07706.7", AKL: "S3700.5 E17447.5",
    SYD: "S3356.8 E15110.6", MNL: "N1430.6 E12100.8", TPE: "N2504.8 E12113.9",
    ADL: "S3456.7 E13831.8", PEK: "N4004.4 E11653.9", DOH: "N2516.5 E05136.5",
    BKI: "N0555.9 E11603.1", ICN: "N3727.8 E12626.4", PEN: "N0517.7 E10016.3",
    PER: "S3156.4 E11558.0", DWC: "N2455.1 E05510.5", BOM: "N1905.5 E07252.0",
    KCH: "N0129.1 E11020.7", HAN: "N2113.3 E10548.3", NRT: "N3545.9 E14023.1",
    CAN: "N2323.6 E11318.5", AMS: "N5218.5 E00445.9",
  };

  // ---- coordinates -------------------------------------------------------
  function parseLat(s) {
    let m = /^([NS])(\d{2})(\d{2}(?:\.\d+)?)$/i.exec(s);
    if (m) { const v = +m[2] + +m[3] / 60; return m[1].toUpperCase() === "S" ? -v : v; }
    if (/^[-+]?\d+(\.\d+)?$/.test(s) && Math.abs(+s) <= 90) return +s;
    return null;
  }
  function parseLon(s) {
    let m = /^([EW])(\d{3})(\d{2}(?:\.\d+)?)$/i.exec(s);
    if (m) { const v = +m[2] + +m[3] / 60; return m[1].toUpperCase() === "W" ? -v : v; }
    if (/^[-+]?\d+(\.\d+)?$/.test(s) && Math.abs(+s) <= 180) return +s;
    return null;
  }
  function fmtPos(lat, lon) {
    const dm = (v, w) => { const a = Math.abs(v); let d = Math.floor(a); let m = (a - d) * 60;
      if (m >= 59.95) { d += 1; m = 0; }
      return String(d).padStart(w, "0") + m.toFixed(1).padStart(4, "0"); };
    return (lat >= 0 ? "N" : "S") + dm(lat, 2) + " " + (lon >= 0 ? "E" : "W") + dm(lon, 3);
  }

  // ---- sun (NOAA / Meeus) --------------------------------------------------
  function sunPosition(t) {
    const jc = (t / DAY + 2440587.5 - 2451545.0) / 36525;
    const l0 = (((280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360) + 360) % 360 * D2R;
    const m = (357.52911 + jc * (35999.05029 - 0.0001537 * jc)) * D2R;
    const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
    const c = Math.sin(m) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
      + Math.sin(2 * m) * (0.019993 - 0.000101 * jc) + Math.sin(3 * m) * 0.000289;
    const omega = (125.04 - 1934.136 * jc) * D2R;
    const appLong = l0 + c * D2R - (0.00569 + 0.00478 * Math.sin(omega)) * D2R;
    const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
    const eps = (eps0 + 0.00256 * Math.cos(omega)) * D2R;
    const dec = Math.asin(Math.sin(eps) * Math.sin(appLong));
    const y = Math.tan(eps / 2) ** 2;
    const eot = 4 * R2D * (y * Math.sin(2 * l0) - 2 * e * Math.sin(m)
      + 4 * e * y * Math.sin(m) * Math.cos(2 * l0)
      - 0.5 * y * y * Math.sin(4 * l0) - 1.25 * e * e * Math.sin(2 * m));
    return { dec, eot };
  }
  function sunAltHa(t, lat, lon) {
    const { dec, eot } = sunPosition(t);
    const minutes = (((t % DAY) + DAY) % DAY) / MIN;
    let ha = (minutes + eot + 4 * lon) / 4 - 180;
    ha = ((ha + 180) % 360 + 360) % 360 - 180;
    const la = lat * D2R;
    const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha * D2R));
    return { alt: alt * R2D, ha, dec: dec * R2D };
  }
  const dipDeg = (ft) => 0.0347 * Math.sqrt(Math.max(ft, 0) * 0.3048);

  // ---- great circle -------------------------------------------------------
  function gcAngle(a, b) {
    const la1 = a.lat * D2R, la2 = b.lat * D2R, dlo = (b.lon - a.lon) * D2R;
    const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2;
    return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const gcNm = (a, b) => gcAngle(a, b) * R2D * 60;
  function gcInterp(a, b, f) {
    const d = gcAngle(a, b);
    if (d < 1e-12) return { lat: a.lat, lon: a.lon };
    const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const la1 = a.lat * D2R, lo1 = a.lon * D2R, la2 = b.lat * D2R, lo2 = b.lon * D2R;
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    return { lat: Math.atan2(z, Math.hypot(x, y)) * R2D, lon: Math.atan2(y, x) * R2D };
  }

  // ---- route --------------------------------------------------------------
  // wps: [{name, lat, lon, eto|null}], first and last must have eto.
  function makeRoute(wps, cruiseFt, climbMin = 20, descentMin = 25, groundFt = 0) {
    wps = wps.map((w) => ({ ...w }));
    const cum = [0];
    for (let i = 1; i < wps.length; i++) cum.push(cum[i - 1] + gcNm(wps[i - 1], wps[i]));
    const known = wps.map((w, i) => (w.eto != null ? i : -1)).filter((i) => i >= 0);
    if (known[0] !== 0 || known[known.length - 1] !== wps.length - 1)
      throw new Error("First and last fix need a time.");
    for (let k = 0; k + 1 < known.length; k++) {
      const i0 = known[k], i1 = known[k + 1], span = cum[i1] - cum[i0];
      for (let i = i0 + 1; i < i1; i++)
        wps[i].eto = wps[i0].eto + (wps[i1].eto - wps[i0].eto) * (span ? (cum[i] - cum[i0]) / span : 0);
    }
    const start = wps[0].eto, end = wps[wps.length - 1].eto;
    function state(t) {
      let i = 0, f = 0;
      if (t <= start) { i = 0; f = 0; }
      else if (t >= end) { i = wps.length - 2; f = 1; }
      else {
        while (i < wps.length - 2 && wps[i + 1].eto <= t) i++;
        const dt = wps[i + 1].eto - wps[i].eto;
        f = dt > 0 ? (t - wps[i].eto) / dt : 1;
      }
      const p = gcInterp(wps[i], wps[i + 1], f);
      const fromDep = (t - start) / MIN, toArr = (end - t) / MIN;
      const frac = Math.max(0, Math.min(1, climbMin ? fromDep / climbMin : 1, descentMin ? toArr / descentMin : 1));
      p.alt = groundFt + (cruiseFt - groundFt) * frac;
      p.leg = wps[i].name + "–" + wps[i + 1].name;
      return p;
    }
    return { wps, cum, start, end, state, distNm: cum[cum.length - 1] };
  }

  // ---- event solver -------------------------------------------------------
  const EVENTS = ["Fajr", "Sunrise", "Zuhr", "Asr", "Maghrib", "Isha"];
  function eventFunctions(conv, route) {
    const twDip = (h) => (conv.dipOnTwilight ? dipDeg(h) : 0);
    const altMinus = (target) => (t) => { const s = route.state(t); return sunAltHa(t, s.lat, s.lon).alt - target(s.alt); };
    const neg = (fn) => (t) => -fn(t);
    return {
      Fajr: altMinus((h) => -conv.fajr - twDip(h)),
      Sunrise: altMinus((h) => -0.833 - dipDeg(h)),
      Zuhr: (t) => { const s = route.state(t); return sunAltHa(t, s.lat, s.lon).ha; },
      Asr: (t) => {
        const s = route.state(t), p = sunAltHa(t, s.lat, s.lon);
        const zen = Math.abs(s.lat - p.dec) * D2R;
        const target = Math.atan(1 / (conv.asr + Math.tan(zen))) * R2D;
        return p.ha > 0 ? target - p.alt : -1;
      },
      Maghrib: neg(altMinus((h) => -0.833 - dipDeg(h))),
      Isha: neg(altMinus((h) => -conv.isha - twDip(h))),
    };
  }
  function findEvents(route, conv, t0 = route.start, t1 = route.end, stepMs = MIN) {
    const ihtiyat = conv.ihtiyat || DEFAULT_IHTIYAT;
    const fns = eventFunctions(conv, route), out = [];
    for (const name of EVENTS) {
      const g = fns[name];
      let tp = t0, gp = g(tp);
      for (let t = t0 + stepMs; ; t += stepMs) {
        const tc = Math.min(t, t1), gv = g(tc);
        if (gp < 0 && gv >= 0 && Math.abs(gv - gp) < 90) {
          let lo = tp, hi = tc;
          for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (g(mid) < 0) lo = mid; else hi = mid; }
          const s = route.state(hi);
          out.push({ name, t: hi + (ihtiyat[name] || 0) * MIN, lat: s.lat, lon: s.lon, alt: s.alt, leg: s.leg });
        }
        tp = tc; gp = gv;
        if (tc >= t1) break;
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }

  // Which prayer period is current at a fixed point (on the ground) at time t.
  function periodAt(lat, lon, t, conv) {
    const r = makeRoute([{ name: "", lat, lon, eto: t - 30 * 3600000 }, { name: "", lat, lon, eto: t }], 0, 0, 0);
    const ev = findEvents(r, conv);
    const last = ev[ev.length - 1];
    if (!last) return null;
    const next = { Fajr: "Sunrise", Sunrise: "Zuhr", Zuhr: "Asr", Asr: "Maghrib", Maghrib: "Isha", Isha: "Fajr" };
    return { current: last.name, since: last.t, next: next[last.name] };
  }

  // ---- route text parser --------------------------------------------------
  // One fix per line:  IDENT [LAT LON] [HHMM]      lines starting with # ignored
  //   KUL 1530              (airport from built-in list)
  //   OBMOG N1406.0 E08500.0
  //   LHR 0530
  function parseRoute(text, depDateMs) {
    const wps = [], errors = [];
    let lastT = null;
    text.split(/\r?\n/).forEach((raw, idx) => {
      const line = raw.replace(/#.*/, "").trim();
      if (!line) return;
      const tok = line.split(/[\s,]+/);
      const name = tok.shift().toUpperCase();
      let lat = null, lon = null, eto = null;
      const rest = [];
      for (const t of tok) {
        const ts = /^(\d{2})(\d{2})Z?$/i.exec(t);
        if (ts && lat !== null && lon !== null) { eto = ts; continue; }
        if (lat === null && parseLat(t) !== null && /[NS]|\./i.test(t)) { lat = parseLat(t); continue; }
        if (lat !== null && lon === null && parseLon(t) !== null) { lon = parseLon(t); continue; }
        if (ts) { eto = ts; continue; }
        rest.push(t);
      }
      if (lat === null || lon === null) {
        const st = STATIONS[name];
        if (!st) { errors.push(`Line ${idx + 1}: no position for "${name}" (add LAT LON).`); return; }
        const [a, b] = st.split(" "); lat = parseLat(a); lon = parseLon(b);
      }
      if (rest.length) errors.push(`Line ${idx + 1}: did not understand "${rest.join(" ")}".`);
      let t = null;
      if (eto) {
        const hh = +eto[1], mm = +eto[2];
        if (hh > 23 || mm > 59) { errors.push(`Line ${idx + 1}: bad time ${eto[0]}.`); }
        else {
          t = depDateMs + (hh * 60 + mm) * MIN;
          if (lastT === null && wps.length === 0) { /* first fix sets the day */ }
          while (lastT !== null && t < lastT) t += DAY;   // rolls past 0000Z
          lastT = t;
        }
      }
      wps.push({ name, lat, lon, eto: t });
    });
    if (wps.length < 2) errors.push("Need at least two fixes.");
    else {
      if (wps[0].eto == null) errors.push("First fix needs a time (HHMM UTC).");
      if (wps[wps.length - 1].eto == null) errors.push("Last fix needs a time (HHMM UTC).");
    }
    return { wps, errors };
  }

  root.Solat = { CONVENTIONS, DEFAULT_IHTIYAT, STATIONS, EVENTS, parseLat, parseLon, fmtPos,
    sunAltHa, dipDeg, gcNm, gcInterp, makeRoute, findEvents, periodAt, parseRoute };
})(typeof window !== "undefined" ? window : globalThis);
