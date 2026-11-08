# SolAir · Solat in the air

*Formerly Solat In Flight. By LipasTerbang™.*

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
   - **Clear** (with a confirmation) removes every waypoint and keeps only DEP and ARR.
   - **Lat/Long** columns are hidden by default; the *Lat/Long* button shows them, in compact fixed widths so FL and ETA stay readable (*+ Add* opens them for the new fix).
3. **Prayer times** are the zero crossings of `sun_altitude(t, position(t)) − threshold(altitude(t))` along the time axis, refined by bisection.
4. **Vertical profile** covers climb, the initial FL, step climbs or descents at T+hh:mm, and a descent line to the destination elevation. Horizon dip is applied at the altitude of the moment.
5. **Output** shows each prayer window: when it opens and closes (UTC), the time available, and the **qibla as a clock position from the aircraft's nose** (12 o'clock = ahead, 3 = right, 9 = left), on a clock dial, so passengers can use it too. QDM and track in °M are shown as small print.
   - Magnetic variation comes from the World Magnetic Model 2025 (NOAA/BGS, public domain, bundled as `wmm.js`, valid to 2030). It is computed at the aircraft's position and level, and matches the reference implementation to 0.01°.
   - The clock position uses the planned track as the nose direction. Drift is not included, so with a crosswind the true answer can be a few degrees off.

