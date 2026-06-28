#!/usr/bin/env bash
# ============================================================
#  Lanzador del monorepo LoL — para Git Bash / WSL en Windows
#  Equivalente a start.ps1
# ============================================================
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Convierte ruta POSIX a ruta Windows (necesario para PowerShell)
to_win_path() {
  cygpath -w "$1" 2>/dev/null || wslpath -w "$1" 2>/dev/null || echo "$1"
}

free_port_4317() {
  echo "[backoffice] Liberando el puerto 4317..."
  local pids
  pids=$(netstat.exe -ano 2>/dev/null | grep -E ':4317[[:space:]].*LISTENING' | awk '{print $NF}' | sort -u) || true
  for pid in $pids; do
    [[ -n "$pid" ]] && taskkill.exe /F /PID "$pid" 2>/dev/null || true
  done
  sleep 0.5
}

start_in_window() {
  local title="$1"
  local dir
  dir=$(to_win_path "$2")
  powershell.exe -NonInteractive -Command "
    Start-Process powershell -ArgumentList @(
      '-NoExit', '-Command',
      \"\`\$host.UI.RawUI.WindowTitle='$title'; Set-Location '$dir'; if (-not (Test-Path node_modules)) { Write-Host 'Instalando dependencias...' -ForegroundColor Yellow; npm install }; npm start\"
    )
  "
}

echo ""
echo "  League tools - que quieres iniciar?"
echo "    1) App de escritorio (overlay)"
echo "    2) Back office (web de analitica - http://localhost:4317)"
echo "    3) Ambos"
echo "    q) Salir"
echo ""
read -rp "Opcion: " choice

case "$choice" in
  1) start_app=1; start_bo=0 ;;
  2) start_app=0; start_bo=1 ;;
  3) start_app=1; start_bo=1 ;;
  *) echo "Cancelado."; exit 0 ;;
esac

[[ $start_bo -eq 1 ]] && free_port_4317

if [[ $start_app -eq 1 ]]; then
  echo "[app] Arrancando la app de escritorio..."
  start_in_window "App de escritorio (overlay)" "$ROOT/app-desktop"
fi

if [[ $start_bo -eq 1 ]]; then
  echo "[backoffice] Arrancando el back office..."
  start_in_window "Back office" "$ROOT/backoffice"
  echo "[backoffice] Cuando compile, abre: http://localhost:4317"
fi

echo ""
echo "Listo. Cada proceso corre en su propia ventana."
