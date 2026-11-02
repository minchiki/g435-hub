# Writes winget and Scoop manifests for a release from its SHA256SUMS.txt.
#   pwsh packaging/make-manifests.ps1 -Version 1.1.0 -Repo minchiki/g435-hub -Sums SHA256SUMS.txt -Out packaging-out
# winget: copy packaging-out/winget/* to manifests/m/Minchiki/G435Hub/<version>/ in a fork of microsoft/winget-pkgs
#         and open a pull request (needs a public release).
# Scoop:  add packaging-out/scoop/g435-hub.json to a bucket.
param(
  [Parameter(Mandatory)][string]$Version,
  [Parameter(Mandatory)][string]$Repo,
  [Parameter(Mandatory)][string]$Sums,
  [Parameter(Mandatory)][string]$Out
)
$ErrorActionPreference = 'Stop'
$sum = @{}
Get-Content -Encoding utf8 $Sums | ForEach-Object { $h, $n = $_ -split '\s+', 2; $sum[$n.Trim()] = $h.ToUpper() }
$setup = "G435-Hub_${Version}_x64-setup.exe"
$zip = "G435-Hub_${Version}_x64-portable.zip"
$base = "https://github.com/$Repo/releases/download/v$Version"
New-Item -ItemType Directory -Force "$Out/winget", "$Out/scoop" | Out-Null
$id = 'Minchiki.G435Hub'

@"
# yaml-language-server: `$schema=https://aka.ms/winget-manifest.version.1.6.0.schema.json
PackageIdentifier: $id
PackageVersion: $Version
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.6.0
"@ | Set-Content "$Out/winget/$id.yaml" -Encoding utf8

@"
# yaml-language-server: `$schema=https://aka.ms/winget-manifest.defaultLocale.1.6.0.schema.json
PackageIdentifier: $id
PackageVersion: $Version
PackageLocale: en-US
Publisher: G435 Hub
PackageName: G435 Hub
PackageUrl: https://github.com/$Repo
License: MIT
LicenseUrl: https://github.com/$Repo/blob/main/LICENSE
ShortDescription: Battery level, volume and a 3D model for the Logitech G435 LIGHTSPEED headset.
Description: A lightweight alternative to Logitech G HUB for the G435 headset (dongle 046D:0ACB). Shows the battery level and an estimate of the time left, controls volume and keeps the charge in the tray. Unofficial, not affiliated with Logitech.
Tags:
- logitech
- g435
- headset
- battery
ManifestType: defaultLocale
ManifestVersion: 1.6.0
"@ | Set-Content "$Out/winget/$id.locale.en-US.yaml" -Encoding utf8

@"
# yaml-language-server: `$schema=https://aka.ms/winget-manifest.installer.1.6.0.schema.json
PackageIdentifier: $id
PackageVersion: $Version
InstallerType: nullsoft
Scope: user
InstallModes:
- interactive
- silent
- silentWithProgress
Installers:
- Architecture: x64
  InstallerUrl: $base/$setup
  InstallerSha256: $($sum[$setup])
ManifestType: installer
ManifestVersion: 1.6.0
"@ | Set-Content "$Out/winget/$id.installer.yaml" -Encoding utf8

[ordered]@{
  version = $Version
  description = 'Battery level, volume and a 3D model for the Logitech G435 LIGHTSPEED headset.'
  homepage = "https://github.com/$Repo"
  license = 'MIT'
  architecture = [ordered]@{ '64bit' = [ordered]@{ url = "$base/$zip"; hash = $sum[$zip].ToLower() } }
  bin = 'G435 Hub.exe'
  shortcuts = @(, @('G435 Hub.exe', 'G435 Hub'))
  checkver = 'github'
  autoupdate = [ordered]@{ architecture = [ordered]@{ '64bit' = [ordered]@{ url = "https://github.com/$Repo/releases/download/v`$version/G435-Hub_`${version}_x64-portable.zip" } } }
} | ConvertTo-Json -Depth 6 | Set-Content "$Out/scoop/g435-hub.json" -Encoding utf8
Write-Host "manifests written to $Out"
