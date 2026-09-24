from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_entorno, get_usuario_actual
from app.authorization.abac.context import Entorno
from app.database import get_db
from app.models import Departamento, Rol, Usuario
from app.schemas import UsuarioCreate, UsuarioOut, UsuarioUpdate
from app.services.usuarios import UsuarioService

router = APIRouter(tags=["Usuarios"])


@router.get("/usuarios", response_model=list[UsuarioOut])
def listar(u: Usuario = Depends(get_usuario_actual), e: Entorno = Depends(get_entorno), db: Session = Depends(get_db)):
    return UsuarioService(db).listar(u, e)


@router.post("/usuarios", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
def crear(data: UsuarioCreate, u: Usuario = Depends(get_usuario_actual), e: Entorno = Depends(get_entorno),
          db: Session = Depends(get_db)):
    return UsuarioService(db).crear(data, u, e)


@router.put("/usuarios/{usuario_id}", response_model=UsuarioOut)
def modificar(usuario_id: int, data: UsuarioUpdate, u: Usuario = Depends(get_usuario_actual),
              e: Entorno = Depends(get_entorno), db: Session = Depends(get_db)):
    return UsuarioService(db).modificar(usuario_id, data, u, e)


@router.get("/roles")
def roles(_: Usuario = Depends(get_usuario_actual), db: Session = Depends(get_db)):
    return [{"codigo": r.codigo, "nombre": r.nombre, "descripcion": r.descripcion}
            for r in db.scalars(select(Rol).order_by(Rol.id))]


@router.get("/departamentos")
def departamentos(_: Usuario = Depends(get_usuario_actual), db: Session = Depends(get_db)):
    return [{"codigo": d.codigo, "nombre": d.nombre} for d in db.scalars(select(Departamento).order_by(Departamento.id))]
