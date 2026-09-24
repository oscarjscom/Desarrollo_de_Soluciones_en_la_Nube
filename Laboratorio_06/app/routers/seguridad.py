"""Auditoría, matriz RBAC y políticas ABAC."""
import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_entorno, get_usuario_actual
from app.authorization.abac.context import Entorno
from app.authorization.abac.policies import REGISTRO
from app.authorization.rbac import RBACService
from app.authorization.service import AuthorizationService
from app.database import get_db
from app.models import Politica, Usuario
from app.schemas import AuditoriaOut, PoliticaOut, PoliticaUpdate
from app.services.auditoria import AuditoriaService

router = APIRouter(tags=["Seguridad"])


def _politica_out(p: Politica) -> PoliticaOut:
    return PoliticaOut(codigo=p.codigo, nombre=p.nombre, descripcion=p.descripcion,
                       expresion=p.expresion, activa=p.activa, parametros=json.loads(p.parametros or "{}"))


@router.get("/auditoria", response_model=list[AuditoriaOut])
def auditoria(usuario: str | None = None, resultado: str | None = None, accion: str | None = None,
              limite: int = 200, u: Usuario = Depends(get_usuario_actual), e: Entorno = Depends(get_entorno),
              db: Session = Depends(get_db)):
    AuthorizationService(db).exigir(u, "VIEW_AUDIT", e, recurso_id="auditoria")
    return AuditoriaService(db).listar(usuario, resultado, accion, min(limite, 1000))


@router.get("/rbac/matriz")
def matriz_rbac(_: Usuario = Depends(get_usuario_actual), db: Session = Depends(get_db)):
    return RBACService(db).matriz()


@router.get("/politicas", response_model=list[PoliticaOut])
def listar_politicas(u: Usuario = Depends(get_usuario_actual), e: Entorno = Depends(get_entorno),
                     db: Session = Depends(get_db)):
    AuthorizationService(db).exigir(u, "MANAGE_POLICIES", e, recurso_id="politicas")
    return [_politica_out(p) for p in db.scalars(select(Politica).order_by(Politica.orden))]


@router.put("/politicas/{codigo}", response_model=PoliticaOut)
def modificar_politica(codigo: str, data: PoliticaUpdate, u: Usuario = Depends(get_usuario_actual),
                       e: Entorno = Depends(get_entorno), db: Session = Depends(get_db)):
    AuthorizationService(db).exigir(u, "MANAGE_POLICIES", e, recurso_id=f"politica-{codigo.upper()}")
    pol = db.scalar(select(Politica).where(Politica.codigo == codigo.upper()))
    if pol is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Política no encontrada")
    if pol.codigo not in REGISTRO:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Política sin implementación")
    if data.activa is not None:
        pol.activa = data.activa
    if data.parametros is not None:
        pol.parametros = json.dumps(data.parametros)
    db.commit()
    return _politica_out(pol)
