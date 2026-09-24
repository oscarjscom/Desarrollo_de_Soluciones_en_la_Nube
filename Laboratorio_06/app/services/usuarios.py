from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.authorization.abac.context import Entorno
from app.authorization.service import AuthorizationService
from app.models import Departamento, Rol, Usuario
from app.schemas import UsuarioCreate, UsuarioOut, UsuarioUpdate


def usuario_out(u: Usuario) -> UsuarioOut:
    return UsuarioOut(
        id=u.id, username=u.username, nombre=u.nombre, correo=u.correo, rol=u.rol.codigo,
        departamento=u.departamento.codigo, nivel_seguridad=u.nivel_seguridad, pais=u.pais,
        tipo_contrato=u.tipo_contrato, estado=u.estado,
    )


class UsuarioService:
    def __init__(self, db: Session):
        self.db = db
        self.authz = AuthorizationService(db)

    def _rol(self, codigo: str) -> Rol:
        rol = self.db.scalar(select(Rol).where(Rol.codigo == codigo.upper()))
        if rol is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Rol {codigo} no existe")
        return rol

    def _departamento(self, codigo: str) -> Departamento:
        dep = self.db.scalar(select(Departamento).where(Departamento.codigo == codigo.upper()))
        if dep is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Departamento {codigo} no existe")
        return dep

    def listar(self, actor: Usuario, entorno: Entorno) -> list[UsuarioOut]:
        self.authz.exigir(actor, "MANAGE_USERS", entorno, recurso_id="usuarios")
        return [usuario_out(u) for u in self.db.scalars(select(Usuario).order_by(Usuario.id))]

    def crear(self, data: UsuarioCreate, actor: Usuario, entorno: Entorno) -> UsuarioOut:
        self.authz.exigir(actor, "MANAGE_USERS", entorno, recurso_id="usuarios")
        # Dar un rol a alguien también es asignar roles.
        self.authz.exigir(actor, "ASSIGN_ROLES", entorno, recurso_id=f"usuario-{data.username}")
        if self.db.scalar(select(Usuario).where(Usuario.username == data.username)):
            raise HTTPException(status.HTTP_409_CONFLICT, "Ese username ya existe")
        u = Usuario(
            username=data.username, nombre=data.nombre, correo=data.correo,
            password_hash=hash_password(data.password), rol=self._rol(data.rol),
            departamento=self._departamento(data.departamento), nivel_seguridad=data.nivel_seguridad,
            pais=data.pais.upper(), tipo_contrato=data.tipo_contrato, estado=data.estado,
        )
        self.db.add(u)
        self.db.commit()
        return usuario_out(u)

    def modificar(self, usuario_id: int, data: UsuarioUpdate, actor: Usuario, entorno: Entorno) -> UsuarioOut:
        recurso_id = f"usuario-{usuario_id}"
        self.authz.exigir(actor, "MANAGE_USERS", entorno, recurso_id=recurso_id)
        u = self.db.get(Usuario, usuario_id)
        if u is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
        if data.rol is not None and data.rol.upper() != u.rol.codigo:
            self.authz.exigir(actor, "ASSIGN_ROLES", entorno, recurso_id=recurso_id)
            u.rol = self._rol(data.rol)
        if data.departamento is not None:
            u.departamento = self._departamento(data.departamento)
        if data.password is not None:
            u.password_hash = hash_password(data.password)
        for campo in ("nombre", "correo", "nivel_seguridad", "tipo_contrato", "estado"):
            valor = getattr(data, campo)
            if valor is not None:
                setattr(u, campo, valor)
        if data.pais is not None:
            u.pais = data.pais.upper()
        self.db.commit()
        return usuario_out(u)
