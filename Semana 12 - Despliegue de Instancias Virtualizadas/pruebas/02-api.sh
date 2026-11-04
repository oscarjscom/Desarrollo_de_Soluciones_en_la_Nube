#!/usr/bin/env bash
# Prueba 2: pruebas funcionales de la API a través del balanceador (consultas con curl).
# Usa tres participantes y cinco partidos creados por el administrador; los puntajes esperados están calculados a mano.
cd "$(dirname "$0")" && source ./lib.sh
S=$(date +%s)
ANA="ana$S"; BETO="beto$S"; CARLA="carla$S"; CLAVE="clave123"

titulo "1. Registro e inicio de sesión (balanceador)"
api POST "$BASE/api/registro" "" "{\"nombre\":\"$ANA\",\"clave\":\"$CLAVE\"}";   verificar "Registro de $ANA" 201 "$CODIGO"; TA=$(echo "$CUERPO" | jget token)
api POST "$BASE/api/registro" "" "{\"nombre\":\"$BETO\",\"clave\":\"$CLAVE\"}";  verificar "Registro de $BETO" 201 "$CODIGO"; TB=$(echo "$CUERPO" | jget token)
api POST "$BASE/api/registro" "" "{\"nombre\":\"$CARLA\",\"clave\":\"$CLAVE\"}"; verificar "Registro de $CARLA" 201 "$CODIGO"; TC=$(echo "$CUERPO" | jget token)
api POST "$BASE/api/registro" "" "{\"nombre\":\"$ANA\",\"clave\":\"$CLAVE\"}";   verificar "Nombre repetido es rechazado" 409 "$CODIGO"
api POST "$BASE/api/login" "" "{\"nombre\":\"$ANA\",\"clave\":\"incorrecta\"}";  verificar "Clave incorrecta es rechazada" 401 "$CODIGO"
api POST "$BASE/api/login" "" '{"nombre":"admin","clave":"admin123"}';           verificar "Inicio de sesión del administrador" 200 "$CODIGO"; ADM=$(echo "$CUERPO" | jget token)

titulo "2. Seguridad y validaciones"
api PUT "$BASE/api/partidos/1/prediccion" "" '{"golesLocal":1,"golesVisitante":0}'; verificar "Predecir sin iniciar sesión" 401 "$CODIGO"
api GET "$BASE/api/salas" "";                                                       verificar "Ver salas sin iniciar sesión" 401 "$CODIGO"
api POST "$BASE/api/admin/partidos" "$TA" "{\"local\":\"X\",\"visitante\":\"Y\",\"inicio\":\"$(en_horas 50)\"}"; verificar "Un participante no puede crear partidos" 403 "$CODIGO"

titulo "3. Partidos de prueba (creados por el administrador)"
api POST "$BASE/api/admin/partidos" "$ADM" "{\"fase\":\"Prueba\",\"local\":\"Local1\",\"visitante\":\"Visita1\",\"inicio\":\"$(en_horas 30)\"}"; verificar "Crear partido P1 (en 30 h)" 201 "$CODIGO"; P1=$(echo "$CUERPO" | jget id)
api POST "$BASE/api/admin/partidos" "$ADM" "{\"fase\":\"Prueba\",\"local\":\"Local2\",\"visitante\":\"Visita2\",\"inicio\":\"$(en_horas 31)\"}"; P2=$(echo "$CUERPO" | jget id)
api POST "$BASE/api/admin/partidos" "$ADM" "{\"fase\":\"Prueba\",\"local\":\"Local3\",\"visitante\":\"Visita3\",\"inicio\":\"$(en_horas 32)\"}"; P3=$(echo "$CUERPO" | jget id)
api POST "$BASE/api/admin/partidos" "$ADM" "{\"fase\":\"Prueba\",\"local\":\"Local4\",\"visitante\":\"Visita4\",\"inicio\":\"$(en_horas 33)\"}"; P4=$(echo "$CUERPO" | jget id)
api POST "$BASE/api/admin/partidos" "$ADM" "{\"fase\":\"Prueba\",\"local\":\"Local5\",\"visitante\":\"Visita5\",\"inicio\":\"$(en_minutos 5)\"}"; P5=$(echo "$CUERPO" | jget id)
api POST "$BASE/api/admin/partidos" "$ADM" "{\"fase\":\"Prueba\",\"local\":\"Local6\",\"visitante\":\"Visita6\",\"inicio\":\"$(en_minutos -60)\"}"; P6=$(echo "$CUERPO" | jget id)
info "Partidos creados: P1=$P1 P2=$P2 P3=$P3 P4=$P4 P5(en 5 min)=$P5 P6(ya empezó)=$P6"
pred() { api PUT "$BASE/api/partidos/$2/prediccion" "$1" "{\"golesLocal\":$3,\"golesVisitante\":$4}"; }

