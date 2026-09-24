"""Casos de prueba del laboratorio (12 obligatorios + 5 adicionales).

Los usa pytest (tests/test_casos.py) y el script que genera las evidencias
(scripts/generar_evidencias.py), así ambos prueban exactamente lo mismo.

Documentos de ejemplo (ver app/seed.py):
  1 Reporte de gastos Q3            FINANZAS  nivel 2  PENDIENTE  luis.perez
  2 Planilla de personal            RRHH      nivel 2  PENDIENTE  rosa.diaz
  3 Presupuesto anual               FINANZAS  nivel 3  PENDIENTE  ana.torres
  4 Presupuesto corporativo         FINANZAS  nivel 4  APROBADO   maria.gomez
  5 Plan estratégico de inversiones FINANZAS  nivel 5  APROBADO   maria.gomez
  6 Manual de bienvenida            FINANZAS  nivel 1  PUBLICADO  ana.torres
  7 Contrato con proveedor          FINANZAS  nivel 3  APROBADO   carlos.ruiz
  8 Borrador de circular interna    FINANZAS  nivel 2  BORRADOR   luis.perez
  9 Política de vacaciones          RRHH      nivel 1  PUBLICADO  rosa.diaz
 10 Conciliación bancaria sept.     FINANZAS  nivel 2  PENDIENTE  carlos.ruiz
"""
from dataclasses import dataclass, field
from typing import Callable

from app.seed import PASSWORD_DEMO

ENTORNO_BASE = {"X-Ubicacion": "PERU", "X-Dispositivo": "CORPORATIVO", "X-Hora": "10:30"}


@dataclass
class Caso:
    nro: int
    escenario: str
    usuario: str
    metodo: str
    ruta: str
    esperado: str  # PERMITIDO / DENEGADO
    etapa: str | None = None  # RBAC / ABAC / AUTENTICACION (solo si se espera DENEGADO)
    body: dict | None = None
    entorno: dict = field(default_factory=dict)
    preparar: Callable | None = None
    limpiar: Callable | None = None
    adicional: bool = False

    @property
    def cabeceras(self) -> dict:
        return {**ENTORNO_BASE, **self.entorno}


@dataclass
class Resultado:
    status: int
    resultado: str
    etapa: str | None
    motivo: str


def token(client, username: str, entorno: dict | None = None) -> str:
    r = client.post("/auth/login", json={"username": username, "password": PASSWORD_DEMO},
                    headers=entorno or ENTORNO_BASE)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def cabeceras_de(client, username: str, extra: dict | None = None) -> dict:
    return {**ENTORNO_BASE, **(extra or {}), "Authorization": f"Bearer {token(client, username)}"}


def _politica_horario(activa: bool):
    def accion(client):
        r = client.put("/politicas/HORARIO", json={"activa": activa}, headers=cabeceras_de(client, "admin"))
        assert r.status_code == 200, r.text
    return accion


def ejecutar(client, caso: Caso) -> Resultado:
    if caso.preparar:
        caso.preparar(client)
    try:
        if caso.metodo == "LOGIN":
            r = client.post("/auth/login", json={"username": caso.usuario, "password": PASSWORD_DEMO},
                            headers=caso.cabeceras)
        else:
            headers = {**caso.cabeceras, "Authorization": f"Bearer {token(client, caso.usuario)}"}
            r = client.request(caso.metodo, caso.ruta, json=caso.body, headers=headers)
    finally:
        if caso.limpiar:
            caso.limpiar(client)

    if r.status_code < 300:
        return Resultado(r.status_code, "PERMITIDO", None, "")
    detalle = r.json().get("detail")
    if isinstance(detalle, dict):
        return Resultado(r.status_code, detalle["resultado"], detalle["etapa"], detalle["motivo"])
    return Resultado(r.status_code, "ERROR", None, str(detalle))


CASOS = [
    # ---------- Obligatorios ----------
    Caso(1, "Empleado consulta documento de su área", "luis.perez", "GET", "/documentos/1", "PERMITIDO"),
    Caso(2, "Empleado consulta documento de otra área", "luis.perez", "GET", "/documentos/2", "DENEGADO", "ABAC"),
    Caso(3, "Supervisor aprueba documento de su área", "carlos.ruiz", "POST", "/documentos/3/aprobar", "PERMITIDO"),
    Caso(4, "Empleado intenta aprobar documento", "luis.perez", "POST", "/documentos/10/aprobar", "DENEGADO", "RBAC"),
    Caso(5, "Usuario nivel 2 consulta documento nivel 4", "luis.perez", "GET", "/documentos/4", "DENEGADO", "ABAC"),
    Caso(6, "Gerente elimina documento", "maria.gomez", "DELETE", "/documentos/8", "PERMITIDO"),
    Caso(7, "Auditor intenta modificar documento", "jorge.salas", "PUT", "/documentos/1", "DENEGADO", "RBAC",
         body={"titulo": "Cambio no autorizado"}),
    Caso(8, "Usuario inactivo intenta acceder", "pedro.inactivo", "LOGIN", "/auth/login", "DENEGADO",
         "AUTENTICACION"),
    Caso(9, "Documento confidencial accedido fuera de horario", "maria.gomez", "GET", "/documentos/4",
         "DENEGADO", "ABAC", entorno={"X-Hora": "20:30"}),
    Caso(10, "Documento nivel 5 accedido desde dispositivo personal", "maria.gomez", "GET", "/documentos/5",
         "DENEGADO", "ABAC", entorno={"X-Dispositivo": "PERSONAL"}),
    Caso(11, "Invitado accede a documento público", "invitado.ext", "GET", "/documentos/6", "PERMITIDO"),
    Caso(12, "Invitado accede a documento confidencial", "invitado.ext", "GET", "/documentos/7", "DENEGADO", "ABAC"),
    # ---------- Adicionales (diseñados por el grupo) ----------
    Caso(13, "Empleado modifica documento de su área que no creó", "luis.perez", "PUT", "/documentos/10",
         "DENEGADO", "ABAC", body={"descripcion": "Edición de otro"}, adicional=True),
    Caso(14, "Gerente modifica documento de otro usuario de su área", "maria.gomez", "PUT", "/documentos/10",
         "PERMITIDO", body={"descripcion": "Revisado por gerencia"}, adicional=True),
    Caso(15, "Empleado consulta documento de Perú desde Chile", "luis.perez", "GET", "/documentos/1",
         "DENEGADO", "ABAC", entorno={"X-Ubicacion": "CHILE"}, adicional=True),
    Caso(16, "Supervisor intenta gestionar usuarios", "carlos.ruiz", "GET", "/usuarios", "DENEGADO", "RBAC",
         adicional=True),
    Caso(17, "Admin desactiva la política de horario y el caso 9 pasa a permitido", "maria.gomez", "GET",
         "/documentos/4", "PERMITIDO", entorno={"X-Hora": "20:30"},
         preparar=_politica_horario(False), limpiar=_politica_horario(True), adicional=True),
]
