#!/usr/bin/env python3
"""In-flight solat times along a route.

Reference implementation intended to replace the lookup-table approach of the
"Inflight Solat Times" Excel workbook. Instead of reading pre-printed tables and
interpolating, it computes the sun's position directly and solves for the exact
UTC instant at which each prayer condition is met *as seen from the aircraft*,
while the aircraft moves along the route.

No third-party dependencies. Python 3.9+.

Usage:
    python3 solat_route.py --from KUL --to LHR --dep 2026-11-01T15:30Z \
        --duration 14:00 --alt 35000 --extra-waypoints 10
"""
from __future__ import annotations

import argparse
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

# ---------------------------------------------------------------------------
# Configuration: calculation convention (make it explicit, not hidden in data)
# ---------------------------------------------------------------------------


@dataclass
class Convention:
    name: str = "Workbook-equivalent (Fajr 18, Isha 18, Shafi'i Asr)"
    fajr_angle: float = 18.0        # JAKIM uses 20.0
    isha_angle: float = 18.0
    asr_factor: float = 1.0         # 1 = Shafi'i/Maliki/Hanbali, 2 = Hanafi
    # Precautionary minutes (ihtiyat) added after computing the astronomical
    # instant. The workbook tables bake in roughly +2..3 min on Zuhr and ~+1 min
    # on Maghrib; here they are explicit and configurable.
    ihtiyat_min: dict = field(default_factory=lambda: {
        "Fajr": 0, "Sunrise": 0, "Zuhr": 2, "Asr": 0, "Maghrib": 1, "Isha": 0})
    # Apply the altitude dip to twilight events (Fajr/Isha) as well as to
    # Sunrise/Maghrib. The workbook does. This is a juristic choice, not a
    # mathematical one, so it is a switch.
    dip_on_twilight: bool = True


CONVENTIONS = {
    "workbook": Convention(),
    "jakim": Convention(name="JAKIM (Fajr 20, Isha 18, Shafi'i Asr)",
                        fajr_angle=20.0),
    "mwl": Convention(name="MWL (Fajr 18, Isha 17)", isha_angle=17.0),
}

STATIONS = {  # from the workbook STN sheet (deg-min)
    "KUL": "N0244.6 E10141.9", "LHR": "N5128.7 W00027.7",
    "DXB": "N2515.2 E05521.9", "DOH": "N2516.5 E05136.5",
    "JED": "N2140.9 E03909.4", "MED": "N2433.0 E03942.4",
    "AMS": "N5218.5 E00445.9", "DEL": "N2834.1 E07706.7",
    "BOM": "N1905.5 E07252.0", "SIN": "N0121.6 E10359.4",
}

# ---------------------------------------------------------------------------
# Solar position (NOAA / Meeus low-precision, ~0.01 deg; good to well under
# a minute of time for prayer purposes).
# ---------------------------------------------------------------------------


def _julian_day(t: datetime) -> float:
    return t.timestamp() / 86400.0 + 2440587.5


def sun_position(t: datetime):
    """Return (declination_rad, equation_of_time_min) for UTC instant t."""
    jc = (_julian_day(t) - 2451545.0) / 36525.0
    l0 = math.radians((280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360)
    m = math.radians(357.52911 + jc * (35999.05029 - 0.0001537 * jc))
    e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc)
    c = (math.sin(m) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
         + math.sin(2 * m) * (0.019993 - 0.000101 * jc)
         + math.sin(3 * m) * 0.000289)
    true_long = l0 + math.radians(c)
    omega = math.radians(125.04 - 1934.136 * jc)
    app_long = true_long - math.radians(0.00569 + 0.00478 * math.sin(omega))
    eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60
    eps = math.radians(eps0 + 0.00256 * math.cos(omega))
    dec = math.asin(math.sin(eps) * math.sin(app_long))
    y = math.tan(eps / 2) ** 2
    eot = 4 * math.degrees(
        y * math.sin(2 * l0) - 2 * e * math.sin(m)
        + 4 * e * y * math.sin(m) * math.cos(2 * l0)
        - 0.5 * y * y * math.sin(4 * l0) - 1.25 * e * e * math.sin(2 * m))
    return dec, eot


def sun_alt_and_ha(t: datetime, lat: float, lon: float):
    """Sun altitude (deg) and local hour angle (deg, -180..180) at lat/lon (deg, E+)."""
    dec, eot = sun_position(t)
    minutes = t.hour * 60 + t.minute + t.second / 60 + t.microsecond / 6e7
    ha = ((minutes + eot + 4 * lon) / 4 - 180)
    ha = (ha + 180) % 360 - 180
    la = math.radians(lat)
    alt = math.asin(math.sin(la) * math.sin(dec)
                    + math.cos(la) * math.cos(dec) * math.cos(math.radians(ha)))
    return math.degrees(alt), ha, dec


def dip_deg(alt_ft: float) -> float:
    """Apparent depression of the horizon incl. standard refraction, degrees."""
    h_m = max(alt_ft, 0) * 0.3048
    return 0.0347 * math.sqrt(h_m)


