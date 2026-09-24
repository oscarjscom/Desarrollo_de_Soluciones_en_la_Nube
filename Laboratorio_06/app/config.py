"""Configuración de la aplicación (se lee de variables de entorno)."""
import os
from datetime import datetime
from zoneinfo import ZoneInfo

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./securedocs.db")

JWT_SECRET = os.getenv("JWT_SECRET", "clave-de-desarrollo-cambiar-en-produccion-securedocs")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

APP_TIMEZONE = os.getenv("APP_TIMEZONE", "America/Lima")

# En modo demo se acepta la cabecera X-Hora para simular la hora de la petición
# (sirve para probar la política de horario). En producción debe ir en false.
DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"


def ahora() -> datetime:
    """Fecha y hora actual en la zona horaria de la app (sin tzinfo, para la BD)."""
    return datetime.now(ZoneInfo(APP_TIMEZONE)).replace(tzinfo=None, microsecond=0)
