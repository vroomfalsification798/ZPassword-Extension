# Thin wrapper - the real build is build.mjs, so it behaves identically
# on Linux/macOS (build.sh) and Windows.
#
# If PowerShell refuses to run this, it is the execution policy, not the script:
#   powershell -ExecutionPolicy Bypass -File .\build.ps1
$ErrorActionPreference = 'Stop'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error 'Node.js is required. Install it from https://nodejs.org and try again.'
    exit 1
}

node (Join-Path $PSScriptRoot 'build.mjs') @args
exit $LASTEXITCODE
