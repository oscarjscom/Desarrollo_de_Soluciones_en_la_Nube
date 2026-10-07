"""Catálogo de políticas ABAC.

Cada política es una función pura que recibe el contexto (usuario, recurso,
acción, entorno) y sus parámetros, y devuelve (cumple, motivo_si_no_cumple).

A QUIÉN y a QUÉ ACCIONES se aplica cada política no está escrito aquí: lo deciden
los parámetros guardados en la tabla `politicas` (acciones, roles, roles_exentos),
que el motor revisa antes de llamar a la función. Así no hay condicionales por rol
repartidos por el código y las reglas se cambian desde la BD o el endpoint
PUT /politicas/{codigo}.
"""
from datetime import datetime
from typing import Callable

from app.authorization.abac.context import ContextoAutorizacion

Evaluador = Callable[[ContextoAutorizacion, dict], tuple[bool, str]]
REGISTRO: dict[str, Evaluador] = {}


def politica(codigo: str):
    def registrar(fn: Evaluador) -> Evaluador:
        REGISTRO[codigo] = fn
        return fn

    return registrar


def _hora(texto: str):
    return datetime.strptime(texto, "%H:%M").time()


@politica("DEPARTAMENTO")
def departamento(ctx: ContextoAutorizacion, p: dict):
    u, r = ctx.usuario, ctx.recurso
    ok = u["departamento"] == r["departamento"]
    return ok, (
        f"Departamento distinto: el documento es de {r['departamento']} "
        f"y el usuario de {u['departamento']}"
    )


@politica("NIVEL_SEGURIDAD")
def nivel_seguridad(ctx: ContextoAutorizacion, p: dict):
    u, r = ctx.usuario, ctx.recurso
    ok = u["nivel_seguridad"] >= r["nivel_confidencialidad"]
    return ok, (
        f"Nivel de seguridad insuficiente: {u['nivel_seguridad']} "
        f"< {r['nivel_confidencialidad']}"
    )


@politica("PROPIEDAD")
def propiedad(ctx: ContextoAutorizacion, p: dict):
    ok = ctx.usuario["id"] == ctx.recurso["propietario"]
    return ok, "Solo el propietario puede modificar este documento"


@politica("HORARIO")
def horario(ctx: ContextoAutorizacion, p: dict):
    if ctx.recurso["nivel_confidencialidad"] < p.get("nivel_minimo", 4):
        return True, ""
    inicio, fin = _hora(p.get("hora_inicio", "08:00")), _hora(p.get("hora_fin", "18:00"))
    ok = inicio <= ctx.entorno.hora <= fin
    return ok, (
        f"Documento de nivel {ctx.recurso['nivel_confidencialidad']} fuera del horario "
        f"autorizado ({p.get('hora_inicio', '08:00')}-{p.get('hora_fin', '18:00')}); "
        f"hora de la petición {ctx.entorno.hora.strftime('%H:%M')}"
    )


@politica("PAIS")
def pais(ctx: ContextoAutorizacion, p: dict):
    u, r, e = ctx.usuario, ctx.recurso, ctx.entorno
    if u["pais"] != r["pais"]:
        return False, f"País distinto: el documento es de {r['pais']} y el usuario de {u['pais']}"
    if p.get("validar_ubicacion", True) and e.ubicacion != r["pais"]:
        return False, (
            f"Ubicación no autorizada: el documento de {r['pais']} solo se consulta "
            f"desde {r['pais']} (petición desde {e.ubicacion})"
        )
    return True, ""


@politica("DISPOSITIVO")
def dispositivo(ctx: ContextoAutorizacion, p: dict):
    if ctx.recurso["nivel_confidencialidad"] < p.get("nivel_minimo", 4):
        return True, ""
    permitidos = p.get("dispositivos_permitidos", ["CORPORATIVO"])
    ok = ctx.entorno.dispositivo in permitidos
    return ok, (
        f"Documento de nivel {ctx.recurso['nivel_confidencialidad']} solo desde dispositivo "
        f"{'/'.join(permitidos)} (petición desde {ctx.entorno.dispositivo})"
    )


@politica("ESTADO_USUARIO")
def estado_usuario(ctx: ContextoAutorizacion, p: dict):
    ok = ctx.usuario["estado"] in p.get("estados_permitidos", ["ACTIVO"])
    return ok, f"Usuario {ctx.usuario['estado']}: no puede acceder al sistema"


@politica("INVITADO")
def invitado(ctx: ContextoAutorizacion, p: dict):
    u, r = ctx.usuario, ctx.recurso
    fallas = []
    if u["tipo_contrato"] != p.get("tipo_contrato", "EXTERNO"):
        fallas.append(f"tipo de contrato {u['tipo_contrato']} (debe ser {p.get('tipo_contrato', 'EXTERNO')})")
    if r["nivel_confidencialidad"] > p.get("nivel_maximo", 1):
        fallas.append(f"confidencialidad {r['nivel_confidencialidad']} > {p.get('nivel_maximo', 1)}")
    if r["estado"] != p.get("estado_documento", "PUBLICADO"):
        fallas.append(f"documento en estado {r['estado']} (debe estar {p.get('estado_documento', 'PUBLICADO')})")
    return not fallas, "Invitado sin acceso: " + ", ".join(fallas)