# ---------------------------------------------------------------------------
# Route geometry
# ---------------------------------------------------------------------------


def parse_dm(s: str):
    """'N0244.6 E10141.9' -> (2.743, 101.698)."""
    a, b = s.split()
    lat = int(a[1:3]) + float(a[3:]) / 60
    lon = int(b[1:4]) + float(b[4:]) / 60
    return (-lat if a[0] == "S" else lat), (-lon if b[0] == "W" else lon)


def gc_distance_nm(p, q) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (*p, *q))
    a = (math.sin((la2 - la1) / 2) ** 2
         + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2)
    return math.degrees(2 * math.asin(math.sqrt(a))) * 60


def gc_interpolate(p, q, f: float):
    """Point at fraction f along the great circle p->q (slerp)."""
    la1, lo1, la2, lo2 = map(math.radians, (*p, *q))
    d = 2 * math.asin(math.sqrt(
        math.sin((la2 - la1) / 2) ** 2
        + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2))
    if d == 0:
        return p
    a = math.sin((1 - f) * d) / math.sin(d)
    b = math.sin(f * d) / math.sin(d)
    x = a * math.cos(la1) * math.cos(lo1) + b * math.cos(la2) * math.cos(lo2)
    y = a * math.cos(la1) * math.sin(lo1) + b * math.cos(la2) * math.sin(lo2)
    z = a * math.sin(la1) + b * math.sin(la2)
    return (math.degrees(math.atan2(z, math.hypot(x, y))),
            math.degrees(math.atan2(y, x)))


@dataclass
class Waypoint:
    name: str
    lat: float
    lon: float
    eto: datetime | None = None   # actual/planned time over; None = derive
    alt_ft: float | None = None


class Route:
    """Piecewise great-circle route with times at every waypoint.

    Between consecutive waypoints position is interpolated along the great
    circle and time linearly (constant ground speed per leg). Feed it real
    flight-plan fixes with ETOs and this becomes exact to the plan.
    """

    def __init__(self, wps: list[Waypoint], cruise_alt_ft: float,
                 climb_min: float = 20, descent_min: float = 25):
        self.wps = wps
        self.cruise = cruise_alt_ft
        self.climb_min, self.descent_min = climb_min, descent_min
        self._fill_times()

    def _fill_times(self):
        known = [i for i, w in enumerate(self.wps) if w.eto is not None]
        if known[0] != 0 or known[-1] != len(self.wps) - 1:
            raise ValueError("first and last waypoint need a time")
        cum = [0.0]
        for a, b in zip(self.wps, self.wps[1:]):
            cum.append(cum[-1] + gc_distance_nm((a.lat, a.lon), (b.lat, b.lon)))
        self.cum = cum
        for k0, k1 in zip(known, known[1:]):
            t0, t1 = self.wps[k0].eto, self.wps[k1].eto
            span = cum[k1] - cum[k0]
            for i in range(k0 + 1, k1):
                self.wps[i].eto = t0 + (t1 - t0) * ((cum[i] - cum[k0]) / span)

    @property
    def start(self):
        return self.wps[0].eto

    @property
    def end(self):
        return self.wps[-1].eto

    def state(self, t: datetime):
        """(lat, lon, alt_ft) at UTC t."""
        w = self.wps
        if t <= w[0].eto:
            i, f = 0, 0.0
        elif t >= w[-1].eto:
            i, f = len(w) - 2, 1.0
        else:
            i = max(k for k in range(len(w) - 1) if w[k].eto <= t)
            f = (t - w[i].eto) / (w[i + 1].eto - w[i].eto)
        lat, lon = gc_interpolate((w[i].lat, w[i].lon), (w[i + 1].lat, w[i + 1].lon), f)
        # simple vertical profile: linear climb/descent, else cruise
        from_dep = (t - self.start).total_seconds() / 60
        to_arr = (self.end - t).total_seconds() / 60
        alt = self.cruise * max(0.0, min(1.0, from_dep / self.climb_min,
                                         to_arr / self.descent_min))
        return lat, lon, alt


def densify(wps: list[Waypoint], n_extra: int) -> list[Waypoint]:
    """Insert n_extra points spread evenly (by distance) along the route."""
    if n_extra <= 0:
        return wps
    cum = [0.0]
    for a, b in zip(wps, wps[1:]):
        cum.append(cum[-1] + gc_distance_nm((a.lat, a.lon), (b.lat, b.lon)))
    total, out, j = cum[-1], [wps[0]], 1
    targets = [total * k / (n_extra + 1) for k in range(1, n_extra + 1)]
    for i in range(len(wps) - 1):
        while j <= n_extra and targets[j - 1] < cum[i + 1]:
            f = (targets[j - 1] - cum[i]) / (cum[i + 1] - cum[i])
            lat, lon = gc_interpolate((wps[i].lat, wps[i].lon),
                                      (wps[i + 1].lat, wps[i + 1].lon), f)
            out.append(Waypoint(f"WP{j:02d}", lat, lon))
            j += 1
        out.append(wps[i + 1])
    return out


