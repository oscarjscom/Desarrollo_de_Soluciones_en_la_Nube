# Modelo de base de datos

```mermaid
erDiagram
    ROLES ||--o{ ROL_PERMISO : tiene
    PERMISOS ||--o{ ROL_PERMISO : "asignado en"
    ROLES ||--o{ USUARIOS : "rol de"
    DEPARTAMENTOS ||--o{ USUARIOS : "pertenece"
    DEPARTAMENTOS ||--o{ DOCUMENTOS : "pertenece"
    USUARIOS ||--o{ DOCUMENTOS : "propietario"
    USUARIOS ||--o{ DOCUMENTOS : "aprobado_por"
    USUARIOS ||--o{ AUDITORIA : "genera"

    ROLES {
        int id PK
        string codigo UK
        string nombre
        string descripcion
    }
    PERMISOS {
        int id PK
        string codigo UK
        string nombre
    }
    ROL_PERMISO {
        int rol_id PK,FK
        int permiso_id PK,FK
    }
    DEPARTAMENTOS {
        int id PK
        string codigo UK
        string nombre
    }
    USUARIOS {
        int id PK
        string username UK
        string nombre
        string correo
        string password_hash
        int rol_id FK
        int departamento_id FK
        int nivel_seguridad
        string pais
        string tipo_contrato
        string estado
        datetime fecha_creacion
    }
    DOCUMENTOS {
        int id PK
        string titulo
        text descripcion
        int propietario_id FK
        int departamento_id FK
        int nivel_confidencialidad
        string estado
        string pais
        datetime fecha_creacion
        datetime fecha_modificacion
        int aprobado_por_id FK
    }
    POLITICAS {
        int id PK
        string codigo UK
        string nombre
        text descripcion
        text expresion
        bool activa
        text parametros "JSON"
        int orden
    }
    AUDITORIA {
        int id PK
        datetime fecha
        string usuario
        int usuario_id
        string recurso
        string accion
        string resultado
        string etapa
        text motivo
        string direccion_ip
        string ubicacion
        string dispositivo
    }
```

## Notas

- `auditoria.usuario` guarda el username como texto (no solo la FK) para que el registro se
  mantenga aunque el usuario se elimine y para auditar intentos de login con usuarios que no existen.
- Estados de documento: `BORRADOR`, `PENDIENTE`, `APROBADO`, `PUBLICADO`.
- Estados de usuario: `ACTIVO`, `INACTIVO`, `SUSPENDIDO`. Contrato: `INTERNO`, `EXTERNO`.
- Las tablas se crean solas al iniciar la app (`Base.metadata.create_all`) y se cargan los datos de
  ejemplo de `app/seed.py` si la BD está vacía.
