# Matriz de roles y permisos (RBAC)

Estos permisos se cargan en las tablas `roles`, `permisos` y `rol_permiso` (ver `app/seed.py`) y se
pueden consultar en vivo en `GET /rbac/matriz` o en la pestaña "Matriz RBAC".

| Operación | Código | Administrador | Gerente | Supervisor | Empleado | Auditor | Invitado |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Crear documento | `CREATE` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Consultar documento | `READ` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Modificar documento | `UPDATE` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Eliminar documento | `DELETE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Aprobar documento | `APPROVE` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Ver auditoría | `VIEW_AUDIT` | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ |
| Gestionar usuarios | `MANAGE_USERS` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Asignar roles | `ASSIGN_ROLES` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Gestionar políticas ABAC * | `MANAGE_POLICIES` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

\* Permiso agregado para la parte de "configuraciones" del Administrador (activar/desactivar y editar
políticas ABAC).

## Endpoint → permiso requerido

| Endpoint | Permiso |
|---|---|
| `GET /documentos`, `GET /documentos/{id}` | `READ` |
| `POST /documentos` | `CREATE` |
| `PUT /documentos/{id}` | `UPDATE` |
| `DELETE /documentos/{id}` | `DELETE` |
| `POST /documentos/{id}/aprobar`, `POST /documentos/{id}/publicar` | `APPROVE` |
| `GET /auditoria` | `VIEW_AUDIT` |
| `GET /usuarios`, `POST /usuarios`, `PUT /usuarios/{id}` | `MANAGE_USERS` |
| Crear usuario con rol / cambiar el rol de un usuario | `ASSIGN_ROLES` (además de `MANAGE_USERS`) |
| `GET /politicas`, `PUT /politicas/{codigo}` | `MANAGE_POLICIES` |
