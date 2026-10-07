"""Ejecuta los 17 casos de prueba sobre una BD nueva y guarda las evidencias:

    evidencias/casos_de_prueba.md   tabla con esperado vs obtenido y el motivo
    evidencias/auditoria.json       registro de auditoría completo de la corrida

Uso (desde la carpeta Laboratorio_06):
    python -m scripts.generar_evidencias
"""
import json
import os
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/evidencias.db"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.config import ahora  # noqa: E402
from tests.casos import CASOS, cabeceras_de, ejecutar  # noqa: E402

SALIDA = RAIZ / "evidencias"


def main():
    SALIDA.mkdir(exist_ok=True)
    filas, ok_total = [], 0
    with TestClient(app) as client:
        for caso in CASOS:
            res = ejecutar(client, caso)
            ok = res.resultado == caso.esperado and (caso.etapa is None or res.etapa == caso.etapa)
            ok_total += ok
            esperado = caso.esperado + (f" ({caso.etapa})" if caso.etapa else "")
            obtenido = res.resultado + (f" ({res.etapa})" if res.etapa else "")
            entorno = ", ".join(f"{k[2:]}={v}" for k, v in caso.cabeceras.items())
            peticion = "POST /auth/login" if caso.metodo == "LOGIN" else f"{caso.metodo} {caso.ruta}"
            motivo = res.motivo.replace("|", "/") or "-"
            filas.append(f"| {caso.nro} | {caso.escenario} | `{caso.usuario}` | `{peticion}` | {entorno} | "
                         f"{esperado} | {obtenido} (HTTP {res.status}) | {motivo} | {'✅' if ok else '❌'} |")
            print(f"Caso {caso.nro:2d}: {'OK ' if ok else 'FALLA'} {caso.escenario} -> {obtenido}")

        auditoria = client.get("/auditoria", params={"limite": 1000},
                               headers=cabeceras_de(client, "admin")).json()

    obligatorios = [f for f, c in zip(filas, CASOS) if not c.adicional]
    adicionales = [f for f, c in zip(filas, CASOS) if c.adicional]
    cabecera = ("| # | Escenario | Usuario | Petición | Entorno | Esperado | Obtenido | Motivo | OK |\n"
                "|---|---|---|---|---|---|---|---|---|")
    md = f"""# Evidencias de los casos de prueba

Generado el {ahora():%Y-%m-%d %H:%M} con `python -m scripts.generar_evidencias` sobre una base de datos nueva.
Resultado: **{ok_total} de {len(CASOS)} casos correctos.**

## Casos obligatorios

{cabecera}
{chr(10).join(obligatorios)}

## Casos adicionales

{cabecera}
{chr(10).join(adicionales)}

El registro de auditoría completo de esta corrida está en [auditoria.json](auditoria.json).
"""
    (SALIDA / "casos_de_prueba.md").write_text(md, encoding="utf-8")
    (SALIDA / "auditoria.json").write_text(
        json.dumps(list(reversed(auditoria)), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{ok_total}/{len(CASOS)} casos correctos. Evidencias en {SALIDA}")
    return 0 if ok_total == len(CASOS) else 1


if __name__ == "__main__":
    raise SystemExit(main())