titulo "4. Predicciones"
pred "$TA" "$P6" 1 0; verificar "No se puede predecir un partido que ya empezó" 409 "$CODIGO"
pred "$TA" "$P1" -1 0; verificar "Goles negativos son rechazados" 400 "$CODIGO"
pred "$TA" "$P1" 2 1; verificar "Ana predice P1 2-1" 200 "$CODIGO"; verificar "P1 se registró con más de 24 h de anticipación" true "$(echo "$CUERPO" | jget anticipada)"
pred "$TA" "$P2" 1 0; pred "$TA" "$P3" 0 0; pred "$TA" "$P4" 3 1
pred "$TA" "$P5" 1 0; verificar "Ana predice P5 (empieza en 5 min)" 200 "$CODIGO"; verificar "P5 NO es anticipada (último minuto)" false "$(echo "$CUERPO" | jget anticipada)"
pred "$TB" "$P1" 3 0; pred "$TB" "$P2" 2 1; pred "$TB" "$P3" 1 0; pred "$TB" "$P4" 0 2
pred "$TC" "$P4" 0 3; verificar "Carla predice solo P4 0-3" 200 "$CODIGO"

titulo "5. Resultados reales y puntuación (reglas 1 a 5)"
resultado() { api POST "$BASE/api/admin/partidos/$1/resultado" "$ADM" "{\"golesLocal\":$2,\"golesVisitante\":$3}"; }
resultado "$P1" 2 1; resultado "$P2" 1 0; resultado "$P3" 2 2; resultado "$P4" 0 3; resultado "$P5" 1 0
verificar "El administrador registra el resultado de P5" 200 "$CODIGO"
info "Resultados: P1 2-1 · P2 1-0 · P3 2-2 · P4 0-3 · P5 1-0"
est() { api GET "$BASE/api/estadisticas" "$1"; }
est "$TA"; info "Ana:   $CUERPO"
verificar "Ana: puntos totales (3 exactos, empate con diferencia, anticipadas y racha)" 25 "$(echo "$CUERPO" | jget puntos)"
verificar "Ana: marcadores exactos (P5, P1, P2)" 3 "$(echo "$CUERPO" | jget exactos)"
verificar "Ana: mejor racha de aciertos seguidos (P5, P1, P2, P3)" 4 "$(echo "$CUERPO" | jget mejorRacha)"
est "$TB"; info "Beto:  $CUERPO"
verificar "Beto: puntos (ganador, ganador+diferencia, fallo, ganador; sin racha de 3)" 14 "$(echo "$CUERPO" | jget puntos)"
verificar "Beto: mejor racha (la rompe el fallo en P3)" 2 "$(echo "$CUERPO" | jget mejorRacha)"
est "$TC"; info "Carla: $CUERPO"
verificar "Carla: puntos (exacto 5 + anticipada 1)" 6 "$(echo "$CUERPO" | jget puntos)"

