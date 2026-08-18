#!/usr/bin/env bash
# Corre el monitor de un sitio y avisa. Pensado para cron.
#
#   ./bin/check.sh clandent                      -> smoke + tests/sites de clandent
#   VISUAL=1 ./bin/check.sh clandent              -> regresión visual de clandent
#   KUMA_PUSH=https://... ./bin/check.sh clandent -> push a Uptime Kuma
#   MAIL_TO=alguien@dominio.cl ./bin/check.sh ...  -> correo si falla (via resend CLI)
#
# Un check.sh por sitio con su propio KUMA_PUSH es lo que da monitoreo
# independiente: un push combinado mezcla la salud de todos y no dice CUÁL se
# cayó. VISUAL=1 usa su PROPIO lock y su PROPIO monitor de Kuma — nunca se
# mezcla con el smoke, porque un diff de layout del 2% no es "sitio caído".
#
# El sitio es OBLIGATORIO (a diferencia de v1): el filtro ahora es
# --project=<sitio>, que hace match exacto contra sites/*.ts. No hay "correr
# todos" en un solo proceso porque eso es justo lo que mezclaba el push de Kuma
# de dos sitios en v1 — un ./check.sh por sitio en su propio cron es el patrón.
set -uo pipefail
cd "$(dirname "$0")/.."

SITE="${1:?uso: check.sh <sitio> — ver sites/*.ts para los nombres disponibles}"
PROJECT="$SITE"
[ -n "${VISUAL:-}" ] && PROJECT="${SITE}-visual"

# Un monitor que no puede avisar tiene que gritar, no seguir corriendo.
# Sin esto: en un Debian minimal (el template del CT no trae curl) el push a
# Kuma muere en "command not found" y el cron queda corriendo tests para nadie
# — Kuma no recibe NADA, así que tampoco alerta por heartbeat perdido.
if [ -n "${KUMA_PUSH:-}" ] && ! command -v curl >/dev/null; then
  echo "wp-monitor: KUMA_PUSH está definido pero no hay curl — no puedo avisar. Abortando." >&2
  exit 1
fi
if [ -n "${MAIL_TO:-}" ] && ! command -v resend >/dev/null; then
  echo "wp-monitor: MAIL_TO está definido pero no hay CLI de resend — no puedo avisar. Abortando." >&2
  exit 1
fi
if ! command -v npx >/dev/null; then
  echo "wp-monitor: no hay npx/node en el PATH del cron. Abortando." >&2
  exit 1
fi

# Lock por project: el cron cada 6h puede disparar mientras la corrida anterior
# sigue viva. Solapadas se pisan recursos del navegador y dan fallos que no son
# roturas del sitio. Si ya hay una corriendo, esta sale sin tocar Kuma: el
# heartbeat de la corrida en curso es el que vale.
LOCK="/tmp/wp-monitor-${PROJECT}.lock"
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "wp-monitor: ya hay una corrida de '${PROJECT}' en curso, salgo"
  exit 0
fi

mkdir -p reports
REPORT="reports/${PROJECT}.json"
LOG=$(mktemp)

# Sin --reporter: se usan los de playwright.config.ts (list + html + json a
# reports/last.json). Pisar la lista acá perdería el outputFile del json y el
# reporte terminaría en stdout en vez de en el archivo que lee notify.ts.
npx playwright test --project="$PROJECT" >"$LOG" 2>&1
STATUS=$?
# El reporter json de la config escribe siempre a reports/last.json; se copia
# al nombre del project para que corridas paralelas de distintos sitios no se
# pisen el archivo entre sí.
[ -f reports/last.json ] && cp reports/last.json "$REPORT"

if [ -f "$REPORT" ]; then
  REPORT_PATH="$REPORT" SITE="$SITE" KUMA_PUSH="${KUMA_PUSH:-}" MAIL_TO="${MAIL_TO:-}" \
    node bin/notify.ts >>"$LOG" 2>&1 || true
else
  echo "wp-monitor: no se generó $REPORT — Playwright no llegó a correr" >>"$LOG"
  if [ -n "${KUMA_PUSH:-}" ] && command -v curl >/dev/null; then
    curl -fsS --data-urlencode "msg=no se generó el reporte, ver log" \
      "${KUMA_PUSH}?status=down" -o /dev/null || true
  fi
fi

cat "$LOG"
rm -f "$LOG"
exit $STATUS
