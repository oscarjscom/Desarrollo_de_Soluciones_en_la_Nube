#!/usr/bin/env bash
# Prueba 3: tolerancia a fallos. Se apaga un nodo y el balanceador debe seguir respondiendo con el otro.
cd "$(dirname "$0")" && source ./lib.sh

# consultas N veces al balanceador; cuenta cuántas respondió cada nodo y cuántas fallaron
consultar() {
  local n="$1" i codigo nodo
  C1=0; C2=0; ERR=0
  for i in $(seq 1 "$n"); do
    api GET "$BASE/api/info"; codigo="$CODIGO"; nodo=$(echo "$CUERPO" | jget nodo)
    if [ "$codigo" != "200" ]; then ERR=$((ERR + 1)); continue; fi
    [ "$nodo" = "nodo1" ] && C1=$((C1 + 1)); [ "$nodo" = "nodo2" ] && C2=$((C2 + 1))
  done
  info "De $n consultas -> nodo1: $C1 · nodo2: $C2 · con error: $ERR"
}

titulo "1. Estado inicial (los dos nodos activos)"
consultar 10
al_menos "nodo1 recibe tráfico (reparto parejo)" 4 "$C1"; al_menos "nodo2 recibe tráfico (reparto parejo)" 4 "$C2"

titulo "2. Se detiene el nodo1 (docker stop mundial-nodo1)"
docker stop mundial-nodo1 >/dev/null && info "nodo1 detenido"
consultar 10
verificar "Ninguna consulta falla" 0 "$ERR"
verificar "nodo2 atiende todas las consultas" 10 "$C2"
api POST "$BASE/api/login" "" '{"nombre":"admin","clave":"admin123"}'
verificar "El inicio de sesión sigue funcionando solo con nodo2" 200 "$CODIGO"

titulo "3. Se vuelve a encender el nodo1"
docker start mundial-nodo1 >/dev/null && esperar_nodo "$N1" && info "nodo1 activo otra vez"
sleep 4   # Nginx vuelve a considerar disponible el nodo tras su tiempo de espera
consultar 10
verificar "Ninguna consulta falla" 0 "$ERR"
al_menos "nodo1 vuelve a recibir tráfico" 3 "$C1"

titulo "4. Se detiene el nodo2 (docker stop mundial-nodo2)"
docker stop mundial-nodo2 >/dev/null && info "nodo2 detenido"
consultar 10
verificar "Ninguna consulta falla" 0 "$ERR"
verificar "nodo1 atiende todas las consultas" 10 "$C1"

titulo "5. Se vuelve a encender el nodo2"
docker start mundial-nodo2 >/dev/null && esperar_nodo "$N2" && info "nodo2 activo otra vez"
sleep 4
consultar 10
verificar "Ninguna consulta falla" 0 "$ERR"
al_menos "nodo2 vuelve a recibir tráfico" 3 "$C2"

resumen
