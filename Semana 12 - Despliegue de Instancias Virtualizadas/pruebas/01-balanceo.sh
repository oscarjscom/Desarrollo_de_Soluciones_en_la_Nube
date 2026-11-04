#!/usr/bin/env bash
# Prueba 1: consultas al balanceador y a cada nodo. Comprueba que Nginx reparte entre nodo1 y nodo2.
cd "$(dirname "$0")" && source ./lib.sh

titulo "Consulta directa a cada nodo (/api/info)"
for n in "$N1" "$N2"; do
  api GET "$n/api/info"
  info "$n -> $CUERPO"
done
nodo1=$(curl -s "$N1/api/info" | jget nodo); nodo2=$(curl -s "$N2/api/info" | jget nodo)
verificar "El puerto 3001 responde como nodo1" "nodo1" "$nodo1"
verificar "El puerto 3002 responde como nodo2" "nodo2" "$nodo2"

titulo "20 consultas al balanceador ($BASE)"
c1=0; c2=0; linea=""
for i in $(seq 1 20); do
  nodo=$(curl -s "$BASE/api/info" | jget nodo)
  linea="$linea $nodo"
  [ "$nodo" = "nodo1" ] && c1=$((c1 + 1)); [ "$nodo" = "nodo2" ] && c2=$((c2 + 1))
done
info "Respondieron:$linea"
verificar "Peticiones atendidas por nodo1" 10 "$c1"
verificar "Peticiones atendidas por nodo2" 10 "$c2"

titulo "Cabecera del balanceador"
cab=$(curl -sI "$BASE/api/info" | tr -d '\r' | grep -i '^x-balanceador' )
info "$cab"
verificar "La respuesta pasa por Nginx" "x-balanceador: nginx" "$(echo "$cab" | tr 'A-Z' 'a-z')"

resumen
