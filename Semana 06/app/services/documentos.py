from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.authorization.abac.context import Entorno, atributos_documento
from app.authorization.service import AuthorizationService, Decision
from app.config import ahora
from app.models import Departamento, Documento, Usuario
from app.schemas import DocumentoCreate, DocumentoOut, DocumentoUpdate


def documento_out(d: Documento) -> DocumentoOut:
    return DocumentoOut(
        id=d.id, titulo=d.titulo, descripcion=d.descripcion, propietario_id=d.propietario_id,
        propietario=d.propietario.username, departamento=d.departamento.codigo,
        nivel_confidencialidad=d.nivel_confidencialidad, estado=d.estado, pais=d.pais,
        fecha_creacion=d.fecha_creacion, fecha_modificacion=d.fecha_modificacion,
        aprobado_por=d.aprobado_por.username if d.aprobado_por else None,
    )


class DocumentoService:
    def __init__(self, db: Session):
        self.db = db
        self.authz = AuthorizationService(db)

    def _departamento(self, codigo: str) -> Departamento:
        dep = self.db.scalar(select(Departamento).where(Departamento.codigo == codigo.upper()))
        if dep is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Departamento {codigo} no existe")
        return dep

    def _cargar(self, doc_id: int) -> Documento:
        doc = self.db.get(Documento, doc_id)
        if doc is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Documento no encontrado")
        return doc

    def listar(self, actor: Usuario, entorno: Entorno) -> list[DocumentoOut]:
        """Devuelve solo los documentos que el usuario puede consultar ahora mismo."""
        base = self.authz.autorizar(actor, "READ", entorno, recurso_id="documentos", registrar=False)
        if not base.permitido:
            self.authz.registrar(actor, "READ", entorno, "documentos", base)
            self.authz.denegar(base)
        docs = list(self.db.scalars(select(Documento).order_by(Documento.id)))
        visibles = [
            d for d in docs
            if self.authz.autorizar(actor, "READ", entorno, atributos_documento(d), registrar=False).permitido
        ]
        self.authz.registrar(actor, "READ", entorno, "documentos", Decision(
            True, "ABAC", f"Listado: {len(visibles)} de {len(docs)} documentos visibles"))
        return [documento_out(d) for d in visibles]

    def obtener(self, doc_id: int, actor: Usuario, entorno: Entorno) -> DocumentoOut:
        doc = self._cargar(doc_id)
        self.authz.exigir(actor, "READ", entorno, atributos_documento(doc), f"documento-{doc.id}")
        return documento_out(doc)

    def crear(self, data: DocumentoCreate, actor: Usuario, entorno: Entorno) -> DocumentoOut:
        dep = self._departamento(data.departamento) if data.departamento else actor.departamento
        pais = (data.pais or actor.pais).upper()
        # El recurso aún no existe: se evalúa con los atributos que tendría.
        propuesto = {
            "id": None, "titulo": data.titulo, "departamento": dep.codigo,
            "nivel_confidencialidad": data.nivel_confidencialidad, "estado": data.estado,
            "pais": pais, "propietario": actor.id,
        }
        self.authz.exigir(actor, "CREATE", entorno, propuesto, "documento-nuevo")
        doc = Documento(
            titulo=data.titulo, descripcion=data.descripcion, propietario_id=actor.id,
            departamento=dep, nivel_confidencialidad=data.nivel_confidencialidad,
            estado=data.estado, pais=pais, fecha_creacion=ahora(),
        )
        self.db.add(doc)
        self.db.commit()
        return documento_out(doc)

    def modificar(self, doc_id: int, data: DocumentoUpdate, actor: Usuario, entorno: Entorno) -> DocumentoOut:
        doc = self._cargar(doc_id)
        recurso_id = f"documento-{doc.id}"
        actual = atributos_documento(doc)
        decision = self.authz.autorizar(actor, "UPDATE", entorno, actual, recurso_id, registrar=False)
        if decision.permitido:
            # También se valida cómo quedaría el documento, para que nadie lo mueva
            # a un departamento o nivel donde ya no tendría acceso.
            nuevo = dict(actual)
            if data.departamento is not None:
                nuevo["departamento"] = self._departamento(data.departamento).codigo
            if data.nivel_confidencialidad is not None:
                nuevo["nivel_confidencialidad"] = data.nivel_confidencialidad
            if data.pais is not None:
                nuevo["pais"] = data.pais.upper()
            if data.estado is not None:
                nuevo["estado"] = data.estado
            if nuevo != actual:
                despues = self.authz.autorizar(actor, "UPDATE", entorno, nuevo, recurso_id, registrar=False)
                if not despues.permitido:
                    decision = Decision(False, "ABAC", "El cambio dejaría el documento fuera de lo permitido: "
                                        + despues.motivo)
        self.authz.registrar(actor, "UPDATE", entorno, recurso_id, decision)
        if not decision.permitido:
            self.authz.denegar(decision)

        if data.titulo is not None:
            doc.titulo = data.titulo
        if data.descripcion is not None:
            doc.descripcion = data.descripcion
        if data.departamento is not None:
            doc.departamento = self._departamento(data.departamento)
        if data.nivel_confidencialidad is not None:
            doc.nivel_confidencialidad = data.nivel_confidencialidad
        if data.pais is not None:
            doc.pais = data.pais.upper()
        if data.estado is not None:
            doc.estado = data.estado
        doc.fecha_modificacion = ahora()
        self.db.commit()
        return documento_out(doc)

    def eliminar(self, doc_id: int, actor: Usuario, entorno: Entorno) -> None:
        doc = self._cargar(doc_id)
        self.authz.exigir(actor, "DELETE", entorno, atributos_documento(doc), f"documento-{doc.id}")
        self.db.delete(doc)
        self.db.commit()

    def aprobar(self, doc_id: int, actor: Usuario, entorno: Entorno) -> DocumentoOut:
        doc = self._cargar(doc_id)
        self.authz.exigir(actor, "APPROVE", entorno, atributos_documento(doc), f"documento-{doc.id}")
        if doc.estado != "PENDIENTE":
            raise HTTPException(status.HTTP_409_CONFLICT, f"Solo se aprueban documentos PENDIENTE (está {doc.estado})")
        doc.estado = "APROBADO"
        doc.aprobado_por = actor
        doc.fecha_modificacion = ahora()
        self.db.commit()
        return documento_out(doc)

    def publicar(self, doc_id: int, actor: Usuario, entorno: Entorno) -> DocumentoOut:
        """Publicar también requiere el permiso de aprobar."""
        doc = self._cargar(doc_id)
        self.authz.exigir(actor, "APPROVE", entorno, atributos_documento(doc), f"documento-{doc.id}")
        if doc.estado != "APROBADO":
            raise HTTPException(status.HTTP_409_CONFLICT, f"Solo se publican documentos APROBADO (está {doc.estado})")
        doc.estado = "PUBLICADO"
        doc.fecha_modificacion = ahora()
        self.db.commit()
        return documento_out(doc)
