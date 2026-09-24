# Diagrama de arquitectura

```mermaid
flowchart TB
    FE["Frontend<br/>HTML + Bootstrap<br/>(app/static/index.html)"]

    subgraph API["REST API - FastAPI"]
        direction TB
        R["Routers<br/>/auth · /usuarios · /documentos · /auditoria · /politicas"]
        AUTH["Authentication<br/>JWT + bcrypt<br/>(app/auth)"]
        subgraph AZ["Authorization (app/authorization/service.py)"]
            RBAC["RBAC Service<br/>rol → permisos<br/>(rbac.py)"]
            ABAC["ABAC Policy Engine<br/>usuario + recurso + acción + entorno<br/>(abac/engine.py + abac/policies.py)"]
        end
        DOC["Document Service"]
        USR["User Service"]
        AUD["Audit Service"]
    end

    DB[("Base de datos<br/>SQLite (local) / MySQL (Docker)")]

    FE -- "HTTP + Bearer JWT<br/>X-Ubicacion · X-Dispositivo · X-Hora" --> R
    R --> AUTH
    R --> DOC & USR
    DOC & USR --> AZ
    RBAC -- "si permite" --> ABAC
    AZ --> AUD
    AUTH & RBAC & ABAC & DOC & USR & AUD --> DB
```

## Flujo de una petición

```mermaid
flowchart TD
    A[Usuario solicita operación] --> B[Autenticación: ¿JWT válido y usuario existe?]
    B -- No --> X1[401 No autenticado]
    B -- Sí --> C{RBAC: ¿su rol tiene el permiso?}
    C -- No --> D1[DENEGAR - etapa RBAC]
    C -- Sí --> E{ABAC: ¿cumple todas las políticas activas que aplican?}
    E -- No --> D2[DENEGAR - etapa ABAC]
    E -- Sí --> F[AUTORIZAR]
    D1 & D2 & F --> G[(Registro en auditoría)]
```

## Componentes

| Componente | Archivo | Responsabilidad |
|---|---|---|
| Authentication | `app/auth/security.py`, `app/auth/dependencies.py`, `app/services/auth.py` | Login, hash de contraseñas, emisión y validación del JWT, atributos del entorno |
| RBAC Service | `app/authorization/rbac.py` | Resolver usuario → rol → permisos desde la BD |
| ABAC Policy Engine | `app/authorization/abac/engine.py` | Cargar las políticas activas, decidir cuáles aplican y evaluarlas |
| Catálogo de políticas | `app/authorization/abac/policies.py` | Una función por política, sin condicionales por rol |
| Authorization Service | `app/authorization/service.py` | Orquestar RBAC → ABAC y registrar la decisión |
| Document / User Service | `app/services/documentos.py`, `app/services/usuarios.py` | Lógica de negocio; toda operación pasa por el Authorization Service |
| Audit Service | `app/services/auditoria.py` | Guardar y consultar cada intento de acceso |

## Cómo se evita el "if rol == ADMIN"

- Los permisos por rol están en las tablas `roles`, `permisos` y `rol_permiso`.
- Las políticas ABAC están en la tabla `politicas`. Cada una guarda en `parametros` (JSON) a qué
  acciones aplica, qué roles están exentos (`roles_exentos`) o a qué roles se limita (`roles`), y sus
  valores (niveles, horario, dispositivos permitidos...).
- El motor ABAC decide si una política aplica solo con esos parámetros, y cada política es una
  función pura. Para cambiar una regla (por ejemplo, el horario o quién está exento) se edita la
  política desde `PUT /politicas/{codigo}` o desde la pestaña "Políticas ABAC", sin tocar el código.
