from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_entorno, get_usuario_actual
from app.authorization.abac.context import Entorno
from app.database import get_db
from app.models import Usuario
from app.schemas import DocumentoCreate, DocumentoOut, DocumentoUpdate
from app.services.documentos import DocumentoService

router = APIRouter(prefix="/documentos", tags=["Documentos"])


@router.get("", response_model=list[DocumentoOut])
def listar(u: Usuario = Depends(get_usuario_actual), e: Entorno = Depends(get_entorno), db: Session = Depends(get_db)):
    return DocumentoService(db).listar(u, e)


@router.get("/{doc_id}", response_model=DocumentoOut)
def obtener(doc_id: int, u: Usuario = Depends(get_usuario_actual), e: Entorno = Depends(get_entorno),
            db: Session = Depends(get_db)):
    return DocumentoService(db).obtener(doc_id, u, e)


@router.post("", response_model=DocumentoOut, status_code=status.HTTP_201_CREATED)
def crear(data: DocumentoCreate, u: Usuario = Depends(get_usuario_actual), e: Entorno = Depends(get_entorno),
          db: Session = Depends(get_db)):
    return DocumentoService(db).crear(data, u, e)


@router.put("/{doc_id}", response_model=DocumentoOut)
def modificar(doc_id: int, data: DocumentoUpdate, u: Usuario = Depends(get_usuario_actual),
              e: Entorno = Depends(get_entorno), db: Session = Depends(get_db)):
    return DocumentoService(db).modificar(doc_id, data, u, e)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(doc_id: int, u: Usuario = Depends(get_usuario_actual), e: Entorno = Depends(get_entorno),
             db: Session = Depends(get_db)):
    DocumentoService(db).eliminar(doc_id, u, e)


@router.post("/{doc_id}/aprobar", response_model=DocumentoOut)
def aprobar(doc_id: int, u: Usuario = Depends(get_usuario_actual), e: Entorno = Depends(get_entorno),
            db: Session = Depends(get_db)):
    return DocumentoService(db).aprobar(doc_id, u, e)


@router.post("/{doc_id}/publicar", response_model=DocumentoOut)
def publicar(doc_id: int, u: Usuario = Depends(get_usuario_actual), e: Entorno = Depends(get_entorno),
             db: Session = Depends(get_db)):
    return DocumentoService(db).publicar(doc_id, u, e)
