#!/usr/bin/env bash
# Prueba 4: pruebas de estrés con autocannon. Compara 2 nodos contra 1 nodo (escalamiento horizontal).
#   - Lectura:  GET /api/partidos   (consulta a la base de datos)
#   - Escritura de CPU: POST /api/login (compara la clave con bcrypt, usa mucha CPU)
# Variables: CONEXIONES (por defecto 40) y DURACION en segundos (por defecto 12).
cd "$(dirname "$0")" && source ./lib.sh
CONEXIONES="${CONEXIONES:-40}"; DURACION="${DURACION:-12}"
AC="npx --yes autocannon@7.15.0"
TMP="$(mktemp -d)"; RESULTADOS=()

# prueba "etiqueta" args-de-autocannon...  -> guarda y muestra una línea de resumen
prueba() {
  local etq="$1"; shift
  printf '  Ejecutando: %s (%s conexiones, %s s)...\n' "$etq" "$CONEXIONES" "$DURACION"
  $AC -c "$CONEXIONES" -d "$DURACION" --json "$@" > "$TMP/r.json" 2>/dev/null
  local linea
  linea=$(node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const f = (n) => Number(n).toFixed(1);
    console.log([process.argv[2], Math.round(r.requests.average), f(r.latency.average), f(r.latency.p99), r.requests.total, r["2xx"], r.non2xx || 0, (r.errors || 0) + (r.timeouts || 0)].join("|"));
  ' "$TMP/r.json" "$etq")
  RESULTADOS+=("$linea")
  IFS='|' read -r _ rps lat p99 total ok2 no2 err <<< "$linea"
  printf '    -> %s req/s | latencia promedio %s ms | p99 %s ms | %s peticiones | %s respuestas 2xx | %s no-2xx | %s errores\n' "$rps" "$lat" "$p99" "$total" "$ok2" "$no2" "$err"
}

nodos_activos() { docker ps --format '{{.Names}}' | grep -c '^mundial-nodo'; }

titulo "Estado inicial"
verificar "Nodos activos" 2 "$(nodos_activos)"
LOGIN=(-m POST -H 'Content-Type: application/json' -b '{"nombre":"admin","clave":"admin123"}' "$BASE/api/login")

titulo "A. Lectura (GET /api/partidos) con 2 nodos"
prueba "Lectura - 2 nodos" "$BASE/api/partidos"
titulo "B. Inicios de sesión (POST /api/login, usa CPU) con 2 nodos"
prueba "Login - 2 nodos" "${LOGIN[@]}"

titulo "Se apaga el nodo2: queda 1 solo nodo"
docker stop mundial-nodo2 >/dev/null; sleep 3
verificar "Nodos activos" 1 "$(nodos_activos)"
titulo "C. Lectura con 1 nodo"
prueba "Lectura - 1 nodo" "$BASE/api/partidos"
titulo "D. Inicios de sesión con 1 nodo"
prueba "Login - 1 nodo" "${LOGIN[@]}"

titulo "Se vuelve a encender el nodo2"
docker start mundial-nodo2 >/dev/null && esperar_nodo "$N2"; sleep 4
verificar "Nodos activos" 2 "$(nodos_activos)"

titulo "Resultados"
printf '  %-20s %9s %12s %9s %11s %8s %8s\n' "Escenario" "req/s" "lat. prom.ms" "p99 ms" "peticiones" "no-2xx" "errores"
for l in "${RESULTADOS[@]}"; do IFS='|' read -r e rps lat p99 total ok2 no2 err <<< "$l"; printf '  %-20s %9s %12s %9s %11s %8s %8s\n' "$e" "$rps" "$lat" "$p99" "$total" "$no2" "$err"; done
rps() { echo "${RESULTADOS[$1]}" | cut -d'|' -f2; }
mejora() { node -e 'console.log((Number(process.argv[1])/Number(process.argv[2])).toFixed(2))' -- "$1" "$2"; }
M_LEC=$(mejora "$(rps 0)" "$(rps 2)"); M_LOG=$(mejora "$(rps 1)" "$(rps 3)")
info "Mejora de lectura con 2 nodos vs 1 nodo: x$M_LEC"
info "Mejora de inicios de sesión con 2 nodos vs 1 nodo: x$M_LOG"
for i in 0 1 2 3; do
  err=$(echo "${RESULTADOS[$i]}" | cut -d'|' -f7,8 | tr '|' '+'); verificar "Sin errores ni respuestas no-2xx en '$(echo "${RESULTADOS[$i]}" | cut -d'|' -f1)'" "0+0" "$err"
done
al_menos "Con 2 nodos el login procesa más peticiones por segundo que con 1 (x100)" 120 "$(node -e 'console.log(Math.round(Number(process.argv[1])*100))' -- "$M_LOG")"

rm -rf "$TMP"
resumen
