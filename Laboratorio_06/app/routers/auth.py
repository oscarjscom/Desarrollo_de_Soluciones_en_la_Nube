from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_entorno, get_usuario_actual
from app.authorization.abac.context import Entorno
from app.authorization.rbac import RBACService
from app.database import get_db
from app.models import Usuario
from app.schemas import LoginIn, TokenOut
from app.services.auditoria import AuditoriaService
from app.services.auth import AuthService
from app.services.usuarios import usuario_out

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, entorno: Entorno = Depends(get_entorno), db: Session = Depends(get_db)):
    return TokenOut(access_token=AuthService(db).login(data.username, data.password, entorno))


@router.post("/logout")
def logout(usuario: Usuario = Depends(get_usuario_actual), entorno: Entorno = Depends(get_entorno),
           db: Session = Depends(get_db)):
    """El JWT no guarda estado en el servidor: el cliente borra el token. Se registra
    en la auditoría para tener la trazabilidad de la sesión."""
    AuditoriaService(db).registrar(usuario=usuario.username, usuario_id=usuario.id, recurso="sesion",
                                   accion="LOGOUT", permitido=True, etapa="AUTENTICACION",
                                   motivo="Cierre de sesión", entorno=entorno)
    return {"mensaje": "Sesión cerrada"}


@router.get("/me")
def me(usuario: Usuario = Depends(get_usuario_actual), entorno: Entorno = Depends(get_entorno),
       db: Session = Depends(get_db)):
    return {
        "usuario": usuario_out(usuario),
        "permisos": sorted(RBACService(db).permisos_de(usuario)),
        "entorno": entorno.como_dict(),
    }
