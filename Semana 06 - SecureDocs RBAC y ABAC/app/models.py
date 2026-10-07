"""Modelo de datos: Usuario, Rol, Permiso, RolPermiso, Documento, Departamento,
Politica y Auditoria."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import ahora
from app.database import Base


class Departamento(Base):
    __tablename__ = "departamentos"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(30), unique=True)
    nombre: Mapped[str] = mapped_column(String(100))


class Permiso(Base):
    __tablename__ = "permisos"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(40), unique=True)
    nombre: Mapped[str] = mapped_column(String(100))


class RolPermiso(Base):
    __tablename__ = "rol_permiso"

    rol_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), primary_key=True)
    permiso_id: Mapped[int] = mapped_column(ForeignKey("permisos.id"), primary_key=True)


class Rol(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(30), unique=True)
    nombre: Mapped[str] = mapped_column(String(60))
    descripcion: Mapped[str] = mapped_column(String(200), default="")

    permisos: Mapped[list[Permiso]] = relationship(secondary="rol_permiso", lazy="selectin")


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(60), unique=True)
    nombre: Mapped[str] = mapped_column(String(120))
    correo: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(200))
    rol_id: Mapped[int] = mapped_column(ForeignKey("roles.id"))
    departamento_id: Mapped[int] = mapped_column(ForeignKey("departamentos.id"))
    nivel_seguridad: Mapped[int] = mapped_column(Integer, default=1)
    pais: Mapped[str] = mapped_column(String(40), default="PERU")
    tipo_contrato: Mapped[str] = mapped_column(String(20), default="INTERNO")  # INTERNO / EXTERNO
    estado: Mapped[str] = mapped_column(String(20), default="ACTIVO")  # ACTIVO / INACTIVO / SUSPENDIDO
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime, default=ahora)

    rol: Mapped[Rol] = relationship(lazy="joined")
    departamento: Mapped[Departamento] = relationship(lazy="joined")


class Documento(Base):
    __tablename__ = "documentos"

    id: Mapped[int] = mapped_column(primary_key=True)
    titulo: Mapped[str] = mapped_column(String(200))
    descripcion: Mapped[str] = mapped_column(Text, default="")
    propietario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    departamento_id: Mapped[int] = mapped_column(ForeignKey("departamentos.id"))
    nivel_confidencialidad: Mapped[int] = mapped_column(Integer, default=1)
    # BORRADOR / PENDIENTE / APROBADO / PUBLICADO
    estado: Mapped[str] = mapped_column(String(20), default="PENDIENTE")
    pais: Mapped[str] = mapped_column(String(40), default="PERU")
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    fecha_modificacion: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    aprobado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)

    propietario: Mapped[Usuario] = relationship(foreign_keys=[propietario_id], lazy="joined")
    aprobado_por: Mapped[Usuario | None] = relationship(foreign_keys=[aprobado_por_id], lazy="joined")
    departamento: Mapped[Departamento] = relationship(lazy="joined")


class Politica(Base):
    """Política ABAC. La lógica de cada política está en
    app/authorization/abac/policies.py; aquí se guarda si está activa y sus
    parámetros (roles exentos, niveles, horario...), que se pueden cambiar sin
    tocar el código."""

    __tablename__ = "politicas"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(40), unique=True)
    nombre: Mapped[str] = mapped_column(String(100))
    descripcion: Mapped[str] = mapped_column(Text)
    expresion: Mapped[str] = mapped_column(Text)
    activa: Mapped[bool] = mapped_column(Boolean, default=True)
    parametros: Mapped[str] = mapped_column(Text, default="{}")  # JSON
    orden: Mapped[int] = mapped_column(Integer, default=0)


class Auditoria(Base):
    __tablename__ = "auditoria"

    id: Mapped[int] = mapped_column(primary_key=True)
    fecha: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    usuario: Mapped[str] = mapped_column(String(60))
    usuario_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recurso: Mapped[str] = mapped_column(String(100))
    accion: Mapped[str] = mapped_column(String(40))
    resultado: Mapped[str] = mapped_column(String(20))  # PERMITIDO / DENEGADO
    etapa: Mapped[str] = mapped_column(String(20))  # AUTENTICACION / RBAC / ABAC
    motivo: Mapped[str] = mapped_column(Text)
    direccion_ip: Mapped[str] = mapped_column(String(60), default="")
    ubicacion: Mapped[str] = mapped_column(String(40), default="")
    dispositivo: Mapped[str] = mapped_column(String(40), default="")
