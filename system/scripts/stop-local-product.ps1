$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $projectRoot 'deploy-service/data/local-runtime/processes.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Output 'No local supervisor receipt exists.'; exit 0 }
$receipt = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$supervisor = Get-CimInstance Win32_Process -Filter "ProcessId=$($receipt.supervisorPid)"
if ($supervisor -and $supervisor.CommandLine -notmatch [regex]::Escape((Join-Path $PSScriptRoot 'local-product.cjs'))) { throw 'Supervisor PID belongs to a different command; refusing to stop it.' }
$ownedChildren = @()
foreach ($child in $receipt.children) {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$($child.pid)"
    if (-not $processInfo) { continue }
    if ($processInfo.ParentProcessId -ne $receipt.supervisorPid -or $processInfo.CommandLine -notmatch [regex]::Escape((Join-Path $projectRoot 'deploy-service'))) { throw 'Child process identity changed; refusing to stop unrelated processes.' }
    $ownedChildren += $child.pid
}
if ($supervisor) { Stop-Process -Id $receipt.supervisorPid }
foreach ($ownedPid in $ownedChildren) { Stop-Process -Id $ownedPid -ErrorAction SilentlyContinue }
Write-Output 'Stopped the verified local supervisor and its owned service processes.'
