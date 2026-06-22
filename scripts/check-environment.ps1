$projectRoot = Split-Path -Parent $PSScriptRoot
if (Test-Path "$projectRoot\.tools\rustup") {
  $env:RUSTUP_HOME = "$projectRoot\.tools\rustup"
  $env:CARGO_HOME = "$projectRoot\.tools\cargo"
}

$tools = @(
  @{ Name = "Git"; Command = "git"; Fallback = "$projectRoot\.tools\git\cmd\git.exe"; Arguments = "--version" },
  @{ Name = "Node.js"; Command = "node"; Fallback = "$projectRoot\.tools\node\node.exe"; Arguments = "--version" },
  @{ Name = "npm"; Command = "npm"; Fallback = "$projectRoot\.tools\node\npm.cmd"; Arguments = "--version" },
  @{ Name = "Rust"; Command = "rustc"; Fallback = "$projectRoot\.tools\cargo\bin\rustc.exe"; Arguments = "--version" },
  @{ Name = "Cargo"; Command = "cargo"; Fallback = "$projectRoot\.tools\cargo\bin\cargo.exe"; Arguments = "--version" },
  @{ Name = "Ollama"; Command = "ollama"; Fallback = ""; Arguments = "--version" }
)

foreach ($tool in $tools) {
  $command = Get-Command $tool.Command -ErrorAction SilentlyContinue
  $executable = if ($command) {
    $command.Source
  } elseif ($tool.Fallback -and (Test-Path $tool.Fallback)) {
    $tool.Fallback
  } else {
    $null
  }
  if ($executable) {
    $version = & $executable $tool.Arguments 2>$null
    Write-Host "[OK] $($tool.Name): $version" -ForegroundColor Green
  } else {
    Write-Host "[FALTA] $($tool.Name)" -ForegroundColor Yellow
  }
}

$vswhere = "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
  $buildTools = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if ($buildTools) {
    Write-Host "[OK] Visual Studio Build Tools: $buildTools" -ForegroundColor Green
  } else {
    Write-Host "[FALTA] C++ Desktop Development" -ForegroundColor Yellow
  }
} else {
  Write-Host "[FALTA] Visual Studio Build Tools" -ForegroundColor Yellow
}
