# Laboratorio 06 - SecureDocs: control de acceso con RBAC y ABAC

Curso: Desarrollo de Soluciones en la Nube
Tema: Seguridad en la nube (Cloud Security)
Integrantes: Oscar Olano

SecureDocs es una aplicación web para gestionar los documentos y expedientes de la empresa TechCorp
S.A. Cada operación se autoriza en dos pasos:

1. **RBAC:** ¿el rol del usuario tiene permiso para esta operación?
2. **ABAC:** ¿la puede hacer en estas condiciones? Se revisa el departamento, el nivel de seguridad,
   quién es el propietario, el horario, el país, el dispositivo, el estado del usuario y las reglas
   para invitados.

Solo se autoriza si pasan las dos, y cada intento (permitido o denegado) queda en la auditoría con
su motivo.

**Stack:** Python 3.12 · FastAPI · SQLAlchemy · JWT (PyJWT) · bcrypt · SQLite (local) o MySQL (Docker) ·
HTML + Bootstrap · pytest

## Estructura

```
Laboratorio_06/
├── app/
│   ├── main.py                    # arranque de la API, crea tablas y carga datos
│   ├── models.py                  # Usuario, Rol, Permiso, RolPermiso, Documento, Departamento, Politica, Auditoria
│   ├── seed.py                    # matriz RBAC, políticas ABAC, usuarios y documentos de ejemplo
│   ├── auth/                      # Authentication: JWT, bcrypt, atributos del entorno
│   ├── authorization/
│   │   ├── rbac.py                # RBAC: usuario -> rol -> permisos
│   │   ├── abac/engine.py         # motor de políticas ABAC
│   │   ├── abac/policies.py       # las 8 políticas (una función cada una)
│   │   └── service.py             # RBAC + ABAC + auditoría
│   ├── services/                  # documentos, usuarios, auth, auditoría
│   ├── routers/                   # endpoints REST
│   └── static/index.html          # frontend
├── tests/                         # 17 casos de prueba + pruebas complementarias
├── scripts/generar_evidencias.py  # corre los casos y guarda las evidencias
├── docs/                          # arquitectura, modelo de datos, matrices RBAC y ABAC
├── evidencias/                    # resultados de los casos y registro de auditoría
├── Dockerfile
└── docker-compose.yml             # API + MySQL
```

## Instalación

### Opción 1: local con Python (usa SQLite, no necesita nada más)

```bash
git clone https://github.com/oscarjscom/Desarrollo_de_Soluciones_en_la_Nube.git
cd "Desarrollo_de_Soluciones_en_la_Nube/Semana 06"

python -m venv venv
# Windows:      venv\Scripts\activate
# Linux/macOS:  source venv/bin/activate
pip install -r requirements-dev.txt

uvicorn app.main:app --reload
```

### Opción 2: Docker (API + MySQL)

```bash
cd "Desarrollo_de_Soluciones_en_la_Nube/Semana 06"
docker compose up --build
```

Con cualquiera de las dos:

- Aplicación: <http://localhost:8000>
- Documentación interactiva de la API (Swagger): <http://localhost:8000/docs>

Al arrancar por primera vez se crean las tablas y se cargan los datos de ejemplo.

## Usuarios de prueba

Todos tienen la contraseña **`SecureDocs2026`**.

| Usuario | Rol | Departamento | Nivel | Notas |
|---|---|---|:-:|---|
| `admin` | Administrador | TI | 5 | |
| `maria.gomez` | Gerente | FINANZAS | 5 | |
| `carlos.ruiz` | Supervisor | FINANZAS | 3 | |
| `ana.torres` | Supervisor | FINANZAS | 3 | |
| `luis.perez` | Empleado | FINANZAS | 2 | |
| `rosa.diaz` | Empleado | RRHH | 2 | |
| `jorge.salas` | Auditor | AUDITORIA | 5 | |
| `invitado.ext` | Invitado | FINANZAS | 1 | contrato EXTERNO |
| `pedro.inactivo` | Empleado | FINANZAS | 2 | estado INACTIVO |

## Cómo se simula el entorno

Arriba de la página hay un panel **"Entorno de la petición"** para elegir la ubicación (PERU, CHILE...),
el dispositivo (CORPORATIVO / PERSONAL) y una hora simulada. El frontend los manda en las cabeceras
`X-Ubicacion`, `X-Dispositivo` y `X-Hora`. Si la hora se deja vacía, se usa la hora real del
servidor (zona America/Lima).

