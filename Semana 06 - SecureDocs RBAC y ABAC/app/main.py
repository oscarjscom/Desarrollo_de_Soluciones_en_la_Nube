import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from sqlalchemy.exc import OperationalError

from app.database import Base, SessionLocal, engine
from app.routers import auth, documentos, seguridad, usuarios
from app.seed import seed

STATIC = Path(__file__).parent / "static"


def iniciar_bd(reintentos: int = 20):
    """Crea las tablas y carga los datos iniciales. Reintenta porque en Docker la
    BD (MySQL) puede tardar unos segundos en levantar."""
    for intento in range(reintentos):
        try:
            Base.metadata.create_all(engine)
            break
        except OperationalError:
            if intento == reintentos - 1:
                raise
            time.sleep(3)
    with SessionLocal() as db:
        seed(db)


@asynccontextmanager
async def lifespan(_: FastAPI):
    iniciar_bd()
    yield


app = FastAPI(
    title="SecureDocs",
    description="Gestión de expedientes con control de acceso RBAC + ABAC (Laboratorio 06 - Cloud Security)",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(auth.router)
app.include_router(usuarios.router)
app.include_router(documentos.router)
app.include_router(seguridad.router)


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC / "index.html")
