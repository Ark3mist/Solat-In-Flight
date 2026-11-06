/* Solat In Flight — solver (v2). No dependencies, works offline.
 * All times are epoch milliseconds UTC. Angles in degrees unless noted. */
(function (root) {
  "use strict";
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const KAABA = { lat: 21.4225, lon: 39.8262 };

  const CONVENTIONS = {
    // JAKIM: fitted to the published e-Solat 2026 timetables (5 zones, 1,825 zone-days): Fajr and Isha
    // at 18° with whole-minute ihtiyat reproduce them within 1 min on ~91% of days, never more than 2 min.
    // (JAKIM's Imsak, 10 min before Fajr, falls at about 20°.)
    jakim:    { name: "JAKIM e-Solat (Fajr 18°, Isha 18°, ihtiyat)", fajr: 18, isha: 18, asr: 1,
                ihtiyat: { Fajr: 1, Sunrise: 0, Zuhr: 2, Asr: 1, Maghrib: 1, Isha: 1 } },
    workbook: { name: "Excel v3.7 (Fajr 18°, Isha 18°)", fajr: 18, isha: 18, asr: 1 },
    mwl:      { name: "MWL (Fajr 18°, Isha 17°)", fajr: 18, isha: 17, asr: 1 },
    fajr20:   { name: "Fajr 20°, Isha 18° (older setting)", fajr: 20, isha: 18, asr: 1 },
  };
  const DEFAULT_IHTIYAT = { Fajr: 0, Sunrise: 0, Zuhr: 2, Asr: 0, Maghrib: 1, Isha: 0 };

  // Airport reference points (from the workbook STN sheet).
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
    CDG: "N4900.6 E00232.9", IST: "N4116.5 E02845.1", FRA: "N5002.0 E00834.2", MCT: "N2335.6 E05817.1",
    CMB: "N0710.8 E07953.0", MLE: "N0411.5 E07331.7",
  };
  // ICAO -> IATA, and each airport's time zone (IANA; the browser applies daylight saving).
  const ICAO = { WMKK: "KUL", EGLL: "LHR", OMDB: "DXB", YMML: "MEL", YBBN: "BNE", OEMA: "MED", WADD: "DPS", WIII: "CGK",
    VGHS: "DAC", VOMM: "MAA", RJBB: "KIX", VTBS: "BKK", OEJN: "JED", VHHH: "HKG", WSSS: "SIN", ZSPD: "PVG", VIDP: "DEL",
    NZAA: "AKL", YSSY: "SYD", RPLL: "MNL", RCTP: "TPE", YPAD: "ADL", ZBAA: "PEK", OTHH: "DOH", WBKK: "BKI", RKSI: "ICN",
    WMKP: "PEN", YPPH: "PER", OMDW: "DWC", VABB: "BOM", WBGG: "KCH", VVNB: "HAN", RJAA: "NRT", ZGGG: "CAN", EHAM: "AMS",
    LFPG: "CDG", LTFM: "IST", EDDF: "FRA", OOMS: "MCT", VCBI: "CMB", VRMM: "MLE" };
  const TZ = { MEL: "Australia/Melbourne", KUL: "Asia/Kuala_Lumpur", LHR: "Europe/London", DXB: "Asia/Dubai", BNE: "Australia/Brisbane",
    MED: "Asia/Riyadh", DPS: "Asia/Makassar", CGK: "Asia/Jakarta", DAC: "Asia/Dhaka", MAA: "Asia/Kolkata", KIX: "Asia/Tokyo",
    BKK: "Asia/Bangkok", JED: "Asia/Riyadh", HKG: "Asia/Hong_Kong", SIN: "Asia/Singapore", PVG: "Asia/Shanghai", DEL: "Asia/Kolkata",
    AKL: "Pacific/Auckland", SYD: "Australia/Sydney", MNL: "Asia/Manila", TPE: "Asia/Taipei", ADL: "Australia/Adelaide",
    PEK: "Asia/Shanghai", DOH: "Asia/Qatar", BKI: "Asia/Kuching", ICN: "Asia/Seoul", PEN: "Asia/Kuala_Lumpur", PER: "Australia/Perth",
    DWC: "Asia/Dubai", BOM: "Asia/Kolkata", KCH: "Asia/Kuching", HAN: "Asia/Bangkok", NRT: "Asia/Tokyo", CAN: "Asia/Shanghai",
    AMS: "Europe/Amsterdam", CDG: "Europe/Paris", IST: "Europe/Istanbul", FRA: "Europe/Berlin", MCT: "Asia/Muscat",
    CMB: "Asia/Colombo", MLE: "Indian/Maldives" };

  // ---- coordinates ---------------------------------------------------------
  function parseLat(s) {
    s = String(s || "").trim().toUpperCase().replace(/\s+/g, "");
    let m = /^([NS])(\d{2})(\d{2}(?:\.\d+)?)$/.exec(s);
    if (m) { const v = +m[2] + +m[3] / 60; return m[1] === "S" ? -v : v; }
    m = /^([NS])?([-+]?\d+(?:\.\d+)?)$/.exec(s);
    if (m && Math.abs(+m[2]) <= 90) return m[1] === "S" ? -Math.abs(+m[2]) : +m[2];
    return null;
  }
  function parseLon(s) {
    s = String(s || "").trim().toUpperCase().replace(/\s+/g, "");
    let m = /^([EW])(\d{3})(\d{2}(?:\.\d+)?)$/.exec(s);
    if (m) { const v = +m[2] + +m[3] / 60; return m[1] === "W" ? -v : v; }
    m = /^([EW])?([-+]?\d+(?:\.\d+)?)$/.exec(s);
    if (m && Math.abs(+m[2]) <= 180) return m[1] === "W" ? -Math.abs(+m[2]) : +m[2];
    return null;
  }
  function station(code) {
    let c = String(code || "").trim().toUpperCase(); if (ICAO[c]) c = ICAO[c];
    const s = STATIONS[c];
    if (!s) return null;
    const [a, b] = s.split(" ");
    return { lat: parseLat(a), lon: parseLon(b), code: c, tz: TZ[c] || null };
  }
  function fmtLat(v) { return fmtDM(v, 2, "N", "S"); }
  function fmtLon(v) { return fmtDM(v, 3, "E", "W"); }
  function fmtDM(v, w, pos, neg) {
    const a = Math.abs(v); let d = Math.floor(a); let m = (a - d) * 60;
    if (m >= 59.95) { d += 1; m = 0; }
    return (v >= 0 ? pos : neg) + String(d).padStart(w, "0") + m.toFixed(1).padStart(4, "0");
  }
  const fmtPos = (lat, lon) => fmtLat(lat) + " " + fmtLon(lon);

  // ---- sun: NOAA / Meeus ---------------------------------------------------
  function sunPosition(t) {
    const jc = (t / DAY + 2440587.5 - 2451545.0) / 36525;
    const l0 = ((((280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360) + 360) % 360) * D2R;
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
    ha = (((ha + 180) % 360) + 360) % 360 - 180;
    const la = lat * D2R;
    const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha * D2R));
    return { alt: alt * R2D, ha, dec: dec * R2D };
  }
  // ---- moon: Meeus ch. 47, main periodic terms (about 0.1° in position) ------
  const PHASES = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  const n360 = (x) => ((x % 360) + 360) % 360;
  function moonPosition(t) {
    const jd = t / DAY + 2440587.5, T = (jd - 2451545.0) / 36525;
    const Lp = 218.3164477 + 481267.88123421 * T, D = (297.8501921 + 445267.1114034 * T) * D2R;
    const M = (357.5291092 + 35999.0502909 * T) * D2R, Mp = (134.9633964 + 477198.8675055 * T) * D2R;
    const F = (93.2720950 + 483202.0175233 * T) * D2R, s = Math.sin, c = Math.cos;
    const lam = n360(Lp + 6.288774 * s(Mp) + 1.274027 * s(2 * D - Mp) + 0.658314 * s(2 * D) + 0.213618 * s(2 * Mp)
      - 0.185116 * s(M) - 0.114332 * s(2 * F) + 0.058793 * s(2 * D - 2 * Mp) + 0.057066 * s(2 * D - M - Mp)
      + 0.053322 * s(2 * D + Mp) + 0.045758 * s(2 * D - M) - 0.040923 * s(M - Mp) - 0.034720 * s(D)
      - 0.030383 * s(M + Mp) + 0.015327 * s(2 * D - 2 * F) - 0.012528 * s(Mp + 2 * F) + 0.010980 * s(Mp - 2 * F)
      + 0.010675 * s(4 * D - Mp) + 0.010034 * s(3 * Mp) + 0.008548 * s(4 * D - 2 * Mp));
    const bet = 5.128122 * s(F) + 0.280602 * s(Mp + F) + 0.277693 * s(Mp - F) + 0.173237 * s(2 * D - F)
      + 0.055413 * s(2 * D - F + Mp) + 0.046271 * s(2 * D - F - Mp) + 0.032573 * s(2 * D + F) + 0.017198 * s(2 * Mp + F);
    const km = 385000.56 - 20905.355 * c(Mp) - 3699.111 * c(2 * D - Mp) - 2955.968 * c(2 * D) - 569.925 * c(2 * Mp);
    const eps = (23.439291 - 0.0130042 * T) * D2R, l = lam * D2R, b = bet * D2R;
    const ra = Math.atan2(s(l) * c(eps) - Math.tan(b) * s(eps), c(l));
    const dec = Math.asin(s(b) * c(eps) + c(b) * s(eps) * s(l));
    // sun's apparent longitude, for the phase
    const L0 = 280.46646 + 36000.76983 * T, Ms = (357.52911 + 35999.05029 * T) * D2R;
    const sunLon = n360(L0 + 1.914602 * s(Ms) + 0.019993 * s(2 * Ms) - 0.00569 - 0.00478 * s((125.04 - 1934.136 * T) * D2R));
    const elong = n360(lam - sunLon);                         // 0 new, 180 full
    const psi = Math.acos(c(b) * c((lam - sunLon) * D2R));    // true elongation
    const i = Math.atan2(149.6e6 * s(psi), km - 149.6e6 * c(psi));   // phase angle
    const gmst = n360(280.46061837 + 360.98564736629 * (jd - 2451545.0));
    return {
      ra: ra * R2D, dec: dec * R2D, km,
      sublat: dec * R2D, sublon: n360(ra * R2D - gmst + 180) - 180,
      illum: (1 + Math.cos(i)) / 2, waxing: elong < 180, elong,
      phase: PHASES[Math.floor(n360(elong + 22.5) / 45) % 8],
    };
  }
  // Time of the new moon before t (conjunction in ecliptic longitude), ±few minutes.
  function prevNewMoon(t) {
    let x = t - moonPosition(t).elong / 360 * 29.530589 * DAY;
    for (let k = 0; k < 5; k++) {
      const e = moonPosition(x).elong, d = e > 180 ? e - 360 : e;    // signed, degrees from conjunction
      x -= d / 12.19 * DAY;
      if (Math.abs(d) < 1e-4) break;
    }
    return x;
  }
  // Moon altitude seen from (lat, lon), with parallax (topocentric), degrees.
  function moonAlt(t, lat, lon, mp = moonPosition(t)) {
    const H = (lon - mp.sublon) * D2R, la = lat * D2R, d = mp.dec * D2R;
    const geo = Math.asin(Math.sin(la) * Math.sin(d) + Math.cos(la) * Math.cos(d) * Math.cos(H));
    const par = Math.asin(6378.14 / mp.km);
    return (geo - par * Math.cos(geo)) * R2D;
  }

  // Sun azimuth (degrees true, clockwise from north) and geometric altitude.
  function sunAzimuth(t, lat, lon) {
    const p = sunAltHa(t, lat, lon), H = p.ha * D2R, f = lat * D2R, d = p.dec * D2R;
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(f) - Math.tan(d) * Math.cos(f)) * R2D + 180;
    return { az: ((az % 360) + 360) % 360, alt: p.alt };
  }

  // Apparent horizon depression from height (incl. standard refraction).
  const dipDeg = (ft) => 0.0347 * Math.sqrt(Math.max(ft, 0) * 0.3048);

  // ---- great circle --------------------------------------------------------
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
  // Initial great-circle bearing a -> b, degrees true 0..360.
  function bearing(a, b) {
    const la1 = a.lat * D2R, la2 = b.lat * D2R, dlo = (b.lon - a.lon) * D2R;
    const y = Math.sin(dlo) * Math.cos(la2);
    const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dlo);
    return ((Math.atan2(y, x) * R2D) + 360) % 360;
  }
  const qiblaBearing = (p) => bearing(p, KAABA);
  // Relative bearing, -180..180 (negative = left).
  const relBearing = (target, heading) => ((((target - heading) % 360) + 540) % 360) - 180;
  function clockCode(rel) { const c = Math.round((((rel % 360) + 360) % 360) / 30) % 12; return c === 0 ? 12 : c; }

  // ---- vertical profile ----------------------------------------------------
  // Integrates altitude minute by minute:
  //   climb from origin elevation to the initial level at climbFpm,
  //   step climbs/descents to new levels from their elapsed times at stepFpm,
  //   then caps by a descent line ending at destination elevation (descentFpm).
  function makeProfile(o) {
    const { start, end } = o;
    const origElev = +o.origElev || 0, destElev = +o.destElev || 0;
    const initial = +o.initialFt || 0;
    const climbFpm = Math.max(+o.climbFpm || 1500, 100);
    const stepFpm = Math.max(+o.stepFpm || 1000, 100);
    const descentFpm = Math.max(+o.descentFpm || 1500, 100);
    const steps = (o.steps || []).filter((s) => s && isFinite(s.t) && isFinite(s.ft))
      .map((s) => ({ t: s.t, ft: +s.ft })).sort((a, b) => a.t - b.t);
    const n = Math.max(1, Math.ceil((end - start) / MIN));
    const alt = new Float64Array(n + 1);
    const marks = [];
    alt[0] = origElev;
    let toc = null, tod = null, cur = origElev, lastTarget = initial;
    for (let k = 0; k < n; k++) {
      const t = start + k * MIN;
      let target = initial, inStep = false;
      for (const s of steps) if (s.t <= t) { target = s.ft; inStep = true; }
      if (target !== lastTarget) { marks.push({ t, kind: target > lastTarget ? "Step climb" : "Step descent", ft: target }); lastTarget = target; }
      const dtMin = Math.min(MIN, end - t) / MIN;
      let a = cur;
      if (a < target) a = Math.min(target, a + (inStep ? stepFpm : climbFpm) * dtMin);
      else if (a > target) a = Math.max(target, a - stepFpm * dtMin);
      if (toc === null && a >= initial) { toc = t + MIN * dtMin; marks.push({ t: toc, kind: "Top of climb", ft: initial }); }
      const tNext = t + MIN * dtMin;
      const cap = destElev + descentFpm * (end - tNext) / MIN;
      if (a > cap) {
        if (tod === null) { tod = t; marks.push({ t: tod, kind: "Top of descent", ft: cur }); }
        a = cap;
      }
      cur = a; alt[k + 1] = a;
    }
    function altitude(t) {
      if (t <= start) return origElev;
      if (t >= end) return destElev;
      const x = (t - start) / MIN, k = Math.floor(x), f = x - k;
      return alt[k] + (alt[Math.min(k + 1, n)] - alt[k]) * f;
    }
    const maxFt = alt.reduce((m, v) => Math.max(m, v), 0);
    return { altitude, marks: marks.sort((a, b) => a.t - b.t), toc, tod, maxFt, origElev, destElev };
  }

  // ---- route ---------------------------------------------------------------
  // wps: [{name, lat, lon, eto|null}], first and last must have eto.
  function makeRoute(wps, profile) {
    wps = wps.map((w) => ({ ...w }));
    const cum = [0];
    for (let i = 1; i < wps.length; i++) cum.push(cum[i - 1] + gcNm(wps[i - 1], wps[i]));
    const known = wps.map((w, i) => (w.eto != null ? i : -1)).filter((i) => i >= 0);
    if (known[0] !== 0 || known[known.length - 1] !== wps.length - 1)
      throw new Error("Departure and arrival need a time.");
    for (let k = 0; k + 1 < known.length; k++) {
      const i0 = known[k], i1 = known[k + 1], span = cum[i1] - cum[i0];
      if (wps[i1].eto < wps[i0].eto) throw new Error(`Time at ${wps[i1].name} is earlier than at ${wps[i0].name}.`);
      for (let i = i0 + 1; i < i1; i++)
        wps[i].eto = wps[i0].eto + (wps[i1].eto - wps[i0].eto) * (span ? (cum[i] - cum[i0]) / span : 0);
    }
    const start = wps[0].eto, end = wps[wps.length - 1].eto;
    if (!(end > start)) throw new Error("Arrival must be after departure.");
    if (!profile) profile = makeProfile({ start, end, initialFt: 0 });
    function state(t) {
      let i = 0, f;
      if (t <= start) f = 0;
      else if (t >= end) { i = wps.length - 2; f = 1; }
      else {
        while (i < wps.length - 2 && wps[i + 1].eto <= t) i++;
        const dt = wps[i + 1].eto - wps[i].eto;
        f = dt > 0 ? (t - wps[i].eto) / dt : 1;
      }
      const a = wps[i], b = wps[i + 1];
      const p = gcInterp(a, b, f);
      p.alt = profile.altitude(t);
      p.leg = a.name + "–" + b.name;
      p.airborne = t > start && t < end;
      // course to the next fix; near the fix, use the course just before it
      p.track = f < 0.999 ? bearing(p, b) : bearing(gcInterp(a, b, 0.99), b);
      const leg = cum[i + 1] - cum[i];
      p.distFlown = cum[i] + leg * f;
      // position relative to the fixes either side (for "EDATA +24 nm")
      p.fromFix = a.name; p.toFix = b.name;
      p.nmFromFix = leg * f; p.nmToFix = leg * (1 - f);
      p.minFromFix = (Math.min(Math.max(t, start), end) - a.eto) / MIN;
      p.minToFix = (b.eto - Math.min(Math.max(t, start), end)) / MIN;
      return p;
    }
    return { wps, cum, start, end, state, profile, distNm: cum[cum.length - 1] };
  }

  // ---- events: zero crossings along the time axis --------------------------
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
        // upward crossing; the |jump| test rejects the +-180 deg hour-angle wrap
        if (gp < 0 && gv >= 0 && Math.abs(gv - gp) < 90) {
          let lo = tp, hi = tc;
          for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (g(mid) < 0) lo = mid; else hi = mid; }
          const s = route.state(hi);
          out.push({ name, t: hi + (ihtiyat[name] || 0) * MIN, raw: hi, ...s, qibla: qiblaBearing(s) });
        }
        tp = tc; gp = gv;
        if (tc >= t1) break;
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }

  // ---- prayer windows -------------------------------------------------------
  // Window = from a prayer's start to the event that ends it. Searched over a
  // margin either side of the flight (aircraft parked at origin / destination),
  // so windows already open at take-off or still open at landing are complete.
  const ENDS = { Fajr: "Sunrise", Zuhr: "Asr", Asr: "Maghrib", Maghrib: "Isha", Isha: "Fajr" };
  function prayerWindows(route, conv, marginH = 30) {
    const ev = findEvents(route, conv, route.start - marginH * HOUR, route.end + marginH * HOUR);
    const wins = [];
    ev.forEach((e, i) => {
      if (!ENDS[e.name]) return;
      // Normally the closing event is the very next one. If another event comes
      // first, the closing angle was never reached on this track (high
      // latitude, short summer night): close at that event and flag it.
      const endEv = ev[i + 1] || null, problem = endEv && endEv.name !== ENDS[e.name]
        ? `${ENDS[e.name]} angle not reached on this track (next event is ${endEv.name}): apply a high-latitude rule`
        : null;
      if (!endEv) return; // runs past search margin
      const wEnd = endEv.t;
      if (wEnd <= route.start || e.t >= route.end) return;
      const inStart = Math.max(e.t, route.start);
      const inEnd = Math.min(wEnd, route.end);
      wins.push({
        name: e.name, start: e.t, end: wEnd, endEvent: endEv, startEvent: e, problem,
        groundMs: groundWindowMs(e, conv),
        openAtDeparture: e.t < route.start, openAtArrival: wEnd > route.end,
        airborneMs: Math.max(0, inEnd - inStart),
      });
    });
    return { windows: wins, events: ev.filter((e) => e.t >= route.start && e.t <= route.end) };
  }

  // Length of the same window for an observer who stays at the point (and
  // altitude) where it opened. Comparing it with the window along the route
  // shows how much flying east (shorter) or west (longer) changes it.
  function groundWindowMs(e, conv) {
    const t0 = e.t - 3 * HOUR, t1 = e.t + 30 * HOUR;
    const prof = makeProfile({ start: t0, end: t1, origElev: e.alt, destElev: e.alt, initialFt: e.alt });
    const fixed = makeRoute([{ name: "", lat: e.lat, lon: e.lon, eto: t0 }, { name: "", lat: e.lat, lon: e.lon, eto: t1 }], prof);
    const ev = findEvents(fixed, conv, t0, t1);
    let best = -1;
    ev.forEach((x, i) => { if (x.name === e.name && (best < 0 || Math.abs(x.t - e.t) < Math.abs(ev[best].t - e.t))) best = i; });
    if (best < 0 || !ev[best + 1] || ev[best + 1].name !== ENDS[e.name]) return null;
    return ev[best + 1].t - ev[best].t;
  }

  // Situation at a given instant (for the live panel).
  function situationAt(route, wins, t, headingTrue) {
    const s = route.state(t);
    const q = qiblaBearing(s);
    const hdg = isFinite(headingTrue) ? headingTrue : s.track;
    const rel = relBearing(q, hdg);
    const current = wins.find((w) => w.start <= t && (w.end === null || t < w.end)) || null;
    const next = wins.filter((w) => w.start > t).sort((a, b) => a.start - b.start)[0] || null;
    return { ...s, t, qibla: q, heading: hdg, headingSource: isFinite(headingTrue) ? "HDG" : "TRK",
      rel, clock: clockCode(rel), current, next };
  }

  // "over EDATA", "EDATA +24 nm" or "BAKUV −12 nm" (whichever fix is nearer).
  function fixRef(s) {
    if (!s || s.fromFix == null) return "";
    const near = s.nmToFix < s.nmFromFix;
    const nm = Math.round(near ? s.nmToFix : s.nmFromFix);
    const fix = near ? s.toFix : s.fromFix;
    if (nm < 1) return "over " + fix;
    return `${fix} ${near ? "−" : "+"}${nm} nm`;
  }

  root.Solat = { fixRef, ICAO, TZ, CONVENTIONS, DEFAULT_IHTIYAT, STATIONS, EVENTS, KAABA, MIN, HOUR, DAY,
    parseLat, parseLon, station, fmtLat, fmtLon, fmtPos, sunPosition, sunAltHa, dipDeg, moonPosition, moonAlt, prevNewMoon, sunAzimuth,
    gcNm, gcInterp, bearing, qiblaBearing, relBearing, clockCode,
    makeProfile, makeRoute, findEvents, prayerWindows, situationAt };
})(typeof window !== "undefined" ? window : globalThis);
