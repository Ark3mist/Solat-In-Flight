# Review of `Inflight_solat_times_3.7.xlsx`

## How the workbook works

| Sheet | Role |
|---|---|
| `Main` | Takes 2 positions, an airborne time, ETOs and an altitude. Gives static times at Position 1 and one along-track event between P1 and P2. |
| `North` / `South` (hidden) | Pre-computed prayer-time tables for 0° longitude: 92 dates (every 4 days), latitudes 0–68° in 4° steps, 7 events per date. |
| `Long` (hidden) | Converts longitude to time (4 min per degree). |
| `Altitude` (hidden) | Altitude correction in minutes, by altitude (1,000–43,000 ft) and latitude (0–52°). |
| `Sheet1` (hidden) | Sun azimuth grid, used for "Approx sun direction". |
| `STN` | Airport coordinates. |

The calculation chain: table lookup, then linear interpolation by date and latitude, then a longitude correction, then an altitude correction, then the along-track event. The along-track event is found with a circular reference (`X2`↔`X4`), so it only works with Excel's iterative calculation turned on, plus manual "Adjust dist" passes.

I back-solved the tables against a solar model to find the convention they use: **Fajr 18°, Isha 18°, Shafi'i Asr, Zuhr = transit + about 2–3 min, Maghrib = sunset + about 1 min**. The "Fajr 15°" row is an alternative. Note: this is **not JAKIM** (JAKIM uses Fajr 20°). Check that this is the authority you intend to follow.

## Findings, ranked by impact

### 1. Your premise: "10 extra waypoints make it more precise" is wrong as stated
I tested it with `solat_route.py`. On KUL–LHR, adding 10 or 50 evenly spaced **great-circle** points changes every event by **0 seconds**. A continuous solver already knows every point on the great circle, so evenly spaced points add no information.

The real error is the **route itself**. The great circle from KUL to LHR runs through Turkmenistan, Kazakhstan and Russia/Ukraine (WP06–WP08), airspace you will not fly. Compared with an approximate southern routing (MAA–BOM–KHI–IKA–TBZ–IST–VIE, +235 nm):

| Departure (UTC) | Event | Great-circle time | Realistic routing | Difference |
|---|---|---|---|---|
| 01 Nov 1530Z | Fajr | 0226Z | 0309Z | **+43 min** |
| 01 Nov 0100Z | Zuhr / Asr | 0648Z / 1154Z | 0737Z / 1300Z | **+49 / +65 min** |
| 15 Jun 1530Z | Fajr / Sunrise | 2147Z / 0012Z | 2301Z / 0157Z | **+74 / +105 min** |

**Conclusion:** waypoints help only if they are the **real flight-plan fixes with their ETOs** (or live ETOs updated in flight). Ten made-up points on a great circle are just for show.

### 2. The lookup tables are corrupted
The row labels include `Sunnse`, `Maghr:b`, `Magorib`, `Asi`, `As;` and `she`. These are OCR artefacts, so the tables were probably scanned from a printed almanac. Of about 21,000 cells, **109 are wrong by more than 3 minutes**, and **36 of those are in the North 0–52° band that KUL–LHR uses**. Full list: [`table_errors.csv`](table_errors.csv). Examples:

| Cell | Table | Should be about | Error |
|---|---|---|---|
| North 09/01 Zuhr 52°N | `1299` | 1209 | Not a valid time |
| North 04/10 Fajr 48°N | `3419` | 0418 | Not a valid time |
| North 31/12 Fajr 24°N | `1522` | 0522 | +10 h |
| North 08/10 Asr 12°N | `508` | 1508 | −10 h |
| North 20/07 Asr 44/56/64°N | `1910`… | 1610… | +3 h |
| North 06/06 Maghrib 8–12°N | `1916`, `1923` | 1816, 1823 | +60 min |
| South 05/01 Fajr 12–44°S | Whole row | — | Shifted, 8 to 56 min |
| South 01/08 Zuhr (all latitudes) | `1206` | 1209 | Pasted from January |

