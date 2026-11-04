#!/usr/bin/env bash
# Ejecuta las cuatro pruebas en orden y guarda la salida de cada una en pruebas/resultados/
# Requisito: la aplicación levantada con `docker compose up -d --build` (puerto 8088).
cd "$(dirname "$0")"
mkdir -p resultados
estado=0
for prueba in 01-balanceo 02-api 03-tolerancia 04-estres; do
  echo ">>> $prueba"
  bash "$prueba.sh" 2>&1 | tee "resultados/$prueba.txt"
  [ "${PIPESTATUS[0]}" -eq 0 ] || estado=1
done
echo
[ "$estado" -eq 0 ] && echo "TODAS LAS PRUEBAS PASARON" || echo "HAY PRUEBAS FALLIDAS"
exit "$estado"
