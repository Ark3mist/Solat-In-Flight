# Solat In Flight

This tool computes Islamic prayer times along a flight route, from the sun's position as seen from the moving aircraft.

## Offline web app (no install, no internet)

`index.html` + `solat.js` work fully offline in any browser.

- **Laptop:** download the repo ZIP, unzip it, and double-click `index.html`.
- **iPad/iPhone/Android:** open the GitHub Pages URL once while online, then use *Share → Add to Home Screen*. After that it opens without a connection.

Route format, one fix per line: `IDENT [LAT LON] [HHMM]`, for example `KUL 1530`, `IKA N3524.0 E05109.0`, `LHR 0530`.

## Python (command line)

```bash
python3 solat_route.py --from KUL --to LHR --dep 2026-11-01T15:30Z --duration 14:00 --alt 35000 --extra-waypoints 10
```

You can pick the convention with `--convention workbook|jakim|mwl`.

For a review of the original Excel workbook (v3.7) and the reasons for this design, see [`docs/excel-analysis.md`](docs/excel-analysis.md).

> Status: reference prototype. Validate it against an authoritative source before you use it operationally.
