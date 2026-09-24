# Matriz de políticas ABAC

Las políticas están en la tabla `politicas`. La lógica de cada una está en
`app/authorization/abac/policies.py` y **a quién y a qué acciones aplica** lo definen sus parámetros
en la BD. Se evalúan en este orden y basta con que una falle para denegar. En la auditoría queda cuál
falló y por qué.

| # | Código | Regla | Acciones | Aplica a | Parámetros (valores por defecto) |
|---|---|---|---|---|---|
| 7 | `ESTADO_USUARIO` | `usuario.estado == "ACTIVO"` | Todas (incluye `LOGIN`) | Todos los roles | `estados_permitidos: [ACTIVO]` |
| 1 | `DEPARTAMENTO` | `usuario.departamento == documento.departamento` | CREATE, READ, UPDATE, DELETE, APPROVE | Todos menos Administrador, Auditor e Invitado | `roles_exentos` |
| 2 | `NIVEL_SEGURIDAD` | `usuario.nivel_seguridad >= documento.nivel_confidencialidad` | CREATE, READ, UPDATE, DELETE, APPROVE | Todos los roles | — |
| 3 | `PROPIEDAD` | `usuario.id == documento.propietario` | UPDATE | Todos menos Gerente y Administrador | `roles_exentos: [GERENTE, ADMINISTRADOR]` |
| 4 | `HORARIO` | si `nivel_confidencialidad >= 4` ⇒ `08:00 <= hora <= 18:00` | READ, UPDATE, DELETE, APPROVE | Todos los roles | `nivel_minimo: 4`, `hora_inicio: 08:00`, `hora_fin: 18:00` |
| 5 | `PAIS` | `usuario.pais == documento.pais` y `entorno.ubicacion == documento.pais` | CREATE, READ, UPDATE, DELETE, APPROVE | Todos los roles | `validar_ubicacion: true` |
| 6 | `DISPOSITIVO` | si `nivel_confidencialidad >= 4` ⇒ `dispositivo == "CORPORATIVO"` | READ, UPDATE, DELETE, APPROVE | Todos los roles | `nivel_minimo: 4`, `dispositivos_permitidos: [CORPORATIVO]` |
| 8 | `INVITADO` | `tipo_contrato == "EXTERNO"` y `nivel_confidencialidad <= 1` y `documento.estado == "PUBLICADO"` | CREATE, READ, UPDATE, DELETE, APPROVE | Solo Invitado | `roles: [INVITADO]`, `nivel_maximo: 1`, `estado_documento: PUBLICADO` |

(El # es el número de política del enunciado.)

## Atributos usados

| Tipo | Atributos |
|---|---|
| Usuario | id, nombre, correo, rol, departamento, nivel_seguridad, pais, tipo_contrato, estado |
| Recurso (documento) | id, titulo, departamento, nivel_confidencialidad, estado, pais, propietario, fecha_creacion |
| Entorno | hora, fecha, direccion_ip, ubicacion, dispositivo |

## Decisiones de interpretación

- **Departamento:** el enunciado dice "un empleado". Se aplica también a Supervisor y Gerente, porque
  "supervisan documentos de su área" (el ejemplo de la sección 8 de la guía también valida el
  departamento del supervisor). Administrador y Auditor quedan exentos porque su función es
  transversal. El Invitado tiene su propia política.
- **País:** además de `usuario.pais == documento.pais`, se valida que la petición venga desde ese país
  (`entorno.ubicacion`), que es lo que pide el texto ("solo podrán consultarse desde Perú").
- **Horario y Dispositivo:** se aplican a todas las operaciones sobre un documento existente
  (consultar, modificar, eliminar, aprobar), porque todas exponen su contenido.
- **Modificar:** además del documento actual, se valida cómo quedaría después del cambio. Así un
  empleado no puede mover un documento a otro departamento ni subirlo a un nivel mayor que el suyo.
- **Usuario inactivo:** se valida al iniciar sesión y en cada petición. Si se desactiva a alguien con
  sesión abierta, su token deja de servir de inmediato.
- **Política sin implementación:** si hay una política activa en la BD sin su función, el motor
  deniega el acceso (*fail closed*).

## Atributos de entorno en este laboratorio

La hora sale del reloj del servidor (zona `America/Lima`). En modo demo (`DEMO_MODE=true`) se puede
simular con la cabecera `X-Hora: HH:MM`. La ubicación y el dispositivo los manda el cliente en
`X-Ubicacion` y `X-Dispositivo`, porque son datos que no se pueden obtener de verdad en un
laboratorio. En producción saldrían de un servicio de geolocalización por IP y de un gestor de
dispositivos (MDM) o un certificado del equipo corporativo. Nunca se confiaría en lo que declara el
cliente.
