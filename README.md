# Solat In Flight

This tool computes Islamic prayer times along a flight route, from the sun's position as seen from the moving aircraft.

## Offline web app (no install, no internet)

Open `index.html` in any browser. It needs no server and no connection.

- **Laptop:** download the repo ZIP, unzip it, and double-click `index.html`.
- **iPad/iPhone/Android:** open the GitHub Pages URL once while online, then use *Share → Add to Home Screen*. After that it opens offline.

What it does:

1. **Sun position** comes from the NOAA/Meeus algorithm for the actual date, with no lookup tables.
2. **Route** runs from departure to arrival, and you can add waypoints with optional ETOs (HHMM UTC). Fixes without an ETO are timed by distance.
3. **Prayer times** are the zero crossings of `sun_altitude(t, position(t)) − threshold(altitude(t))` along the time axis, refined by bisection.
4. **Vertical profile** covers climb, the initial FL, step climbs or descents at T+hh:mm, and a descent line to the destination elevation. Horizon dip is applied at the altitude of the moment.
5. **Output** shows each prayer window: when it opens and closes (UTC), the airborne time available, and the qibla relative to track (or to heading if you enter one), in degrees and as a clock code. A **Now** panel shows the current window, the time remaining, and a qibla dial.

6. **Route library:**
   - **My waypoints:** save a name and its coordinates once; typing that name in the route fills in the position.
   - **Saved routes:** save, load and delete routes.
   - **Export backup / Import:** move your library between devices. It is stored in the browser, so each device keeps its own copy.
7. **Prayer time available** is measured from opening (or take-off) until the next prayer, along the moving route. It is compared with someone staying at the position where the window opened: flying east shortens a window and flying west lengthens it.

8. **Globe with a time slider:**
   - shows the route as entered (flown part solid, rest dashed) with the aircraft moving along it;
   - day, twilight and night shading from the sun's true position;
   - **prayer lines** for Fajr, Sunrise, Zuhr, Asr, Maghrib and Isha: the places where each prayer is starting at the slider time, so you can watch the aircraft cross them;
   - **▶** plays the flight, and the slider also drives the Now panel.
   Land outlines are Natural Earth 1:110m (public domain), via world-atlas (ISC).

Windows already open at take-off, or still open at landing, are completed using the aircraft on the ground at the origin or destination. If a closing angle is never reached on the track (a high-latitude summer night), the window is flagged.

## Python (command line)

```bash
python3 solat_route.py --from KUL --to LHR --dep 2026-11-01T15:30Z --duration 14:00 --alt 35000 --extra-waypoints 10
```

You can pick the convention with `--convention workbook|jakim|mwl`.

For a review of the original Excel workbook (v3.7) and the reasons for this design, see [`docs/excel-analysis.md`](docs/excel-analysis.md).

> Status: reference prototype. Validate it against an authoritative source before you use it operationally.
