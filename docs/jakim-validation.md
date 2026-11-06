# Validation against JAKIM e-Solat

**Date:** 6 Nov 2026. **Reference:** JAKIM e-Solat 2026 yearly timetables (`esolatApi/TakwimSolat`) for five zones, 365 days each (1,825 zone-days).
**Method:** the app's own solver, aircraft parked on the ground at the zone's reference point, JAKIM convention. Times are compared **as the app shows them** (opening times rounded up, sunrise down), in whole minutes. Run it again with `node tools/validate_jakim.js <folder with the downloaded JSON>`.

## What the data showed

1. **JAKIM's Fajr is at 18°, not 20°.** At the published Subuh time the sun is at −17.3° to −17.7° in every zone, which is 18° plus about 1 min of ihtiyat. JAKIM's **Imsak** (10 min before Subuh) sits at about −20°. The app's earlier "JAKIM (Fajr 20°)" preset was therefore **9–12 min early for Fajr every day**. It now uses 18°.
2. **Isha at 18°**, with about 1 min of ihtiyat (the sun is at −18.3° to −18.7° at the published time).
3. **Ihtiyat (safety minutes)** that best reproduce the timetable: **Fajr +1, Zuhr +2, Asr +1, Maghrib +1, Isha +1, sunrise 0**. These are now the JAKIM preset's values and can be changed under *Advanced*.
4. **Zone reference point.** JAKIM computes each zone at a reference point, apparently the western end of the zone, so the times hold for all of it. For SWK08, Kuching city gave times 1–2 min early on every day; Sematan, the west end of the zone, matches. JAKIM does not publish these reference points.
5. **Qibla:** the app's bearing agrees with JAKIM's published zone bearing to within **0.07°**.

## Results (app − JAKIM, minutes; JAKIM preset)

```
WLY01 Kuala Lumpur: qibla app 292.54° vs JAKIM 292.52° (+0.02°)
  Fajr     app−JAKIM: -2m 20, -1m 131, 0m 189, +1m 25 | within 1 min 95% | worst 2 min
  Sunrise  app−JAKIM: 0m 260, +1m 105 | within 1 min 100% | worst 1 min
  Zuhr     app−JAKIM: -1m 98, 0m 267 | within 1 min 100% | worst 1 min
  Asr      app−JAKIM: -2m 12, -1m 91, 0m 244, +1m 18 | within 1 min 97% | worst 2 min
  Maghrib  app−JAKIM: -2m 13, -1m 149, 0m 192, +1m 11 | within 1 min 96% | worst 2 min
  Isha     app−JAKIM: -2m 19, -1m 150, 0m 181, +1m 15 | within 1 min 95% | worst 2 min

JHR02 Johor Bahru: qibla app 292.97° vs JAKIM 292.91° (+0.07°)
  Fajr     app−JAKIM: -1m 21, 0m 256, +1m 88 | within 1 min 100% | worst 1 min
  Sunrise  app−JAKIM: -2m 22, -1m 274, 0m 69 | within 1 min 94% | worst 2 min
  Zuhr     app−JAKIM: -1m 15, 0m 315, +1m 35 | within 1 min 100% | worst 1 min
  Asr      app−JAKIM: -1m 12, 0m 271, +1m 82 | within 1 min 100% | worst 1 min
  Maghrib  app−JAKIM: -1m 16, 0m 266, +1m 83 | within 1 min 100% | worst 1 min
  Isha     app−JAKIM: -1m 18, 0m 263, +1m 84 | within 1 min 100% | worst 1 min

PNG01 George Town: qibla app 291.57° vs JAKIM 291.58° (-0.00°)
  Fajr     app−JAKIM: 0m 277, +1m 88 | within 1 min 100% | worst 1 min
  Sunrise  app−JAKIM: 0m 14, +1m 312, +2m 39 | within 1 min 89% | worst 2 min
  Zuhr     app−JAKIM: 0m 226, +1m 139 | within 1 min 100% | worst 1 min
  Asr      app−JAKIM: -1m 6, 0m 222, +1m 137 | within 1 min 100% | worst 1 min
  Maghrib  app−JAKIM: 0m 249, +1m 116 | within 1 min 100% | worst 1 min
  Isha     app−JAKIM: 0m 252, +1m 113 | within 1 min 100% | worst 1 min

SBH07 Kota Kinabalu: qibla app 290.62° vs JAKIM 290.68° (-0.06°)
  Fajr     app−JAKIM: -1m 8, 0m 207, +1m 150 | within 1 min 100% | worst 1 min
  Sunrise  app−JAKIM: -2m 4, -1m 198, 0m 163 | within 1 min 99% | worst 2 min
  Zuhr     app−JAKIM: 0m 219, +1m 146 | within 1 min 100% | worst 1 min
  Asr      app−JAKIM: 0m 205, +1m 157, +2m 3 | within 1 min 99% | worst 2 min
  Maghrib  app−JAKIM: 0m 218, +1m 147 | within 1 min 100% | worst 1 min
  Isha     app−JAKIM: 0m 209, +1m 156 | within 1 min 100% | worst 1 min

SWK08 Sematan, west end of the zone: qibla app 292.10° vs JAKIM 292.09° (+0.01°)
  Fajr     app−JAKIM: 0m 25, +1m 334, +2m 6 | within 1 min 98% | worst 2 min
  Sunrise  app−JAKIM: -1m 24, 0m 341 | within 1 min 100% | worst 1 min
  Zuhr     app−JAKIM: 0m 42, +1m 323 | within 1 min 100% | worst 1 min
  Asr      app−JAKIM: 0m 26, +1m 339 | within 1 min 100% | worst 1 min
  Maghrib  app−JAKIM: 0m 20, +1m 344, +2m 1 | within 1 min 100% | worst 2 min
  Isha     app−JAKIM: 0m 26, +1m 334, +2m 5 | within 1 min 99% | worst 2 min

ALL ZONES
  Fajr     app−JAKIM: -2m 20, -1m 160, 0m 954, +1m 685, +2m 6 | within 1 min 99% | worst 2 min
  Sunrise  app−JAKIM: -2m 26, -1m 496, 0m 847, +1m 417, +2m 39 | within 1 min 96% | worst 2 min
  Zuhr     app−JAKIM: -1m 113, 0m 1069, +1m 643 | within 1 min 100% | worst 1 min
  Asr      app−JAKIM: -2m 12, -1m 109, 0m 968, +1m 733, +2m 3 | within 1 min 99% | worst 2 min
  Maghrib  app−JAKIM: -2m 13, -1m 165, 0m 945, +1m 701, +2m 1 | within 1 min 99% | worst 2 min
  Isha     app−JAKIM: -2m 19, -1m 168, 0m 931, +1m 702, +2m 5 | within 1 min 99% | worst 2 min
```

**Summary:** 96–100% of days within 1 min, none more than 2 min out. Most of the remaining ±1 min is rounding (both sides round to whole minutes) and the unpublished reference coordinates.

## What this does and does not prove

- It validates the sun model, the event solver, the angles, the ihtiyat and the rounding **on the ground in Malaysia**, against the authority's own timetable.
- It does **not** validate the in-flight parts. JAKIM publishes no airborne times. The horizon allowance at altitude (dip), the moving aircraft and the OFP timing are covered by the error analysis, not by this comparison.
- The JAKIM preset is the right one only if JAKIM is your authority. Other bodies use other angles; see the *Convention* list.
