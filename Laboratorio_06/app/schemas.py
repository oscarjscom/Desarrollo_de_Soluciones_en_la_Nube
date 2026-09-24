from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Estado = Literal["ACTIVO", "INACTIVO", "SUSPENDIDO"]
Contrato = Literal["INTERNO", "EXTERNO"]
EstadoEditable = Literal["BORRADOR", "PENDIENTE"]


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UsuarioOut(BaseModel):
    id: int
    username: str
    nombre: str
    correo: str
    rol: str
    departamento: str
    nivel_seguridad: int
    pais: str
    tipo_contrato: str
    estado: str


class UsuarioCreate(BaseModel):
    username: str = Field(min_length=3, max_length=60)
    password: str = Field(min_length=8)
    nombre: str
    correo: EmailStr
    rol: str
    departamento: str
    nivel_seguridad: int = Field(ge=1, le=5)
    pais: str = "PERU"
    tipo_contrato: Contrato = "INTERNO"
    estado: Estado = "ACTIVO"


class UsuarioUpdate(BaseModel):
    nombre: str | None = None
    correo: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8)
    rol: str | None = None
    departamento: str | None = None
    nivel_seguridad: int | None = Field(default=None, ge=1, le=5)
    pais: str | None = None
    tipo_contrato: Contrato | None = None
    estado: Estado | None = None


class DocumentoOut(BaseModel):
    id: int
    titulo: str
    descripcion: str
    propietario_id: int
    propietario: str
    departamento: str
    nivel_confidencialidad: int
    estado: str
    pais: str
    fecha_creacion: datetime
    fecha_modificacion: datetime | None
    aprobado_por: str | None


class DocumentoCreate(BaseModel):
    titulo: str = Field(min_length=1, max_length=200)
    descripcion: str = ""
    departamento: str | None = None  # por defecto, el del usuario
    nivel_confidencialidad: int = Field(default=1, ge=1, le=5)
    pais: str | None = None  # por defecto, el del usuario
    estado: EstadoEditable = "PENDIENTE"


class DocumentoUpdate(BaseModel):
    titulo: str | None = Field(default=None, min_length=1, max_length=200)
    descripcion: str | None = None
    departamento: str | None = None
    nivel_confidencialidad: int | None = Field(default=None, ge=1, le=5)
    pais: str | None = None
    estado: EstadoEditable | None = None


class AuditoriaOut(BaseModel):
    id: int
    fecha: datetime
    usuario: str
    recurso: str
    accion: str
    resultado: str
    etapa: str
    motivo: str
    direccion_ip: str
    ubicacion: str
    dispositivo: str

    model_config = {"from_attributes": True}


class PoliticaOut(BaseModel):
    codigo: str
    nombre: str
    descripcion: str
    expresion: str
    activa: bool
    parametros: dict


class PoliticaUpdate(BaseModel):
    activa: bool | None = None
    parametros: dict | None = None
