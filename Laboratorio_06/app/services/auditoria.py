from sqlalchemy import select
from sqlalchemy.orm import Session

from app.authorization.abac.context import Entorno
from app.config import ahora
from app.models import Auditoria


class AuditoriaService:
    def __init__(self, db: Session):
        self.db = db

    def registrar(
        self,
        *,
        usuario: str,
        usuario_id: int | None,
        recurso: str,
        accion: str,
        permitido: bool,
        etapa: str,
        motivo: str,
        entorno: Entorno | None,
    ) -> Auditoria:
        registro = Auditoria(
            fecha=ahora(),
            usuario=usuario,
            usuario_id=usuario_id,
            recurso=recurso,
            accion=accion,
            resultado="PERMITIDO" if permitido else "DENEGADO",
            etapa=etapa,
            motivo=motivo,
            direccion_ip=entorno.direccion_ip if entorno else "",
            ubicacion=entorno.ubicacion if entorno else "",
            dispositivo=entorno.dispositivo if entorno else "",
        )
        self.db.add(registro)
        # Se guarda de inmediato para que quede aunque la petición termine en error.
        self.db.commit()
        return registro

    def listar(self, usuario=None, resultado=None, accion=None, limite=200) -> list[Auditoria]:
        q = select(Auditoria)
        if usuario:
            q = q.where(Auditoria.usuario == usuario)
        if resultado:
            q = q.where(Auditoria.resultado == resultado.upper())
        if accion:
            q = q.where(Auditoria.accion == accion.upper())
        return list(self.db.scalars(q.order_by(Auditoria.id.desc()).limit(limite)))
