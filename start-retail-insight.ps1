$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$aiDir = Join-Path $root 'ai-service'
$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$logDir = Join-Path $root '.runtime-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Test-HttpOk([string]$Url, [hashtable]$Headers = @{}) {
  try { $response = Invoke-WebRequest -Uri $Url -Headers $Headers -TimeoutSec 3 -UseBasicParsing; return $response.StatusCode -eq 200 }
  catch { return $false }
}

function Start-Command([string]$Name, [string]$WorkingDirectory, [string]$Command) {
  $stdout = Join-Path $logDir "$Name.out.log"
  $stderr = Join-Path $logDir "$Name.err.log"
  Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d','/s','/c',"`"$Command`"") -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
  Write-Host "Started $Name (logs: .runtime-logs/$Name.*.log)"
}

$python = Join-Path $aiDir '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) { $python = Join-Path $aiDir 'venv\Scripts\python.exe' }
if (-not (Test-Path $python)) { $python = (Get-Command python -ErrorAction Stop).Source }
$token = ''
$aiEnv = Join-Path $aiDir '.env'
if (Test-Path $aiEnv) {
  $tokenLine = Get-Content $aiEnv | Where-Object { $_ -match '^\s*AI_SERVICE_TOKEN\s*=' } | Select-Object -First 1
  if ($tokenLine) { $token = ($tokenLine -replace '^\s*AI_SERVICE_TOKEN\s*=\s*','').Trim().Trim('"').Trim("'") }
}
$aiHeaders = @{}
if ($token) { $aiHeaders.Authorization = "Bearer $token" }

if (-not (Test-HttpOk 'http://127.0.0.1:8000/health')) { Start-Command 'ai-service' $aiDir "`"$python`" run.py" }
if (-not (Test-HttpOk 'http://127.0.0.1:3000/api/health')) { Start-Command 'backend' $backendDir 'npm.cmd run dev' }
if (-not (Test-HttpOk 'http://127.0.0.1:5173/')) { Start-Command 'frontend' $frontendDir 'npm.cmd run dev' }

$checks = @(
  @{Name='AI FastAPI'; Url='http://127.0.0.1:8000/health'},
  @{Name='Backend + database'; Url='http://127.0.0.1:3000/api/health'},
  @{Name='Frontend Vite'; Url='http://127.0.0.1:5173/'}
)
$deadline = (Get-Date).AddSeconds(90)
do {
  $pending = @($checks | Where-Object { -not (Test-HttpOk $_.Url) })
  if ($pending.Count -eq 0) { break }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)

if ($pending.Count -gt 0) {
  Write-Host 'Some services did not become healthy:' -ForegroundColor Red
  foreach ($check in $pending) { Write-Host "  NOT READY: $($check.Name) at $($check.Url)" -ForegroundColor Red }
  Write-Host 'Check .runtime-logs/*.err.log. Backend health also requires MySQL on the configured host.'
  exit 1
}
if (-not (Test-HttpOk 'http://127.0.0.1:8000/v1/readiness' $aiHeaders)) {
  Write-Host 'AI /v1/readiness failed. Check AI_SERVICE_TOKEN in ai-service/.env.' -ForegroundColor Red
  exit 1
}

Write-Host 'All three services are ready (HTTP 200):' -ForegroundColor Green
foreach ($check in $checks) { Write-Host "  200 OK  $($check.Name)  $($check.Url)" -ForegroundColor Green }
$readiness = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/v1/readiness' -Headers $aiHeaders -TimeoutSec 5
Write-Host '  200 OK  AI model readiness  http://127.0.0.1:8000/v1/readiness' -ForegroundColor Green
foreach ($model in @('hybrid','stockout')) {
  $status = $readiness.models.$model.status
  $color = if ($status -eq 'READY') { 'Green' } else { 'Yellow' }
  Write-Host "  Model $model`: $status" -ForegroundColor $color
}
foreach ($algorithm in $readiness.algorithms.PSObject.Properties) { Write-Host "  Algorithm $($algorithm.Name)`: $($algorithm.Value)" }
Write-Host 'Open http://localhost:5173'