`X-Hora` solo se acepta con `DEMO_MODE=true` (viene activado para el laboratorio). En producción se
pone en `false`, y la ubicación y el dispositivo saldrían de geolocalización por IP y de un gestor de
dispositivos, no de lo que diga el cliente.

## API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/login` | Inicia sesión y devuelve el JWT |
| POST | `/auth/logout` | Cierra sesión (queda en la auditoría) |
| GET | `/auth/me` | Usuario autenticado, sus permisos y el entorno detectado |
| GET / POST | `/usuarios` | Listar / registrar usuarios |
| PUT | `/usuarios/{id}` | Modificar, activar/desactivar, asignar rol, departamento y nivel |
| GET / POST | `/documentos` | Listar (solo los que puedes ver) / crear |
| GET / PUT / DELETE | `/documentos/{id}` | Consultar / modificar / eliminar |
| POST | `/documentos/{id}/aprobar` | Aprobar un documento PENDIENTE |
| POST | `/documentos/{id}/publicar` | Publicar un documento APROBADO |
| GET | `/auditoria` | Registro de auditoría (filtros: `usuario`, `resultado`, `accion`) |
| GET | `/rbac/matriz` | Matriz de roles y permisos |
| GET / PUT | `/politicas`, `/politicas/{codigo}` | Ver, activar/desactivar y editar las políticas ABAC |

Cuando se deniega un acceso, la API responde `403` indicando en qué etapa falló y por qué:

```json
{"detail": {"resultado": "DENEGADO", "etapa": "ABAC",
            "motivo": "[NIVEL_SEGURIDAD] Nivel de seguridad insuficiente: 2 < 4"}}
```

## Pruebas

```bash
pytest -v                               # 17 casos + pruebas complementarias
python -m scripts.generar_evidencias    # regenera evidencias/casos_de_prueba.md y auditoria.json
```

Casos adicionales que diseñamos (13 al 17):

| # | Escenario | Esperado |
|---|---|---|
| 13 | Empleado modifica un documento de su área que no creó | Denegado por ABAC (propiedad) |
| 14 | Gerente modifica un documento de otro usuario de su área | Permitido (exento de propiedad) |
| 15 | Empleado consulta un documento de Perú desde Chile | Denegado por ABAC (país) |
| 16 | Supervisor intenta gestionar usuarios | Denegado por RBAC |
| 17 | El admin desactiva la política de horario y el caso 9 pasa a permitido | Permitido: las políticas se cambian sin tocar el código |

## Entregables

| # | Entregable | Dónde está |
|---|---|---|
| 1 | Código fuente | `app/` |
| 2 | Repositorio Git | este repo |
| 3 | README con instrucciones | este archivo |
| 4 | Diagrama de arquitectura | [docs/arquitectura.md](docs/arquitectura.md) |
| 5 | Modelo de base de datos | [docs/modelo-datos.md](docs/modelo-datos.md) |
| 6 | Matriz RBAC | [docs/matriz-rbac.md](docs/matriz-rbac.md) |
| 7 | Matriz de políticas ABAC | [docs/matriz-abac.md](docs/matriz-abac.md) |
| 8 | Evidencias de los casos de prueba | [evidencias/casos_de_prueba.md](evidencias/casos_de_prueba.md) |
| 9 | Registro de auditoría | [evidencias/auditoria.json](evidencias/auditoria.json) y pestaña "Auditoría" |
| 10 | Video o demostración | *pendiente: agregar enlace* |

## Conclusiones

- Tener un permiso por rol no significa poder acceder a cualquier recurso. Con RBAC se responde
  "¿qué puede hacer este rol?", pero hace falta ABAC para responder "¿lo puede hacer con este
  documento, a esta hora y desde este equipo?". Por ejemplo, un empleado sí puede modificar
  documentos, pero no los de otra área ni los que no creó.
- Separar la autenticación, el RBAC y el motor ABAC en componentes distintos, y guardar las reglas en
  la base de datos, permite cambiar una política (como el horario o quién está exento) sin tocar el
  código. Eso se vio en el caso 17.
- Registrar cada intento de acceso con su motivo da la trazabilidad que TechCorp no tenía: se ve quién
  intentó entrar a qué, cuándo, desde dónde y por qué se le negó.
