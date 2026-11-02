# Security

## Reporting a vulnerability

Please do **not** open a public issue for a security problem. Use GitHub's private reporting:
**Security → Report a vulnerability** on this repository. Include what you found, how to reproduce it and
which version you tested. You will get an answer as soon as the maintainer sees it; this is a hobby project
and there is no guaranteed response time.

## What the app does, so you can judge the risk

- Talks to the G435 USB dongle (`046D:0ACB`) through the Windows HID API, using only the commands in
  [docs/battery.md](docs/battery.md). No administrator rights are needed or requested.
- Changes the volume and mute state of the G435 audio devices through Windows Core Audio.
- Stores two small JSON files in `%APPDATA%\local.g435hub\` (battery history and settings).
- Optionally writes one value under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` ("start with Windows").
- **Network:** the only request is the update check to `github.com`, made when the window opens, and it can be
  switched off in Settings. Nothing is sent about you or your device beyond what any HTTPS request carries.
- Opens links in your browser only for the project's own pages and the credited sources.

## Updates

Update packages are signed with a key whose public half is in `hub/tauri.conf.json`; the app refuses a package
whose signature does not match. The installers themselves are **not** code-signed with a Windows certificate, so
SmartScreen warns on first run. Verify a download against `SHA256SUMS.txt` in the release, or build it yourself.