6. **Solat box:** follows the device clock (on another day, the same clock time on the flight's day). Altitude and heading are the planned ones.
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
   - **ATC route string:** paste just the route (e.g. `WMKK MITOS1B MITOS M630 JUNHA … RIVET DCT YSSY`). DEP and ARR come from the built-in airport list; waypoints come from this device's waypoint memory, or from lat/long groups such as `4000N05500E`. Airways, SID/STAR, DCT and speed/level groups are skipped. Unknown waypoints are listed and left out (the route goes direct past them); a remembered name far off the route (same name elsewhere) is also left out. Times come from the Flight box and are spread by distance.
   - **Waypoint memory:** every fix with coordinates from an imported OFP, a saved route, or Lat/Long typed on a waypoint is remembered on the device only (*My waypoints*, included in Export backup). No navigation database is shipped: worldwide fix data is licensed.

Every box has a **−** button to minimise it (remembered per device).

Windows already open at take-off, or still open at landing, are completed using the aircraft on the ground at the origin or destination. If a closing angle is never reached on the track (a high-latitude summer night), the window is flagged.

## Python (command line)

```bash
python3 solat_route.py --from KUL --to LHR --dep 2026-11-01T15:30Z --duration 14:00 --alt 35000 --extra-waypoints 10
```

You can pick the convention with `--convention workbook|jakim|mwl`.

For a review of the original Excel workbook (v3.7) and the reasons for this design, see [`docs/excel-analysis.md`](docs/excel-analysis.md).

**City-Pair:** the Route's DEP and ARR airports (always taken from the Route) and a date, which follows the flight date unless you change it. Shows each prayer in local time (with daylight saving) and UTC, the real-time gap between them, which prayer is in force now at each, daylight length and qibla. Works for any airport in the database below, with its own time zone.

**Flight time and average ground speed:** the Flight box has *Flight time* (airborne to landing, H:MM); typing it sets Landing, and changing Landing updates it. Below the boxes a teal note shows the average ground speed: from an imported OFP (ground distance ÷ planned flight time, with the average wind), otherwise route distance ÷ flight time. With Landing blank, landing is estimated at 450 kt (or the OFP's average) and shown greyed in Landing and Flight time. The note also reminds the user to update ETAs to actual times (ATO) and FLs in flight. In the Timeline, *Prayer time available* is highlighted in teal (#00A19C).

**Great-circle warning:** when the Route has only DEP and ARR (typical for a passenger without the OFP), the Globe, Solat and Timeline tabs show a warning that the path is a great circle, not the airline's flight plan, and that prayer times may differ by 10–20 min or more. It disappears once an OFP is imported or waypoints are added.

**Airports:** `airports.js` holds about 7,950 airports with IATA codes (every airline-served airport), offline, each with ICAO code, name, city, country, position and IANA time zone. In the Route, type a code (IATA or ICAO), a city, an airport name or a country into the Ident box and pick from the list; for DEP/ARR, typing a city and leaving the box takes the best match. Common alternative names work (Madinah, Makkah → Jeddah, Saigon, Bombay…). The 41 workbook airports keep the workbook coordinates. Source: the [airportsdata](https://github.com/mborsetti/airportsdata) package (MIT); regenerate with `tools/build_airports.py`.

**Version and updates:** versions are numbered `MAJOR-HOTFIX-YY`, e.g. `1-01-26`: MAJOR goes up for a major change (and HOTFIX goes back to 01), HOTFIX counts each smaller update (01, 02, 03…), YY is the year of the update. The version is set in `APP_VERSION` (index.html) and `version.json`, which must match. Settings shows the version, its date, when you last checked for an update, and when the magnetic data (WMM2025) expires (31 Dec 2029). The app checks `version.json` once each time it is opened (straight away if online, otherwise as soon as the device connects), with no repeated background checks; a new version shows a banner above the tab bar (*Update* / *Later*, which hides it for 6 hours) and an *Update available* badge in the header. *Check for update* checks at once; the sun and moon formulas do not expire.

**App layout:** a bottom bar with five tabs, on every screen size:
- **Flight:** flight times, Route (OFP import, FLs, ETAs, Clear, saved routes) and Calculate.
- **Solat:** the Solat box (current prayer, qibla and sun from the nose, a one-line flight timeline: DEP, prayer times, ARR/ETA), the Jamak planner (Taqdim / Ta'khir) and the City-Pair.
- **Globe:** the globe, slider and prayer-line chips.
- **Timeline:** prayer windows and the timeline.
- **Settings:** version, magnetic-data expiry, update check and install; appearance (Device / Light / Dark) and the default taxi-out time used for OFP imports; **Advanced settings** (convention, Fajr/Isha angles, Asr, ihtiyat per prayer, local offset, dip on twilight), which recalculate at once; notes on the calculation.

**Feedback** (Settings): type, message and, if you tick it, the current flight (route ends, times, convention, event times; no personal data). *Send by email* opens your mail app addressed to the LipasTerbang team; nothing is sent until you press send there.

The app always opens on the Globe, and jumps to it after an OFP import.



**Conventions** (Settings → Advanced settings):

| Method | Fajr | Isha | Ihtiyat (min) |
|---|---|---|---|
| JAKIM e-Solat (default) | 18° | 18° | Fajr +1, Zuhr +2, Asr +1, Maghrib +1, Isha +1 |
| Umm al-Qura University, Makkah | 18.5° | Maghrib + 90 min | Zuhr +1, Maghrib +1 |
| University of Islamic Sciences, Karachi | 18° | 18° | Zuhr +1, Maghrib +1 |
| Egyptian General Authority of Survey | 19.5° | 17.5° | Zuhr +1, Maghrib +1 |
| Muslim World League | 18° | 17° | Zuhr +1, Maghrib +1 |

Asr is Shafi'i by default (Hanafi selectable). Umm al-Qura's Isha is counted 90 min from the aircraft's own sunset. Every value can be changed.

**Timeline** lists only the milestones: airborne, TOC, each prayer, TOD and landing.

**Validation:** against the JAKIM e-Solat 2026 timetables (5 zones, 1,825 zone-days), the JAKIM preset (Fajr 18°, Isha 18°, ihtiyat Fajr +1, Zuhr +2, Asr +1, Maghrib +1, Isha +1) is within 1 min on 96–100% of days and never more than 2 min out. The qibla agrees with JAKIM to within 0.07°. See [`docs/jakim-validation.md`](docs/jakim-validation.md).

## Releasing (preview first, then live)

| Branch | What it is |
|---|---|
| `Main` | **Live app.** GitHub Pages publishes it at https://ark3mist.github.io/Solat-In-Flight/. Changes arrive only by merging a pull request. |
| `claude/sweet-allen-q6tovx` | **Work in progress.** Every push is published by Cloudflare Pages as a preview at https://claude-sweet-allen-q6tovx.solatinflight.pages.dev/ (users never see it). |

1. Make and push the change on the work branch; try it at the preview address, online and offline.
2. When it is right, set the next version (`APP_VERSION` in `index.html` and `version.json`, `MAJOR-HOTFIX-YY`) and bump `CACHE` in `sw.js`.
3. Open a pull request from the work branch into `Main` and merge it. The live app updates within about 2 minutes; users get it with *Check for update*.

The preview and https://solatinflight.pages.dev/ are unofficial copies: analytics does not load there and Settings shows "not the official address".

## Privacy and analytics

Flights, routes and OFPs stay on the device and are never uploaded. The official site counts visits with [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/) (no cookies, no personal data, nothing about the flight). The beacon loads only on `ark3mist.github.io`, only when online, and only once `CF_WEB_ANALYTICS_TOKEN` is set at the end of `index.html`.

## Copyright and licence

© 2026 LipasTerbang. All rights reserved. Free to use at the official address, https://ark3mist.github.io/Solat-In-Flight/. Copying, modifying or republishing the code, calculations or design needs written permission; see [`LICENSE`](LICENSE). Any copy elsewhere is unofficial and may give wrong prayer times. Third-party components keep their own licences (listed in `LICENSE`).

> Status: reference prototype. Validate it against an authoritative source before you use it operationally.
