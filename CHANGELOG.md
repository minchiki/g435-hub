# Changelog

All notable changes to G435 Hub. The format follows [Keep a Changelog](https://keepachangelog.com/) and versions follow [SemVer](https://semver.org/).

## [1.1.0] - 2026-11-02

### Added
- **English interface.** The language follows Windows by default and can be switched in Settings. The tray menu, the tray tooltip and the low-battery notification are translated too.
- **In-app updates.** Settings → Updates asks GitHub for a newer version when the window opens (this can be switched off) and installs it after you confirm. Update packages are signed.
- **Diagnostics.** Settings → Support copies a short report for bug reports: versions, dongle state and the last readings, with no personal data.
- A report-a-problem link, issue templates, a changelog, and contributing and security notes.
- CI on every pull request (formatting, clippy, tests, translation check) and a weekly dependency audit.

### Changed
- Charging detection also catches slow charging (a rise of 45 mV within 30 minutes), not only a jump of 30 mV between two readings.
- The percentage no longer lags above the truth at the end of a discharge (2 % was shown at 3318 mV).
- "Time left" is computed from the last 2 hours of the discharge instead of the whole run.
- A battery read is retried once after a failure.
- The chart breaks the line across gaps longer than 2 hours instead of drawing a straight line through them.
- Errors from the dongle reach the interface as codes and are translated there.

### Fixed
- Windows 11 is reported as Windows 11 in the diagnostics.

## [1.0.0] - 2026-11-02

First build: battery level with an estimate of the time left, the charge in the tray icon, volume and mute for the G435 devices, a 3D model in three colourways, light and dark themes, start with Windows, installers (NSIS, MSI) and a portable zip.
