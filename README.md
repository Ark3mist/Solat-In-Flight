# Solat In Flight

This tool computes Islamic prayer times along a flight route, from the sun's position as seen from the moving aircraft.

## Offline web app (no install, no internet)

Open `index.html` in any browser. It needs no server and no connection.

- **Laptop:** download the repo ZIP, unzip it, and double-click `index.html`.
- **Phone or tablet:** open https://ark3mist.github.io/Solat-In-Flight/ once while online and tap **⤓ Install app** (top right, or the banner).
  - **Android (Chrome):** installs directly.
  - **iPhone / iPad:** Apple allows installing only from Safari's **Share → Add to Home Screen**; the button shows those steps for your device.
  - Then open it from the icon once while online. After that it works offline.

What it does:

1. **Sun position** comes from the NOAA/Meeus algorithm for the actual date, with no lookup tables.
2. **Route** runs from departure to arrival, and you can add waypoints with optional ETAs (HHMM UTC). Fixes without an ETA are timed by distance.
   - **Off-block + taxi = airborne** (taxi defaults to 20 min). Landing = airborne + flight time.
   - Changing off-block, taxi, airborne or any waypoint ETA moves every later ETA and the landing time by the same amount (moved fields are highlighted) and recalculates the prayer times at once.
   - **FL per fix:** the cruise level from that fix on (blank = unchanged). The initial FL and step climbs in the vertical profile are built from these, with each change starting at the fix before. Changing an FL replaces the rest of that level segment (up to the next planned level change) and recalculates. The OFP import fills them from the nav log.
   - **Lat/Lon** columns are hidden by default; the *Lat/Lon* button shows them (and *+ Add* opens them for the new fix).
3. **Prayer times** are the zero crossings of `sun_altitude(t, position(t)) − threshold(altitude(t))` along the time axis, refined by bisection.
4. **Vertical profile** covers climb, the initial FL, step climbs or descents at T+hh:mm, and a descent line to the destination elevation. Horizon dip is applied at the altitude of the moment.
5. **Output** shows each prayer window: when it opens and closes (UTC), the time available, and the **qibla as a clock position from the aircraft's nose** (12 o'clock = ahead, 3 = right, 9 = left), on a clock dial, so passengers can use it too. QDM and track in °M are shown as small print.
   - Magnetic variation comes from the World Magnetic Model 2025 (NOAA/BGS, public domain, bundled as `wmm.js`, valid to 2030). It is computed at the aircraft's position and level, and matches the reference implementation to 0.01°.
   - The clock position uses the planned track as the nose direction. Drift is not included, so with a crosswind the true answer can be a few degrees off.

6. **Now box:** altitude in metres or feet (tap **m / ft**; the other unit is shown underneath), heading °M and the time (device clock, or HHMM you type).
   - It shows at once which prayer is open, the time left, the next prayer, the qibla and the sun as clock positions from the nose, and when and where the next sunrise or sunset happens.
   - The aircraft is assumed to hold the altitude you entered from now on; the position comes from the planned route.
   - **On the ground below:** that day's six times (UTC) for someone on the ground directly under the aircraft, with the one in force highlighted, so you can compare them with the in-flight times.
   - **Saved routes** (in Route): save, load and delete; **Export / Import backup** moves them between devices.
7. **Prayer time available** is measured from opening (or take-off) until the next prayer, along the moving route. It is compared with someone staying at the position where the window opened: flying east shortens a window and flying west lengthens it.

