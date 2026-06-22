param(
  [ValidateSet("dev", "build", "test", "tauri-dev", "tauri-build")]
  [string]$Action = "dev"
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeRoot = "$projectRoot\.tools\node"
$cargoRoot = "$projectRoot\.tools\cargo"
$rustupRoot = "$projectRoot\.tools\rustup"

if (-not (Test-Path "$nodeRoot\npm.cmd")) {
  throw "No se encontró Node portable. Instalá Node.js LTS o revisá docs/SETUP.md."
}

$env:PATH = "$nodeRoot;$cargoRoot\bin;$env:PATH"
$env:CARGO_HOME = $cargoRoot
$env:RUSTUP_HOME = $rustupRoot

Set-Location $projectRoot

switch ($Action) {
  "dev" { & "$nodeRoot\npm.cmd" run dev }
  "build" { & "$nodeRoot\npm.cmd" run build }
  "test" { & "$nodeRoot\npm.cmd" test }
  "tauri-dev" { & "$nodeRoot\npm.cmd" run tauri dev }
  "tauri-build" { & "$nodeRoot\npm.cmd" run tauri build }
}

exit $LASTEXITCODE