# ---------------------------------------------------------------------------
# Event solver
# ---------------------------------------------------------------------------


def event_functions(conv: Convention, route: Route):
    """Each returns g(t); an event happens where g crosses 0 upward."""

    def alt_minus(target_fn):
        def g(t):
            lat, lon, h = route.state(t)
            alt, _, _ = sun_alt_and_ha(t, lat, lon)
            return alt - target_fn(h)
        return g

    def morning(fn):  # rising: alt - threshold goes - -> +
        return fn

    def evening(fn):  # setting: threshold - alt goes - -> +
        return lambda t: -fn(t)

    tw_dip = (lambda h: dip_deg(h)) if conv.dip_on_twilight else (lambda h: 0.0)

    def zuhr(t):
        lat, lon, _ = route.state(t)
        _, ha, _ = sun_alt_and_ha(t, lat, lon)
        return ha  # crosses 0 upward at local transit

    def asr(t):
        lat, lon, _ = route.state(t)
        alt, ha, dec = sun_alt_and_ha(t, lat, lon)
        zen_noon = abs(lat - math.degrees(dec))
        target = math.degrees(math.atan(1 / (conv.asr_factor + math.tan(math.radians(zen_noon)))))
        return (target - alt) if ha > 0 else -1.0  # afternoon only

    return {
        "Fajr": morning(alt_minus(lambda h: -conv.fajr_angle - tw_dip(h))),
        "Sunrise": morning(alt_minus(lambda h: -0.833 - dip_deg(h))),
        "Zuhr": zuhr,
        "Asr": asr,
        "Maghrib": evening(alt_minus(lambda h: -0.833 - dip_deg(h))),
        "Isha": evening(alt_minus(lambda h: -conv.isha_angle - tw_dip(h))),
    }


def find_events(route: Route, conv: Convention, step_s: int = 60):
    out = []
    fns = event_functions(conv, route)
    total = int((route.end - route.start).total_seconds())
    for name, g in fns.items():
        t_prev = route.start
        g_prev = g(t_prev)
        for s in range(step_s, total + step_s, step_s):
            t = route.start + timedelta(seconds=min(s, total))
            gv = g(t)
            # upward zero crossing; reject the +-180 deg hour-angle wrap
            if g_prev < 0 <= gv and abs(gv - g_prev) < 90:
                lo, hi = t_prev, t
                for _ in range(30):
                    mid = lo + (hi - lo) / 2
                    if g(mid) < 0:
                        lo = mid
                    else:
                        hi = mid
                te = hi + timedelta(minutes=conv.ihtiyat_min.get(name, 0))
                lat, lon, h = route.state(hi)
                out.append((te, name, lat, lon, h))
            t_prev, g_prev = t, gv
    return sorted(out)


def fmt_pos(lat, lon):
    def dm(v, w):
        a = abs(v)
        d = int(a)
        return f"{d:0{w}d}{(a - d) * 60:04.1f}"
    return f"{'N' if lat >= 0 else 'S'}{dm(lat, 2)} {'E' if lon >= 0 else 'W'}{dm(lon, 3)}"


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from", dest="orig", default="KUL")
    ap.add_argument("--to", dest="dest", default="LHR")
    ap.add_argument("--dep", default="2026-11-01T15:30Z", help="airborne time, UTC ISO")
    ap.add_argument("--duration", default="14:00", help="airborne duration hh:mm")
    ap.add_argument("--alt", type=float, default=35000, help="cruise altitude ft")
    ap.add_argument("--extra-waypoints", type=int, default=10)
    ap.add_argument("--convention", choices=CONVENTIONS, default="workbook")
    a = ap.parse_args()

    dep = datetime.fromisoformat(a.dep.replace("Z", "+00:00")).astimezone(timezone.utc)
    hh, mm = map(int, a.duration.split(":"))
    arr = dep + timedelta(hours=hh, minutes=mm)
    p0, p1 = parse_dm(STATIONS[a.orig]), parse_dm(STATIONS[a.dest])
    wps = densify([Waypoint(a.orig, *p0, eto=dep), Waypoint(a.dest, *p1, eto=arr)],
                  a.extra_waypoints)
    route = Route(wps, a.alt)
    conv = CONVENTIONS[a.convention]

    print(f"{a.orig}-{a.dest}  airborne {dep:%d %b %Y %H%MZ}  landing {arr:%H%MZ}  "
          f"FL{int(a.alt / 100)}  [{conv.name}]")
    print("\nRoute:")
    for w in route.wps:
        print(f"  {w.name:6} {fmt_pos(w.lat, w.lon)}  ETO {w.eto:%d/%H%MZ}")
    print("\nEvents along track:")
    for te, name, lat, lon, h in find_events(route, conv):
        print(f"  {name:8} {te:%d/%H%MZ}  at {fmt_pos(lat, lon)}  {h:6.0f} ft")


if __name__ == "__main__":
    main()
