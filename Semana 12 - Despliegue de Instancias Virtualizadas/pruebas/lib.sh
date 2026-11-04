#!/usr/bin/env bash
# Funciones comunes de las pruebas con bash (curl + node para leer JSON).
BASE="${BASE:-http://localhost:8088}"   # balanceador Nginx
N1="${N1:-http://localhost:3001}"       # nodo 1 directo
N2="${N2:-http://localhost:3002}"       # nodo 2 directo
OK=0; FALLOS=0

VERDE=$'\033[32m'; ROJO=$'\033[31m'; AMARILLO=$'\033[33m'; NEGRITA=$'\033[1m'; FIN=$'\033[0m'

titulo() { printf '\n%s== %s%s\n' "$NEGRITA" "$1" "$FIN"; }
ok()     { printf '  %sOK%s     %s\n' "$VERDE" "$FIN" "$1"; OK=$((OK + 1)); }
fallo()  { printf '  %sFALLO%s  %s\n' "$ROJO" "$FIN" "$1"; FALLOS=$((FALLOS + 1)); }
info()   { printf '  %s%s%s\n' "$AMARILLO" "$1" "$FIN"; }

# verificar "descripción" esperado obtenido
verificar() { if [ "$2" = "$3" ]; then ok "$1 (= $3)"; else fallo "$1 (esperado: $2, obtenido: $3)"; fi; }

# jget "ruta.en.json" < json   (ej.: ranking.0.nombre)
jget() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);const v=process.argv[1].split(".").filter(Boolean).reduce((a,k)=>a==null?a:a[k],o);console.log(v===undefined||v===null?"":typeof v==="object"?JSON.stringify(v):v)}catch(e){console.log("")}})' "$1"
}

# api METODO URL [TOKEN] [JSON]  -> deja el resultado en $CODIGO y $CUERPO
api() {
  local metodo="$1" url="$2" token="${3:-}" cuerpo="${4:-}" salida
  local args=(-s -m 20 -X "$metodo" -w $'\n%{http_code}' -H 'Content-Type: application/json')
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$cuerpo" ] && args+=(-d "$cuerpo")
  salida=$(curl "${args[@]}" "$url")
  CODIGO="${salida##*$'\n'}"
  CUERPO="${salida%$'\n'*}"
}

# fecha ISO a N horas (o minutos) desde ahora:  en_horas 30   /   en_minutos 5   /   en_minutos -60
en_horas()   { node -e 'console.log(new Date(Date.now()+Number(process.argv[1])*3600e3).toISOString())' -- "$1"; }
en_minutos() { node -e 'console.log(new Date(Date.now()+Number(process.argv[1])*60e3).toISOString())' -- "$1"; }

resumen() {
  printf '\n%s== Resumen ==%s\n  Correctas: %s%d%s   Fallidas: %s%d%s\n' "$NEGRITA" "$FIN" "$VERDE" "$OK" "$FIN" "$ROJO" "$FALLOS" "$FIN"
  [ "$FALLOS" -eq 0 ]
}

# espera a que un nodo responda /salud (útil tras reiniciar contenedores)
esperar_nodo() { local url="$1" i; for i in $(seq 1 40); do curl -sf -m 2 "$url/salud" >/dev/null && return 0; sleep 1; done; return 1; }

# al_menos "descripción" mínimo obtenido
al_menos() { if [ "$3" -ge "$2" ]; then ok "$1 (>= $2, obtenido $3)"; else fallo "$1 (se esperaba al menos $2, obtenido $3)"; fi; }
