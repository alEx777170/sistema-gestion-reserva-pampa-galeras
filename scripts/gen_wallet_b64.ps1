# gen_wallet_b64.ps1 - Genera la variable secreta WALLET_B64 para Render
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\gen_wallet_b64.ps1
#
# 1. Comprime backend\wallet en un zip temporal.
# 2. Convierte el zip en base64 (una sola línea).
# 3. La guarda en wallet_b64.txt (para copiar y pegar en Render).
#
# En Render: Environment → Add Environment Variable →
#   Key: WALLET_B64   Value: (pegar el contenido de wallet_b64.txt)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$wallet = Join-Path $raiz 'backend\wallet'

if (-not (Test-Path (Join-Path $wallet 'tnsnames.ora'))) {
    Write-Error "No se encuentra el wallet en $wallet (falta tnsnames.ora)."
}

$zip = Join-Path $env:TEMP 'adb_wallet_tmp.zip'
if (Test-Path $zip) { Remove-Item $zip }

Compress-Archive -Path (Join-Path $wallet '*') -DestinationPath $zip -Force
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($zip))
Remove-Item $zip

$salida = Join-Path $raiz 'wallet_b64.txt'
Set-Content -Path $salida -Value $b64 -NoNewline

$kb = [math]::Round($b64.Length / 1024, 1)
Write-Host "Wallet comprimido: $kb KB de base64"
Write-Host "Listo. Copia el contenido de wallet_b64.txt y pegalo en Render como variable WALLET_B64."
Write-Host "(wallet_b64.txt esta en .gitignore: NO se sube al repositorio)"
