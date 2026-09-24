# Evidencias de los casos de prueba

Generado el 2026-09-23 23:25 con `python -m scripts.generar_evidencias` sobre una base de datos nueva.
Resultado: **17 de 17 casos correctos.**

## Casos obligatorios

| # | Escenario | Usuario | Petición | Entorno | Esperado | Obtenido | Motivo | OK |
|---|---|---|---|---|---|---|---|---|
| 1 | Empleado consulta documento de su área | `luis.perez` | `GET /documentos/1` | Ubicacion=PERU, Dispositivo=CORPORATIVO, Hora=10:30 | PERMITIDO | PERMITIDO (HTTP 200) | - | ✅ |
| 2 | Empleado consulta documento de otra área | `luis.perez` | `GET /documentos/2` | Ubicacion=PERU, Dispositivo=CORPORATIVO, Hora=10:30 | DENEGADO (ABAC) | DENEGADO (ABAC) (HTTP 403) | [DEPARTAMENTO] Departamento distinto: el documento es de RRHH y el usuario de FINANZAS | ✅ |
| 3 | Supervisor aprueba documento de su área | `carlos.ruiz` | `POST /documentos/3/aprobar` | Ubicacion=PERU, Dispositivo=CORPORATIVO, Hora=10:30 | PERMITIDO | PERMITIDO (HTTP 200) | - | ✅ |
| 4 | Empleado intenta aprobar documento | `luis.perez` | `POST /documentos/10/aprobar` | Ubicacion=PERU, Dispositivo=CORPORATIVO, Hora=10:30 | DENEGADO (RBAC) | DENEGADO (RBAC) (HTTP 403) | El rol EMPLEADO no tiene el permiso APPROVE | ✅ |
| 5 | Usuario nivel 2 consulta documento nivel 4 | `luis.perez` | `GET /documentos/4` | Ubicacion=PERU, Dispositivo=CORPORATIVO, Hora=10:30 | DENEGADO (ABAC) | DENEGADO (ABAC) (HTTP 403) | [NIVEL_SEGURIDAD] Nivel de seguridad insuficiente: 2 < 4 | ✅ |
| 6 | Gerente elimina documento | `maria.gomez` | `DELETE /documentos/8` | Ubicacion=PERU, Dispositivo=CORPORATIVO, Hora=10:30 | PERMITIDO | PERMITIDO (HTTP 204) | - | ✅ |
| 7 | Auditor intenta modificar documento | `jorge.salas` | `PUT /documentos/1` | Ubicacion=PERU, Dispositivo=CORPORATIVO, Hora=10:30 | DENEGADO (RBAC) | DENEGADO (RBAC) (HTTP 403) | El rol AUDITOR no tiene el permiso UPDATE | ✅ |
| 8 | Usuario inactivo intenta acceder | `pedro.inactivo` | `POST /auth/login` | Ubicacion=PERU, Dispositivo=CORPORATIVO, Hora=10:30 | DENEGADO (AUTENTICACION) | DENEGADO (AUTENTICACION) (HTTP 403) | [ESTADO_USUARIO] Usuario INACTIVO: no puede acceder al sistema | ✅ |
| 9 | Documento confidencial accedido fuera de horario | `maria.gomez` | `GET /documentos/4` | Ubicacion=PERU, Dispositivo=CORPORATIVO, Hora=20:30 | DENEGADO (ABAC) | DENEGADO (ABAC) (HTTP 403) | [HORARIO] Documento de nivel 4 fuera del horario autorizado (08:00-18:00); hora de la petición 20:30 | ✅ |
| 10 | Documento nivel 5 accedido desde dispositivo personal | `maria.gomez` | `GET /documentos/5` | Ubicacion=PERU, Dispositivo=PERSONAL, Hora=10:30 | DENEGADO (ABAC) | DENEGADO (ABAC) (HTTP 403) | [DISPOSITIVO] Documento de nivel 5 solo desde dispositivo CORPORATIVO (petición desde PERSONAL) | ✅ |
| 11 | Invitado accede a documento público | `invitado.ext` | `GET /documentos/6` | Ubicacion=PERU, Dispositivo=CORPORATIVO, Hora=10:30 | PERMITIDO | PERMITIDO (HTTP 200) | - | ✅ |
| 12 | Invitado accede a documento confidencial | `invitado.ext` | `GET /documentos/7` | Ubicacion=PERU, Dispositivo=CORPORATIVO, Hora=10:30 | DENEGADO (ABAC) | DENEGADO (ABAC) (HTTP 403) | [NIVEL_SEGURIDAD] Nivel de seguridad insuficiente: 1 < 3; [INVITADO] Invitado sin acceso: confidencialidad 3 > 1, documento en estado APROBADO (debe estar PUBLICADO) | ✅ |

## Casos adicionales

| # | Escenario | Usuario | Petición | Entorno | Esperado | Obtenido | Motivo | OK |
|---|---|---|---|---|---|---|---|---|
| 13 | Empleado modifica documento de su área que no creó | `luis.perez` | `PUT /documentos/10` | Ubicacion=PERU, Dispositivo=CORPORATIVO, Hora=10:30 | DENEGADO (ABAC) | DENEGADO (ABAC) (HTTP 403) | [PROPIEDAD] Solo el propietario puede modificar este documento | ✅ |
| 14 | Gerente modifica documento de otro usuario de su área | `maria.gomez` | `PUT /documentos/10` | Ubicacion=PERU, Dispositivo=CORPORATIVO, Hora=10:30 | PERMITIDO | PERMITIDO (HTTP 200) | - | ✅ |
| 15 | Empleado consulta documento de Perú desde Chile | `luis.perez` | `GET /documentos/1` | Ubicacion=CHILE, Dispositivo=CORPORATIVO, Hora=10:30 | DENEGADO (ABAC) | DENEGADO (ABAC) (HTTP 403) | [PAIS] Ubicación no autorizada: el documento de PERU solo se consulta desde PERU (petición desde CHILE) | ✅ |
| 16 | Supervisor intenta gestionar usuarios | `carlos.ruiz` | `GET /usuarios` | Ubicacion=PERU, Dispositivo=CORPORATIVO, Hora=10:30 | DENEGADO (RBAC) | DENEGADO (RBAC) (HTTP 403) | El rol SUPERVISOR no tiene el permiso MANAGE_USERS | ✅ |
| 17 | Admin desactiva la política de horario y el caso 9 pasa a permitido | `maria.gomez` | `GET /documentos/4` | Ubicacion=PERU, Dispositivo=CORPORATIVO, Hora=20:30 | PERMITIDO | PERMITIDO (HTTP 200) | - | ✅ |

El registro de auditoría completo de esta corrida está en [auditoria.json](auditoria.json).
