"""Servicio de autenticación (login)."""
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import crear_token, verify_password
from app.authorization.abac.context import ContextoAutorizacion, Entorno, atributos_usuario
from app.authorization.abac.engine import ABACEngine
from app.models import Usuario
from app.services.auditoria import AuditoriaService


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.auditoria = AuditoriaService(db)
        self.abac = ABACEngine(db)

    def login(self, username: str, password: str, entorno: Entorno) -> str:
        usuario = self.db.scalar(select(Usuario).where(Usuario.username == username))
        if usuario is None or not verify_password(password, usuario.password_hash):
            self.auditoria.registrar(
                usuario=username, usuario_id=usuario.id if usuario else None, recurso="sesion",
                accion="LOGIN", permitido=False, etapa="AUTENTICACION",
                motivo="Credenciales inválidas", entorno=entorno,
            )
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario o contraseña incorrectos")

        # ¿Usuario válido? Se reutilizan las políticas ABAC que aplican a LOGIN
        # (ESTADO_USUARIO), así la regla está en un solo lugar.
        ctx = ContextoAutorizacion(atributos_usuario(usuario), None, "LOGIN", entorno)
        res = self.abac.evaluar(ctx)
        if not res.permitido:
            motivo = "; ".join(res.motivos)
            self.auditoria.registrar(
                usuario=username, usuario_id=usuario.id, recurso="sesion", accion="LOGIN",
                permitido=False, etapa="AUTENTICACION", motivo=motivo, entorno=entorno,
            )
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail={"resultado": "DENEGADO", "etapa": "AUTENTICACION", "motivo": motivo},
            )

        self.auditoria.registrar(
            usuario=username, usuario_id=usuario.id, recurso="sesion", accion="LOGIN",
            permitido=True, etapa="AUTENTICACION", motivo="Inicio de sesión correcto", entorno=entorno,
        )
        return crear_token(usuario.id, usuario.username)