Because the workbook interpolates, one bad cell contaminates every result within ±4 days and ±4° of it, with no warning.

### 3. The altitude correction ignores the season
`Altitude` is indexed by altitude and latitude only. The real correction also depends on the sun's declination. At FL350:

| Latitude | Table | Sunrise, equinox | Sunrise, June | Fajr, June |
|---|---|---|---|---|
| 0° | 15.8 | 14.3 | 15.6 | 15.8 |
| 40° | 22.1 | 18.7 | 22.6 | **36.1** |
| 52° | 33.6 | **23.3** | 32.9 | No Fajr (persistent twilight) |

So the table over-corrects by up to about 10 minutes at the equinox at 52°N, and under-corrects Fajr and Isha by up to about 14 minutes in summer at mid-latitudes. It also stops at 52° (`Y26 = W26+1` has no cap in the Position 1 block), so Position 1 above 52° gives `#REF!` or invalid numbers.

### 4. Applying dip to Fajr and Isha is a juristic choice, but the sheet treats it as a fixed fact
The 18° depression for Fajr and Isha is defined below the astronomical horizon. Whether the aircraft's lowered visible horizon should shift Fajr and Isha is a fiqh question, and opinions differ. The sheet always applies the correction (and to Fajr it applies the "Fajr 15°" row *plus* the dip, which looks like double-counting). Get a ruling and make it a visible switch (`dip_on_twilight` in the code).

### 5. Structural and model weaknesses
- **Constant ground speed** between P1 and P2 (`AE17`). This is acceptable per leg, not across a 13-hour flight with variable winds and step climbs.
- **Fixed date.** The date reference defaults to `TODAY()` and does not roll over at 0000Z mid-flight. KUL–LHR night flights cross midnight UTC.
- **Generic year (2011).** The equation of time drifts by under 1 min between years. This is small, but the cost of computing it exactly is zero.
- **Linear interpolation over 4° and 4 days.** Fine at low latitudes. Above about 48° in summer, twilight times become very non-linear, which is exactly where LHR and AMS sit.
- **Locale hacks.** `A1:A5` and `C3:D5` detect mm/dd versus dd/mm by string tricks. These break on non-US or non-UK locales.
- **Requires iterative calculation in Excel.** It does not work in Google Sheets, Numbers or on mobile.
- **Only one along-track event** per run. You have to re-enter positions for each prayer.
- **No high-latitude rule.** Above about 48.5°N in May–July there is no 18° Fajr or Isha. The sheet returns blanks or garbage. A rule is needed (angle-based, 1/7 of the night, or nearest latitude).

## Recommendations for the GitHub version

1. **Drop the tables entirely.** Compute the sun's position directly (NOAA/Meeus is accurate well under 1 min). This removes findings 2, 3 and 5 in one move.
2. **Use the real flight plan as the route.** Ingest the OFP/ATC route (fix names and coordinates plus ETOs). Allow ETO updates in flight (actual times over). This is where the precision comes from, not from extra points.
3. **Solve continuously**, don't iterate. For each event, find the zero crossing of `sun_altitude(t, position(t)) − threshold(altitude(t))` along the time axis. One run returns *every* event in the flight, with time and position.
4. **Model the vertical profile.** Use climb, cruise and step climbs, because dip depends on altitude at the moment of the event.
5. **Make the convention explicit and configurable:** Fajr and Isha angles, Asr factor, ihtiyat minutes, dip on twilight (yes or no), and the high-latitude rule. Show the chosen convention on every output.
6. **Add a validation suite.** Test against JAKIM e-Solat ground times for KUL and against a reference such as praytimes.org for LHR and DXB, with a tolerance of ±1 min at sea level.
7. **Output what the crew actually needs:** UTC, local time at the position, lat/long, the nearest FIR or waypoint, the qibla bearing relative to the aircraft heading, and the time remaining in each prayer window.

`solat_route.py` in the repo root is a working reference for items 1, 3, 4 and 5.
