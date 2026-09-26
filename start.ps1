$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.env')) { throw 'Configure o arquivo .env antes de iniciar.' }
if (-not (Test-Path -LiteralPath 'node_modules')) { npm ci; if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependencias.' } }
$env:NODE_USE_SYSTEM_CA = '1'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'A compilacao falhou. O servidor nao foi iniciado.' }
Write-Host 'IRIS em http://127.0.0.1:8081 (ou a porta configurada no .env). Use Ctrl+C para encerrar.'
npm start
