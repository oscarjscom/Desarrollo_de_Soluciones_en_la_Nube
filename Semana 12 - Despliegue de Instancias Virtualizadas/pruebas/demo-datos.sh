#!/usr/bin/env bash
# Carga datos de demostración: 5 participantes, predicciones, 4 partidos ya jugados y dos salas.
# Solo para mostrar la aplicación (capturas y video). Para empezar de cero: docker compose down -v && docker compose up -d
cd "$(dirname "$0")" && source ./lib.sh
CLAVE=demo1234
registrar() { api POST "$BASE/api/registro" "" "{\"nombre\":\"$1\",\"clave\":\"$CLAVE\"}"; echo "$CUERPO" | jget token; }
api POST "$BASE/api/login" "" '{"nombre":"admin","clave":"admin123"}'; ADM=$(echo "$CUERPO" | jget token)

TA=$(registrar Ana); TL=$(registrar Luis); TM=$(registrar Marta); TD=$(registrar Diego); TS=$(registrar Sofia)
pred() { api PUT "$BASE/api/partidos/$2/prediccion" "$1" "{\"golesLocal\":$3,\"golesVisitante\":$4}" >/dev/null; }

# Partidos 1 a 4 (se jugarán y se finalizan) y 5 a 8 (siguen abiertos)
pred "$TA" 1 2 0; pred "$TA" 2 2 0; pred "$TA" 3 2 2; pred "$TA" 4 1 0; pred "$TA" 5 2 0; pred "$TA" 6 1 1
pred "$TL" 1 1 0; pred "$TL" 2 3 1; pred "$TL" 3 0 1; pred "$TL" 4 2 1; pred "$TL" 5 1 0
pred "$TM" 1 0 0; pred "$TM" 2 1 2; pred "$TM" 3 1 1; pred "$TM" 4 3 0; pred "$TM" 6 0 2
pred "$TD" 1 2 1; pred "$TD" 2 1 0; pred "$TD" 3 2 1; pred "$TD" 4 0 0; pred "$TD" 7 1 3
pred "$TS" 1 3 0; pred "$TS" 2 3 1; pred "$TS" 3 0 0; pred "$TS" 4 1 2; pred "$TS" 5 2 1; pred "$TS" 8 0 1

res() { api POST "$BASE/api/admin/partidos/$1/resultado" "$ADM" "{\"golesLocal\":$2,\"golesVisitante\":$3}" >/dev/null; }
res 1 2 0; res 2 3 1; res 3 1 1; res 4 2 1

# Simula que esos 4 partidos ya se jugaron (mueve sus fechas y las de sus predicciones 4 días atrás)
docker exec mundial-db-1 psql -q -U mundial -d mundial -c "UPDATE partidos SET inicio = inicio - interval '4 days' WHERE id <= 4; UPDATE predicciones SET registrada = registrada - interval '4 days' WHERE partido_id <= 4;" >/dev/null

# Salas con invitación
api POST "$BASE/api/salas" "$TA" '{"nombre":"Amigos del barrio"}'; S1=$(echo "$CUERPO" | jget id); C1=$(echo "$CUERPO" | jget codigo)
api POST "$BASE/api/salas/unirse" "$TL" "{\"codigo\":\"$C1\"}" >/dev/null; api POST "$BASE/api/salas/unirse" "$TM" "{\"codigo\":\"$C1\"}" >/dev/null
api POST "$BASE/api/salas" "$TD" '{"nombre":"Oficina Tecsup"}'; S2=$(echo "$CUERPO" | jget id); C2=$(echo "$CUERPO" | jget codigo)
api POST "$BASE/api/salas/unirse" "$TS" "{\"codigo\":\"$C2\"}" >/dev/null; api POST "$BASE/api/salas/unirse" "$TA" "{\"codigo\":\"$C2\"}" >/dev/null

echo "Datos de demostración cargados."
echo "  Participantes: Ana, Luis, Marta, Diego, Sofia (clave: $CLAVE)   Administrador: admin / admin123"
echo "  Sala 'Amigos del barrio' ($C1) y sala 'Oficina Tecsup' ($C2)"
echo "  Ranking general:"; curl -s "$BASE/api/ranking" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>JSON.parse(s).forEach(f=>console.log("   "+f.posicion+". "+f.nombre.padEnd(8)+f.puntos+" puntos")))'
