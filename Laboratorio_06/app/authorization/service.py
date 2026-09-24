"""Servicio de autorización: combina RBAC + ABAC y registra la auditoría.

    Usuario autenticado -> RBAC (¿su rol tiene el permiso?)
                             NO -> DENEGAR
                             SÍ -> ABAC (¿cumple las políticas?)
                                     NO -> DENEGAR
                                     SÍ -> AUTORIZAR
"""
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.authorization.abac.context import ContextoAutorizacion, Entorno, atributos_usuario
from app.authorization.abac.engine import ABACEngine
from app.authorization.rbac import RBACService
from app.models import Usuario
from app.services.auditoria import AuditoriaService


@dataclass
class Decision:
    permitido: bool
    etapa: str  # RBAC / ABAC
    motivo: str


class AuthorizationService:
    def __init__(self, db: Session):
        self.rbac = RBACService(db)
        self.abac = ABACEngine(db)
        self.auditoria = AuditoriaService(db)

    def autorizar(
        self,
        usuario: Usuario,
        accion: str,
        entorno: Entorno,
        recurso: dict | None = None,
        recurso_id: str = "-",
        registrar: bool = True,
    ) -> Decision:
        if not self.rbac.tiene_permiso(usuario, accion):
            decision = Decision(False, "RBAC", f"El rol {usuario.rol.codigo} no tiene el permiso {accion}")
        else:
            ctx = ContextoAutorizacion(atributos_usuario(usuario), recurso, accion, entorno)
            res = self.abac.evaluar(ctx)
            if res.permitido:
                aplicadas = ", ".join(res.evaluadas) or "ninguna aplicable"
                decision = Decision(True, "ABAC", f"RBAC permitido; políticas ABAC cumplidas: {aplicadas}")
            else:
                decision = Decision(False, "ABAC", "; ".join(res.motivos))

        if registrar:
            self.registrar(usuario, accion, entorno, recurso_id, decision)
        return decision

    def registrar(self, usuario: Usuario, accion: str, entorno: Entorno, recurso_id: str, decision: Decision):
        self.auditoria.registrar(
            usuario=usuario.username,
            usuario_id=usuario.id,
            recurso=recurso_id,
            accion=accion,
            permitido=decision.permitido,
            etapa=decision.etapa,
            motivo=decision.motivo,
            entorno=entorno,
        )

    @staticmethod
    def denegar(decision: Decision):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail={"resultado": "DENEGADO", "etapa": decision.etapa, "motivo": decision.motivo},
        )

    def exigir(self, usuario: Usuario, accion: str, entorno: Entorno, recurso: dict | None = None,
               recurso_id: str = "-") -> Decision:
        """Igual que autorizar(), pero lanza 403 si la decisión es DENEGAR."""
        decision = self.autorizar(usuario, accion, entorno, recurso, recurso_id)
        if not decision.permitido:
            self.denegar(decision)
        return decision
