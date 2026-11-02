# Contributing

Thanks for helping. This is a small project run by one person, so a short, focused pull request is the easiest to review.

## The most useful contribution: try it on your headset

The app was built and tested on **one** G435 with dongle `046D:0ACB`. If you have a G435, install the
[latest release](https://github.com/minchiki/g435-hub/releases/latest), use it for a few days and open an issue
with what you saw. In **Settings → Support → Copy** the app gives you a diagnostics text to paste into the issue.
Reports of "works" are as valuable as bug reports.

## Ground rules

- **The app only sends the six documented commands to the dongle** (see [docs/battery.md](docs/battery.md)).
  A pull request that sends any other vendor command needs the captured traffic that shows what it does,
  and a test on a real device.
- **Say what you could not verify.** If a change touches the dongle, audio or the tray and you could not try it
  on real hardware, write that in the pull request.
- **No unverified claims** in the README, the docs or the UI ("faster", "free of X", "works with Y").
- Both interface languages stay in step: every new string goes into `hub/ui/i18n.js` in English and Russian.

## Setting up

You need Rust (stable, MSVC toolchain) and Node.js 20+.

```powershell
git clone https://github.com/minchiki/g435-hub
cd g435-hub/hub
cargo run --release               # runs the app with the interface from hub/ui
cargo fmt --check
cargo clippy --release --all-targets -- -D warnings
cargo test --release
node ../scripts/check_i18n.mjs    # both languages have the same keys, no key is missing
```

The same checks run on every pull request. The interface is plain HTML, CSS and JavaScript in `hub/ui`
(no build step); `hub/ui/components.html` shows every component in every state in light and dark themes.

To preview the interface without the app, serve `hub/ui` with any static server and open
`index.html?state=charging&theme=dark&lang=ru` (states: `nodongle`, `off`, `loading`, `empty`, `charging`).
The preview uses sample data.

## Changing the battery estimate

`hub/src/battery.rs` has unit tests built from real discharge and charge data. A change to the estimate
should add a test from real readings (the app's history is in `%APPDATA%\local.g435hub\battery-history.json`).

## Releases

Maintainers: update `CHANGELOG.md`, bump the version in `hub/Cargo.toml` and `hub/tauri.conf.json`, then push a
tag `vX.Y.Z`. The workflow builds, signs the update package, and publishes the release.
