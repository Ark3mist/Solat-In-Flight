/* Solat In Flight — briefing package (OFP) parser. Runs locally; nothing is
 * uploaded. Input is the OFP as plain text (from the PDF text layer or pasted).
 *
 * Reads:
 *   - header: date, DEP/DEST ICAO + scheduled times, BLK/FLT time, taxi time
 *   - COORDINATES INFORMATION: waypoint names with lat/long
 *   - nav log (WPT | FL | ... | TIME ELTM): flight level + elapsed time per point
 *     (the RECLEARANCE FLIGHT LOG is skipped)
 * and turns it into: airborne/landing time, waypoints with ETAs, initial FL,
 * step climbs, and climb/descent rates from T-O-C / T-O-D. */
(function (root) {
  "use strict";
  const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  const COORD = /([NS])(\d{2})(\d{2}\.\d)\s*([EW])(\d{3})(\d{2}\.\d)/g;
  // Points that lie on the route but are not navigation fixes.
  const PSEUDO = /^(SETP\d+|ETP\d*|EEP\d*|EXP\d*|ENTRY|EXIT|T-O-C|T-O-D|TOC|TOD|CP\d*)$/;
  const MIN = 60000;

  const dm = (h, d, m) => { const v = +d + +m / 60; return h === "S" || h === "W" ? -v : v; };
  const hm = (s) => +s.slice(0, s.length - 2) * 60 + +s.slice(-2);   // "1156" -> minutes

  function parse(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const out = { warnings: [], points: [] };

    // ---- header ----
    const all = lines.join("\n");
    let m = /([A-Z]{4})\/([A-Z]{3})\s+(\d{4})\s*UTC\s+([A-Z]{4})\/([A-Z]{3})\s+(\d{4})\s*UTC/.exec(all);
    if (m) Object.assign(out, { depIcao: m[1], depIata: m[2], std: m[3], destIcao: m[4], destIata: m[5], sta: m[6] });
    m = /\b(\d{2})\s?(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s?(\d{4}|\d{2})\b/.exec(all);
    if (m) out.date = { d: +m[1], mo: MONTHS[m[2]], y: m[3].length === 2 ? 2000 + +m[3] : +m[3] };
    m = /(\d{1,2}):(\d{2})\s*HRS\s+(\d{1,2}):(\d{2})\s*HRS/.exec(all);
    if (m) { out.blkMin = +m[1] * 60 + +m[2]; out.fltMin = +m[3] * 60 + +m[4]; }
    m = /\bTAXI\s+[A-Z]{3,4}\s+\d+\s+(\d{1,2}):(\d{2})/.exec(all);
    if (m) out.taxiMin = +m[1] * 60 + +m[2];
    m = /\b(MAS|[A-Z]{2,3})\s?(\d{1,4})\s+OFP\b/.exec(all) || /^\s*([A-Z0-9]{2})\s?(\d{1,4})\/\d{2}[A-Z]{3}\d{2}/m.exec(all);
    if (m) out.flight = (m[1] + " " + m[2]).trim();

    // ---- coordinates section ----
    const coords = {};
    const ci = lines.findIndex((l) => /COORDINATES\s+INFORMATION/i.test(l));
    if (ci >= 0) {
      let prevNames = null;
      for (let i = ci + 1; i < lines.length; i++) {
        const l = lines[i];
        const pairs = [...l.matchAll(COORD)];
        if (pairs.length) {
          if (prevNames && prevNames.length === pairs.length) {
            pairs.forEach((p, k) => {
              if (!(prevNames[k] in coords)) coords[prevNames[k]] = { lat: dm(p[1], p[2], p[3]), lon: dm(p[4], p[5], p[6]), order: Object.keys(coords).length };
            });
          } else out.warnings.push(`Could not match names to coordinates near: "${l.trim().slice(0, 60)}"`);
          prevNames = null;
          continue;
        }
        const toks = l.trim().split(/\s+/).filter((t) => t && t !== "WPT");
        if (toks.length && toks.every((t) => /^[A-Z0-9][A-Z0-9-]{0,11}$/.test(t)) && !/^PAGE$/i.test(toks[0])) prevNames = toks;
      }
    }

    // ---- nav log ----
    const log = [];
    let inRecl = false, inLog = false;
    const ROW = /^([A-Z0-9][A-Z0-9-]{0,11})\s+(CLB|DES|\d{2,3})\b[^|]*\|\s*(?:\d{1,3}\s+)?(\d{4})\s*\|/;
    const CONT = /^\s+(CLB|DES|\d{2,3})\b[^|]*\|\s*(?:\d{1,3}\s+)?(\d{4})\s*\|/;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/RECLEARANCE\s+FLIGHT\s+LOG/i.test(l)) { inRecl = true; continue; }
      if (/^\s*WPT\s+FL\b/.test(l)) {
        // a header right after a RECLEARANCE title belongs to it; any later header ends it
        const before = lines.slice(Math.max(0, i - 4), i).join(" ");
        inRecl = /RECLEARANCE/i.test(before);
        inLog = !inRecl;
        continue;
      }
      if (!inLog) continue;
      let r = ROW.exec(l);
      if (r) { log.push({ name: r[1], fl: r[2], eltm: hm(r[3]) }); continue; }
      // airport line on its own ("EGLL/27R/DET2F") followed by its data line
      const a = /^([A-Z]{4})\/\S+\s*$/.exec(l);
      if (a && lines[i + 1] && (r = CONT.exec(lines[i + 1]))) { log.push({ name: a[1], fl: r[1], eltm: hm(r[2]) }); i++; }
    }
    // keep the first occurrence of each name
    const byName = {};
    for (const e of log) if (!(e.name in byName)) byName[e.name] = e;

    // ---- merge ----
    const names = Object.keys(coords).sort((a, b) => coords[a].order - coords[b].order);
    if (!names.length) out.warnings.push("No COORDINATES INFORMATION section found.");
    if (!log.length) out.warnings.push("No nav log (WPT / FL / ELTM) found: times will be spread by distance.");
    let missing = 0;
    for (const n of names) {
      const e = byName[n];
      if (!e) missing++;
      out.points.push({ name: n, lat: coords[n].lat, lon: coords[n].lon, eltm: e ? e.eltm : null, fl: e ? e.fl : null, pseudo: PSEUDO.test(n) });
    }
    if (log.length && missing) out.warnings.push(`${missing} point(s) have coordinates but no nav-log time.`);

    // ---- times ----
    if (out.date && out.std) {
      const off = Date.UTC(out.date.y, out.date.mo, out.date.d, +out.std.slice(0, 2), +out.std.slice(2));
      out.offBlock = off;
      out.airborne = off + (out.taxiMin != null ? out.taxiMin : 15) * MIN;
      if (out.taxiMin == null) out.warnings.push("Taxi time not found: assumed 15 min after STD.");
      const last = out.points.length ? out.points[out.points.length - 1] : null;
      const flt = out.fltMin != null ? out.fltMin : last && last.eltm;
      if (flt != null) out.landing = out.airborne + flt * MIN;
      for (const p of out.points) p.eto = p.eltm != null ? out.airborne + p.eltm * MIN : null;
    } else out.warnings.push("Date or departure time not found in the header.");

    // ---- vertical profile ----
    const toc = byName["T-O-C"], tod = byName["T-O-D"];
    out.tocEltm = toc ? toc.eltm : null; out.todEltm = tod ? tod.eltm : null;
    // cruise levels only: from top of climb to top of descent
    const numeric = log.filter((e) => /^\d+$/.test(e.fl) && (!toc || e.eltm >= toc.eltm) && (!tod || e.eltm <= tod.eltm));
    if (numeric.length) {
      out.initialFL = +numeric[0].fl;
      out.steps = [];
      let cur = out.initialFL;
      for (let i = 1; i < numeric.length; i++) {
        const f = +numeric[i].fl;
        if (f !== cur) { out.steps.push({ eltm: numeric[i - 1].eltm, fl: f, at: numeric[i - 1].name }); cur = f; }
      }
      out.finalFL = cur;
      if (toc && toc.eltm > 0) out.climbFpm = Math.round(out.initialFL * 100 / toc.eltm / 50) * 50;
      const end = out.fltMin != null ? out.fltMin : (log[log.length - 1] || {}).eltm;
      if (tod && end > tod.eltm) out.descentFpm = Math.round(cur * 100 / (end - tod.eltm) / 50) * 50;
    }
    // "EGLL/F370 EDATA/F390" style level plan, for display
    m = /\b[A-Z]{4}\/F(\d{3})(?:\s+[A-Z0-9]{2,5}\/F\d{3})+/.exec(all);
    if (m) out.levelPlan = m[0];
    return out;
  }

  root.SolatOFP = { parse };
})(typeof window !== "undefined" ? window : globalThis);
