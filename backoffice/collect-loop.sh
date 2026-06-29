#!/bin/sh
# Corre el colector en un bucle infinito sobre múltiples regiones secuencialmente.
# REGIONS: lista separada por comas, ej: la2,la1,na1,br1,euw1,kr
# MAX_MATCHES: total repartido equitativamente entre regiones.

REGIONS="${REGIONS:-la2}"
MAX_MATCHES="${MAX_MATCHES:-50000}"
MATCHES_PER_PLAYER="${MATCHES_PER_PLAYER:-15}"
PLAYERS_PER_BUCKET="${PLAYERS_PER_BUCKET:-40}"
RETRY_DELAY_S="${RETRY_DELAY_S:-30}"
TIERS="${TIERS:-}"
START_TIME="${START_TIME:-}"
END_TIME="${END_TIME:-}"

# Contar cuántas regiones hay para repartir MAX_MATCHES
region_count=0
for r in $(echo "$REGIONS" | tr ',' ' '); do
  region_count=$((region_count + 1))
done
PER_REGION=$((MAX_MATCHES / region_count))

echo "=== Collect loop ==="
echo "  Regiones:         $REGIONS ($region_count)"
echo "  Max total:        $MAX_MATCHES  →  $PER_REGION por región"
echo "  Por jugador:      $MATCHES_PER_PLAYER"
echo "  Players/bucket:   $PLAYERS_PER_BUCKET"
echo "  Rangos:           ${TIERS:-todos}"
echo "  Desde (epoch):    ${START_TIME:-sin límite}"
echo "  Hasta (epoch):    ${END_TIME:-sin límite}"
echo "  Delay reinicio:   ${RETRY_DELAY_S}s"
echo "===================="

run_collect() {
  REGION="$1"
  echo ""
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando collect → $REGION ($PER_REGION partidas)..."

  ARGS="--region $REGION --max $PER_REGION --per-player $MATCHES_PER_PLAYER --players-per-bucket $PLAYERS_PER_BUCKET"

  if [ -n "$TIERS" ]; then
    ARGS="$ARGS --tiers $TIERS"
  fi
  if [ -n "$START_TIME" ]; then
    ARGS="$ARGS --start-time $START_TIME"
  fi
  if [ -n "$END_TIME" ]; then
    ARGS="$ARGS --end-time $END_TIME"
  fi

  # shellcheck disable=SC2086
  node dist/collector/index.js collect $ARGS

  EXIT_CODE=$?
  if [ "$EXIT_CODE" -ne 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$REGION] Falló (exit $EXIT_CODE). Continuando con siguiente región..."
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$REGION] Completado."
  fi
}

while true; do
  for REGION in $(echo "$REGIONS" | tr ',' ' '); do
    run_collect "$REGION"
  done

  echo ""
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Ronda completa. Reintentando en ${RETRY_DELAY_S}s..."
  sleep "$RETRY_DELAY_S"
done
