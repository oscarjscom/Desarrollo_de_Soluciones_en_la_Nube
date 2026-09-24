"""Dependencias de FastAPI: usuario autenticado y atributos del entorno."""
from datetime import datetime

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.security import decodificar_token
from app.authorization.abac.context import Entorno
from app.config import DEMO_MODE, ahora
from app.database import get_db
from app.models import Usuario

bearer = HTTPBearer(auto_error=False)


def get_usuario_actual(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    """Autenticación: valida el JWT y carga al usuario.

    El estado del usuario (ACTIVO/INACTIVO) NO se revisa aquí: lo evalúa la
    política ABAC ESTADO_USUARIO en cada operación, así un token emitido antes de
    desactivar a alguien deja de servir de inmediato y el rechazo queda auditado.
    """
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No autenticado: falta el token")
    try:
        payload = decodificar_token(cred.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido")

    usuario = db.get(Usuario, int(payload["sub"]))
    if usuario is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "El usuario del token no existe")
    return usuario


def get_entorno(request: Request) -> Entorno:
    """Atributos del entorno de la petición.

    - hora/fecha: reloj del servidor (en modo demo se puede simular con X-Hora: HH:MM).
    - direccion_ip: IP del cliente.
    - ubicacion y dispositivo: en este laboratorio los envía el cliente en las
      cabeceras X-Ubicacion y X-Dispositivo. En un sistema real saldrían de un
      servicio de geolocalización por IP y de un gestor de dispositivos (MDM) o
      un certificado del equipo corporativo.
    """
    momento = ahora()
    hora = momento.time()
    hora_simulada = request.headers.get("X-Hora")
    if DEMO_MODE and hora_simulada:
        try:
            hora = datetime.strptime(hora_simulada.strip(), "%H:%M").time()
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "X-Hora debe tener formato HH:MM")

    return Entorno(
        hora=hora,
        fecha=momento.date(),
        direccion_ip=request.client.host if request.client else "desconocida",
        ubicacion=(request.headers.get("X-Ubicacion") or "DESCONOCIDA").strip().upper(),
        dispositivo=(request.headers.get("X-Dispositivo") or "PERSONAL").strip().upper(),
    )
