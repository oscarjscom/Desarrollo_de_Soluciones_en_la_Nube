"""Objetos que recibe el motor ABAC: usuario + recurso + acción + entorno."""
from dataclasses import asdict, dataclass
from datetime import date, time

from app.models import Documento, Usuario


@dataclass
class Entorno:
    hora: time
    fecha: date
    direccion_ip: str
    ubicacion: str
    dispositivo: str

    def como_dict(self) -> dict:
        d = asdict(self)
        d["hora"] = self.hora.strftime("%H:%M")
        d["fecha"] = self.fecha.isoformat()
        return d


@dataclass
class ContextoAutorizacion:
    usuario: dict
    recurso: dict | None
    accion: str
    entorno: Entorno


def atributos_usuario(u: Usuario) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "nombre": u.nombre,
        "correo": u.correo,
        "rol": u.rol.codigo,
        "departamento": u.departamento.codigo,
        "nivel_seguridad": u.nivel_seguridad,
        "pais": u.pais,
        "tipo_contrato": u.tipo_contrato,
        "estado": u.estado,
    }


def atributos_documento(d: Documento) -> dict:
    return {
        "id": d.id,
        "titulo": d.titulo,
        "departamento": d.departamento.codigo,
        "nivel_confidencialidad": d.nivel_confidencialidad,
        "estado": d.estado,
        "pais": d.pais,
        "propietario": d.propietario_id,
    }