titulo "6. Salas con invitación"
api POST "$BASE/api/salas" "$TA" "{\"nombre\":\"Sala $S\"}"; verificar "Ana crea una sala" 201 "$CODIGO"; SALA=$(echo "$CUERPO" | jget id); COD=$(echo "$CUERPO" | jget codigo)
info "Sala $SALA con código de invitación $COD"
api POST "$BASE/api/salas/unirse" "$TB" "{\"codigo\":\"$COD\"}";      verificar "Beto se une con el código" 200 "$CODIGO"
api POST "$BASE/api/salas/unirse" "$TC" '{"codigo":"CODIGO-X"}';       verificar "Un código inválido es rechazado" 404 "$CODIGO"
api POST "$BASE/api/salas/unirse" "$TC" "{\"codigo\":\"$COD\"}";      verificar "Carla se une con el código" 200 "$CODIGO"
api GET "$BASE/api/salas/$SALA" "$TA"
verificar "Ranking de la sala: 1.º lugar" "$ANA" "$(echo "$CUERPO" | jget ranking.0.nombre)"
verificar "Ranking de la sala: puntos del 1.º" 25 "$(echo "$CUERPO" | jget ranking.0.puntos)"
verificar "Ranking de la sala: 2.º lugar" "$BETO" "$(echo "$CUERPO" | jget ranking.1.nombre)"
verificar "Ranking de la sala: 3.er lugar" "$CARLA" "$(echo "$CUERPO" | jget ranking.2.nombre)"
api POST "$BASE/api/salas/$SALA/codigo" "$TB" '{}';                      verificar "Solo el creador cambia el código (Beto: 403)" 403 "$CODIGO"
api POST "$BASE/api/salas/$SALA/codigo" "$TA" '{}';                      verificar "El creador genera un código nuevo" 200 "$CODIGO"
api POST "$BASE/api/salas/unirse" "$TB" "{\"codigo\":\"$COD\"}";         verificar "El código anterior deja de funcionar" 404 "$CODIGO"
api DELETE "$BASE/api/salas/$SALA/miembros/$(est "$TC"; echo "$CUERPO" | jget usuarioId)" "$TA"; verificar "El creador saca a Carla de la sala" 200 "$CODIGO"
api GET "$BASE/api/salas/$SALA" "$TC";                                    verificar "Carla ya no puede ver la sala" 404 "$CODIGO"
api POST "$BASE/api/salas/$SALA/salir" "$TB" '{}';                       verificar "Beto sale de la sala" 200 "$CODIGO"
api DELETE "$BASE/api/salas/$SALA" "$TA";                                 verificar "El creador elimina la sala" 200 "$CODIGO"
api GET "$BASE/api/salas/$SALA" "$TA";                                    verificar "La sala eliminada ya no existe" 404 "$CODIGO"

titulo "7. Consistencia entre los dos nodos (base de datos compartida)"
DANI="dani$S"
api POST "$N1/api/registro" "" "{\"nombre\":\"$DANI\",\"clave\":\"$CLAVE\"}"; verificar "Registro hecho en el nodo1" 201 "$CODIGO"
api POST "$N2/api/login" "" "{\"nombre\":\"$DANI\",\"clave\":\"$CLAVE\"}";    verificar "Inicio de sesión del mismo usuario en el nodo2" 200 "$CODIGO"; TD=$(echo "$CUERPO" | jget token)
api GET "$N1/api/estadisticas" "$TD";                                          verificar "El token emitido por nodo2 es válido en nodo1" 200 "$CODIGO"
a=$(curl -s "$N1/api/ranking" | md5sum | cut -d' ' -f1); b=$(curl -s "$N2/api/ranking" | md5sum | cut -d' ' -f1)
verificar "El ranking es idéntico en nodo1 y nodo2" "$a" "$b"

titulo "Limpieza de los partidos de prueba"
for p in $P1 $P2 $P3 $P4 $P5 $P6; do api DELETE "$BASE/api/admin/partidos/$p" "$ADM"; done; ok "Partidos de prueba eliminados"

resumen
