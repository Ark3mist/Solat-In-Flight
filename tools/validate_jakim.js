// Compare the app's prayer times with JAKIM e-Solat yearly timetables.
// 1. Download, per zone:  https://www.e-solat.gov.my/index.php?r=esolatApi/TakwimSolat&period=year&zone=WLY01
//    and save as <dir>/wly01_year.json (likewise jhr02, png01, sbh07, swk08).
// 2. node tools/validate_jakim.js <dir>
// Times are compared as the app shows them (opening times rounded up, sunrise down).
global.window = global;
require("../solat.js");
const S = Solat, MIN = 60000, DAY = 86400000, fs = require("fs"), path = require("path");
const dir = process.argv[2] || ".";
const MON = { Jan: 0, Feb: 1, Mac: 2, Apr: 3, Mei: 4, Jun: 5, Jul: 6, Ogos: 7, Sep: 8, Okt: 9, Nov: 10, Dis: 11 };
// City coordinates (SWK08: the west end of the zone, which JAKIM evidently uses so the times hold across the zone).
// JAKIM does not publish its zone reference points in the API.
const ZONES = { wly01: ["Kuala Lumpur", 3.1390, 101.6869], jhr02: ["Johor Bahru", 1.4927, 103.7414],
  png01: ["George Town", 5.4141, 100.3288], sbh07: ["Kota Kinabalu", 5.9804, 116.0735], swk08: ["Sematan, west end of the zone", 1.8000, 109.7800] };
const KEYS = [["Fajr", "fajr"], ["Sunrise", "syuruk"], ["Zuhr", "dhuhr"], ["Asr", "asr"], ["Maghrib", "maghrib"], ["Isha", "isha"]];
const c = S.CONVENTIONS.jakim;
const conv = { fajr: c.fajr, isha: c.isha, asr: c.asr, dipOnTwilight: false, ihtiyat: Object.assign({}, S.DEFAULT_IHTIYAT, c.ihtiyat) };
const all = {};
for (const [z, [city, la, lo]] of Object.entries(ZONES)) {
  const f = path.join(dir, z + "_year.json"); if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f));
  const b = d.bearing.replace(/&#176;|&#8242;|&#8243;/g, " ").trim().split(/\s+/).map(Number);
  const qJ = b[0] + b[1] / 60 + b[2] / 3600, qA = S.qiblaBearing({ lat: la, lon: lo });
  const diffs = {}; KEYS.forEach(([n]) => diffs[n] = []);
  for (const p of d.prayerTime) {
    const [dd, mm, yy] = p.date.split("-"), d0 = Date.UTC(+yy, MON[mm], +dd) - 8 * 3600000;   // MYT midnight
    const r = S.makeRoute([{ name: z, lat: la, lon: lo, eto: d0 }, { name: z, lat: la, lon: lo, eto: d0 + DAY }],
      S.makeProfile({ start: d0, end: d0 + DAY, initialFt: 0 }));
    const ev = {}; for (const e of S.findEvents(r, conv)) if (!(e.name in ev)) ev[e.name] = e.t;
    for (const [n, k] of KEYS) {
      if (ev[n] == null) continue;
      const [h, m] = p[k].split(":").map(Number), jak = d0 + (h * 60 + m) * MIN;
      const shown = n === "Sunrise" ? Math.floor(ev[n] / MIN) * MIN : Math.ceil(ev[n] / MIN) * MIN;
      diffs[n].push((shown - jak) / MIN); (all[n] = all[n] || []).push((shown - jak) / MIN);
    }
  }
  console.log(`\n${z.toUpperCase()} ${city}: qibla app ${qA.toFixed(2)}° vs JAKIM ${qJ.toFixed(2)}° (${(qA - qJ >= 0 ? "+" : "")}${(qA - qJ).toFixed(2)}°)`);
  for (const [n] of KEYS) console.log("  " + line(n, diffs[n]));
}
console.log("\nALL ZONES"); for (const [n] of KEYS) if (all[n]) console.log("  " + line(n, all[n]));
function line(n, v) {
  const cnt = {}; v.forEach((x) => cnt[x] = (cnt[x] || 0) + 1);
  const w1 = v.filter((x) => Math.abs(x) <= 1).length, worst = Math.max(...v.map(Math.abs));
  return `${n.padEnd(8)} app−JAKIM: ${Object.keys(cnt).sort((a, b) => a - b).map((k) => `${k > 0 ? "+" : ""}${k}m ${cnt[k]}`).join(", ")} | within 1 min ${(100 * w1 / v.length).toFixed(0)}% | worst ${worst} min`;
}
