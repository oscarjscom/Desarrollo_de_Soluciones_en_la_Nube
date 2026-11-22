#!/usr/bin/env bash
# Consulta la app cada 4 s mientras RDS hace el failover y muestra a que servidor MySQL llega.
# Uso: bash sondeo-failover.sh http://IP_DE_LA_EC2 [repeticiones]
U=${1:?falta la URL de la app}
N=${2:-45}
echo "Sondeo de $U/api/db cada 4 s (el endpoint de RDS no cambia)"
for i in $(seq 1 "$N"); do
  r=$(curl -s -m 10 "$U/api/db")
  hora=$(date +%T)
  if echo "$r" | grep -q '"servidor"'; then
    echo "$r" | python -c "import sys,json;d=json.load(sys.stdin);print('$hora  OK     servidor MySQL: %s  registros: %s' % (d['servidor'], d['registros']))"
  else
    echo "$hora  ERROR  sin conexion con la base (failover en curso)"
  fi
  sleep 4
done
