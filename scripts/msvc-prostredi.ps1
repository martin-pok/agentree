# Prostředí Visual Studia (cl.exe, rc.exe, link.exe, SDK) pro další kroky jobu v GitHub Actions.
# Nahrazuje akci ilammy/msvc-dev-cmd, která od dubna 2024 nedostala vydání a běží na vyřazeném
# Node 20. Dělá totéž bez cizího kódu: najde Visual Studio přes vswhere (součást runneru Windows),
# spustí jeho VsDevCmd.bat pro x64 a změněné proměnné zapíše do GITHUB_ENV.
$ErrorActionPreference = 'Stop'

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path $vswhere)) { throw "Chybí vswhere.exe ($vswhere)." }
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw 'Nenašlo se Visual Studio s nástroji C++ pro x64.' }
$devCmd = Join-Path $vs 'Common7\Tools\VsDevCmd.bat'
if (-not (Test-Path $devCmd)) { throw "Chybí $devCmd." }

$pred = @{}
Get-ChildItem env: | ForEach-Object { $pred[$_.Name] = $_.Value }
$po = & cmd.exe /d /c "`"$devCmd`" -arch=x64 -host_arch=x64 -no_logo && set"
if ($LASTEXITCODE -ne 0) { throw "VsDevCmd.bat skončil s kódem $LASTEXITCODE." }

$zmeny = 0
foreach ($radek in $po) {
  if ($radek -match '^([^=]+)=(.*)$' -and $pred[$Matches[1]] -cne $Matches[2]) {
    "$($Matches[1])=$($Matches[2])" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
    $zmeny++
  }
}
if ($zmeny -eq 0) { throw 'VsDevCmd.bat nezměnil žádnou proměnnou prostředí.' }
Write-Host "Visual Studio: $vs ($zmeny proměnných)"