8. **Globe with a time slider:**
   - shows the route as entered (flown part solid, rest dashed) with the aircraft moving along it;
   - day, twilight and night shading from the sun's true position;
   - **prayer lines** for Fajr, Sunrise, Zuhr, Asr, Maghrib and Isha: the places where each prayer is starting at the slider time, so you can watch the aircraft cross them;
   - **▶** plays the flight. The readout under the slider gives the time, position, magnetic track, qibla °M, the window open and the next prayer.
   - **Zoom** from 1× to 80× (wheel, pinch, double-tap, or + / −). The display renders at the screen's native resolution. Zoomed in, the coastline switches to Natural Earth 1:50m and every fix is labelled with its ETA. There is a scale bar in nm.
   - **Prayer chips** jump to the moment the aircraft physically crosses each prayer line and zoom onto it. Each crossing is given relative to the nearest fix, e.g. `Isha 1526Z · VLADA +13 nm`, together with the crossing time and the prayer time (crossing plus ihtiyat).
   - Lines are drawn from the sun angle alone: ihtiyat is added to the time, not drawn on the map.
   - **Sun and moon** sit over the points where each is overhead. The moon is drawn in its current phase, lit side towards the sun (Meeus ch. 47 main terms, about 0.1°, checked against PyEphem). Under the slider: sun and moon altitude at the aircraft (moon corrected for parallax), the phase, % lit, and days since the new moon. Either can be hidden from the legend.
   Land outlines are Natural Earth 1:110m and 1:50m (public domain), via world-atlas (ISC).

9. **Import OFP:** load the briefing package as a PDF, or paste its text.
   - It reads the COORDINATES INFORMATION list, the nav log (ELTM and FL per fix) and the header (date, STD, taxi, flight time). The reclearance log is skipped.
   - From these it sets off-block (STD), airborne (off-block + the taxi setting, 20 min by default, not the OFP's planned taxi), landing (airborne + FLT time), every waypoint with its ETA, the initial FL and step climbs, and the climb and descent rates (from T-O-C and T-O-D).
   - The file is read **on the device**. Nothing is uploaded, and it works offline.
   - PDF reading uses [pdf.js](https://github.com/mozilla/pdf.js) 3.11.174 (Apache-2.0, bundled in `vendor/pdfjs`), loaded only when you choose a PDF.
   - The parser has been tested against one Lido-style OFP layout. Other layouts may need parser changes.

Every box has a **−** button to minimise it (remembered per device); *My waypoints* and *Advanced* fold open and closed on their own.

Windows already open at take-off, or still open at landing, are completed using the aircraft on the ground at the origin or destination. If a closing angle is never reached on the track (a high-latitude summer night), the window is flagged.

## Python (command line)

```bash
python3 solat_route.py --from KUL --to LHR --dep 2026-11-01T15:30Z --duration 14:00 --alt 35000 --extra-waypoints 10
```

You can pick the convention with `--convention workbook|jakim|mwl`.

For a review of the original Excel workbook (v3.7) and the reasons for this design, see [`docs/excel-analysis.md`](docs/excel-analysis.md).

**Compare airports:** two airports (IATA or ICAO from the built-in list, saved waypoints, or coordinates) and a date. Shows each prayer in local time (with daylight saving) and UTC, the real-time gap between them, which prayer is in force now at each, daylight length and qibla. The built-in list now includes ICAO codes and time zones, plus CDG, IST, FRA, MCT, CMB and MLE.

**Version and updates:** the header shows the version date, when you last checked for an update, and when the magnetic data (WMM2025) expires (31 Dec 2029). *Check for update* compares with `version.json` online; the sun and moon formulas do not expire.

**Phone layout:** Flight, Now, Route, Globe, Prayer windows, Timeline. Route, Prayer windows and Timeline always open minimised.

**Validation:** against the JAKIM e-Solat 2026 timetables (5 zones, 1,825 zone-days), the JAKIM preset (Fajr 18°, Isha 18°, ihtiyat Fajr +1, Zuhr +2, Asr +1, Maghrib +1, Isha +1) is within 1 min on 96–100% of days and never more than 2 min out. The qibla agrees with JAKIM to within 0.07°. See [`docs/jakim-validation.md`](docs/jakim-validation.md).

> Status: reference prototype. Validate it against an authoritative source before you use it operationally.
