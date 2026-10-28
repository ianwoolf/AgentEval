#Requires -RunAsAdministrator
# Recreate WSL/HNS NAT state without deleting distros, containers, clusters or data.
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $workspace 'data/wsl-network-repair.log'
$dockerCli = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
function Log([string]$message) { "$(Get-Date -Format o) $message" | Out-File -LiteralPath $logPath -Append -Encoding utf8 }
New-Item -ItemType Directory -Path (Split-Path -Parent $logPath) -Force | Out-Null
try {
    Log 'Stopping Docker Desktop before WSL network repair'
    & $dockerCli desktop stop --timeout 90 2>&1 | Out-File -LiteralPath $logPath -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop did not stop; aborting network repair' }
    Log 'Shutting down WSL'
    wsl.exe --shutdown
    if ($LASTEXITCODE -ne 0) { throw 'WSL shutdown failed' }
    Log 'Restarting HNS and Windows NAT'
    Restart-Service hns -Force
    Restart-Service winnat
    Log 'Starting Docker Desktop'
    & $dockerCli desktop start --timeout 120 2>&1 | Out-File -LiteralPath $logPath -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop did not finish starting' }
    Log 'Repair complete; external connectivity still requires verification'
} catch {
    Log "Failed: $($_.Exception.Message)"
    exit 1
}
