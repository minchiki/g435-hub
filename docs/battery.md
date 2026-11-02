# Reading the G435 battery (046D:0ACB)

**English** · [Русский](battery.ru.md)

**It works** on our unit (2026-11-01): `python scripts/battery.py` prints the battery voltage in mV
and an estimated percentage. No administrator rights needed.

The protocol was not derived from our own captures: the headset never sends its charge by itself
(a USB capture of button and volume presses contains no battery packets), and Logitech ships no
software for the G435. Sources are
[deddroid/logitech-g435-battery](https://github.com/deddroid/logitech-g435-battery) (MIT, verified by
its author on 0ACB) and [endes' write-up](https://dev.to/endes/usb-hid-down-the-rabbit-hole-logitech-g435-dongle-33if)
of the official firmware updater. See `THIRD-PARTY-NOTICES`.

## Exchange (vendor collection FFC0, report 6, 64-byte feature reports)

| Step | Sent | Reply from our dongle |
|---|---|---|
| Enter bridge mode | SET_FEATURE `06 01 03` | input `06 5A` (OK) |
| REMOTE_GET_CONNECT_STATUS | `06 04 03 06` + `50 41 0E 01 01 E3` | GET_FEATURE `… 02 00 E3 01`: linked |
| REMOTE_GET_MODE | `… 50 41 0E 02 01 E0` | `… 02 00 E0 00`: mode 0 (initial) |
| REMOTE_SET_MODE 1 | `… 50 41 0E 03 02 E1 01` | ACK `5A` |
| OTA GET_BATTERY | `… 50 41 06 04 01 00 31` | `07 00 06 84 00 B8 0E` → 0x0EB8 = 3768 mV |
| Leave bridge mode | `06 08 03` | `06 5A` |

- Mode 1 persists: on the next read GET_MODE returned 1 (until the dongle is replugged: not checked).
  In mode 0 the dongle answers GET_BATTERY itself with a meaningless value; `battery.py` only
  switches the mode with `--allow-set-mode`.
- Audio may drop for about a second while reading (per deddroid).
- The percentage is an **estimate** from a Li-Po curve and is too high while charging.
  Readings of 3768 and 3789 mV (≈ 49–53 %) with a green LED (Logitech: 31–100 %).

The app only ever sends the commands in the table. Unknown vendor commands are never sent.

## Estimation in the app (hub/src/battery.rs)

Measured 2026-11-01: 8 GET_BATTERY requests in a row within one session gave 3741…3750 mV (±5 mV);
between sessions at different times the spread was up to ~20 mV (3768 → 3789) because of load.

- **Median of 3 readings** per bridge session instead of a single value.
- **Smoothing:** the percentage comes from the median of the last ≤ 3 readings within 45 min of the
  current discharge run, and the displayed value never rises while discharging. If the latest
  reading is ≥ 15 mV below the median (a fast fall at the end of a discharge) it is used as is;
  otherwise the median showed 2 % at 3318 mV, when the headset was already dead.
- **Charging flag** is an inference, not a device signal: a rise of ≥ 30 mV between neighbouring
  readings, **or ≥ 45 mV above the minimum of the last 30 min** (charging moves in small steps of
  +3…+27 mV; discharge noise is up to ±9 mV). It holds until the voltage falls by more than 15 mV.
  The first reading after a gap longer than 2 h is not treated as charging, because one reading
  cannot tell. A gap also lifts the "never rises" rule (the headset may have been charged while the
  app was closed). The percentage while charging is too high: voltage under charge current is above
  the resting voltage, and by how much has not been measured.
- **Time left:** least squares over the last 2 h of the discharge run (discharge accelerates towards
  the end: about 4× in the overnight data), or over the whole run if the last 2 h are unusable
  (≥ 3 readings over ≥ 40 min, slope steeper than −0.5 %/h); otherwise the nominal 18 h × percentage.
  The source is labelled in the UI.
- **Reads are retried** once after 1.2 s on no reply or an HID error. "Headset off" is not retried.
- **The chart** breaks the line across gaps longer than 2 h.
- **History:** `%APPDATA%\local.g435hub\battery-history.json`, 7 days. After a restart a fresh
  (≤ 2 h) reading is shown immediately, with no new read and no audio glitch.
- **Silence:** a scheduled read waits while the G435 playback peak level is > 0.001
  (IAudioMeterInformation), for at most 30 min. A manual refresh reads at once.
- **Frequency:** at ≤ 20 % and while charging, polling is at least every 5 min; 3 s after the dongle
  is plugged in.
- **Notifications:** Windows toast at 15 % and 5 % (once per discharge).

## Curve calibration (night of 2026-11-02)

The headset sat powered on with no audio from 23:42 until it switched itself off at 07:00 (3318 mV);
after being switched on it ran at 3306–3324 mV and shut off again. The bottom of the curve comes from
this run: time to shutdown as a fraction of the nominal 18 h.

| mV | time to shutdown | % (of 18 h) | old curve |
|---:|---:|---:|---:|
| 3750 | 7.3 h | 41 | 45 |
| 3700 | 4.8 h | 27 | 35 |
| 3690 | 3.0 h | 17 | 33 |
| 3650 | 1.6 h | 9 | 25 |
| 3600 | 1.3 h | 7 | 15 |
| 3500 | 0.7 h | 4 | 5 |
| 3400 | 0.2 h | 1 | 0 |

Zero is now at 3300 mV (it was 3400). Limits: one unit, one discharge, idle with no audio; the
3700–3720 mV plateau lasted ~3 h, so the percentage is coarse in that range. A hypothesis from the
same night: polling every 5 min kept resetting the headset's 30-minute auto-off, so after 20 min
without audio the app polls at most once an hour.
