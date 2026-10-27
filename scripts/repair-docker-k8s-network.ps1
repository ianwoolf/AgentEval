#Requires -RunAsAdministrator
# Restart NAT and Docker Desktop without resetting Kubernetes or deleting volumes.
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $workspace 'data/docker-k8s-network-repair.log'
New-Item -ItemType Directory -Path (Split-Path -Parent $logPath) -Force | Out-Null
try {
    "$(Get-Date -Format o) Restarting Windows NAT" | Out-File -LiteralPath $logPath -Encoding utf8
    Restart-Service -Name winnat -ErrorAction Stop
    netsh interface ipv4 show excludedportrange protocol=tcp | Out-File -LiteralPath $logPath -Append -Encoding utf8
    "$(Get-Date -Format o) Restarting Docker Desktop" | Out-File -LiteralPath $logPath -Append -Encoding utf8
    & 'C:\Program Files\Docker\Docker\resources\bin\docker.exe' desktop restart --timeout 90 2>&1 |
        Out-File -LiteralPath $logPath -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop restart did not finish successfully' }
    "$(Get-Date -Format o) Docker Desktop restarted" | Out-File -LiteralPath $logPath -Append -Encoding utf8
} catch {
    "$(Get-Date -Format o) Failed: $($_.Exception.Message)" | Out-File -LiteralPath $logPath -Append -Encoding utf8
    exit 1
}
