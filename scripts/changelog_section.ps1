# Prints the CHANGELOG.md section for a version ("## [1.1.0] - date" up to the next "## ").
# Used by the release workflow for the update manifest and the release notes.
param([Parameter(Mandatory)][string]$Version)
$lines = Get-Content -Encoding utf8 (Join-Path $PSScriptRoot '..\CHANGELOG.md')
$out = @(); $inside = $false
foreach ($l in $lines) {
  if ($l -match '^## \[') {
    if ($inside) { break }
    $inside = $l -match "^## \[$([regex]::Escape($Version))\]"
    continue
  }
  if ($inside) { $out += $l }
}
if (-not $out) { throw "no CHANGELOG section for $Version" }
($out -join "`n").Trim()
