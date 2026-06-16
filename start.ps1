# ============================================================
#  Lanzador del monorepo LoL.
#  Pregunta qué arrancar: la app de escritorio (overlay), el
#  back office (web de analítica), o ambos. Si se arranca el
#  back office, primero libera el puerto 4317 (limpieza).
#  Cada cosa arranca en su propia ventana.
# ============================================================
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Free-Port4317 {
  Write-Host "[backoffice] Liberando el puerto 4317..." -ForegroundColor Yellow
  try {
    Get-NetTCPConnection -LocalPort 4317 -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique |
      ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
  } catch { }
  Start-Sleep -Milliseconds 500
}

# Arranca `npm start` en una ventana nueva (instala dependencias si faltan).
function Start-In-Window([string]$title, [string]$dir) {
  $inner = "`$host.UI.RawUI.WindowTitle='$title'; Set-Location '$dir'; " +
           "if (-not (Test-Path node_modules)) { Write-Host 'Instalando dependencias...' -ForegroundColor Yellow; npm install }; " +
           "npm start"
  Start-Process powershell -ArgumentList @('-NoExit', '-Command', $inner)
}

Write-Host ""
Write-Host "  League tools - que quieres iniciar?" -ForegroundColor Green
Write-Host "    1) App de escritorio (overlay)"
Write-Host "    2) Back office (web de analitica - http://localhost:4317)"
Write-Host "    3) Ambos"
Write-Host "    q) Salir"
Write-Host ""
$choice = Read-Host "Opcion"

$startApp = $choice -eq '1' -or $choice -eq '3'
$startBo  = $choice -eq '2' -or $choice -eq '3'

if (-not $startApp -and -not $startBo) {
  Write-Host "Cancelado." -ForegroundColor DarkGray
  return
}

# Limpieza: solo cuando se arranca el back office.
if ($startBo) { Free-Port4317 }

if ($startApp) {
  Write-Host "[app] Arrancando la app de escritorio..." -ForegroundColor Cyan
  Start-In-Window 'App de escritorio (overlay)' "$root\app-desktop"
}
if ($startBo) {
  Write-Host "[backoffice] Arrancando el back office..." -ForegroundColor Cyan
  Start-In-Window 'Back office' "$root\backoffice"
  Write-Host "[backoffice] Cuando compile, abre: http://localhost:4317" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Listo. Cada proceso corre en su propia ventana." -ForegroundColor Green
