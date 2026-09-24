"""Servicio RBAC: usuario -> rol -> permisos -> operación.

Los permisos de cada rol están en las tablas roles / permisos / rol_permiso, no
en el código.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Permiso, Rol, Usuario


class RBACService:
    def __init__(self, db: Session):
        self.db = db

    def permisos_de(self, usuario: Usuario) -> set[str]:
        return {p.codigo for p in usuario.rol.permisos}

    def tiene_permiso(self, usuario: Usuario, accion: str) -> bool:
        return accion in self.permisos_de(usuario)

    def matriz(self) -> dict:
        roles = list(self.db.scalars(select(Rol).order_by(Rol.id)))
        permisos = list(self.db.scalars(select(Permiso).order_by(Permiso.id)))
        return {
            "roles": [r.codigo for r in roles],
            "permisos": [
                {
                    "codigo": p.codigo,
                    "nombre": p.nombre,
                    "roles": {r.codigo: p in r.permisos for r in roles},
                }
                for p in permisos
            ],
        }
