param([int]$Port = 8081)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot 'deploy-service/data/local-runtime'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$occupied = $false
try { $null = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2; $occupied = $true } catch { if ($_.Exception.Response) { $occupied = $true } }
if ($occupied) { throw "Port $Port is already in use; inspect the existing service before starting another." }
$env:LOCAL_PORT = [string]$Port
$nodePath = (Get-Command node).Source
$scriptPath = Join-Path $PSScriptRoot 'local-product.cjs'
$process = Start-Process -FilePath $nodePath -ArgumentList @('"' + $scriptPath + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'supervisor.log') -RedirectStandardError (Join-Path $runtimeDir 'supervisor-error.log') -PassThru
Write-Output "Started local supervisor PID $($process.Id) at http://127.0.0.1:$Port (legacy worker paused; managed collector uses persisted console settings)"
