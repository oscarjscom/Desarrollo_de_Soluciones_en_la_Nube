"""Datos iniciales: roles, permisos (matriz RBAC), departamentos, políticas ABAC,
usuarios y documentos de ejemplo para los casos de prueba."""
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.models import Departamento, Documento, Permiso, Politica, Rol, Usuario

PASSWORD_DEMO = "SecureDocs2026"

ROLES = [
    ("ADMINISTRADOR", "Administrador", "Administra usuarios, roles y configuraciones"),
    ("GERENTE", "Gerente", "Supervisa documentos de su área"),
    ("SUPERVISOR", "Supervisor", "Revisa y aprueba documentos"),
    ("EMPLEADO", "Empleado", "Crea y consulta documentos de su área"),
    ("AUDITOR", "Auditor", "Consulta documentos y registros de auditoría"),
    ("INVITADO", "Invitado", "Acceso temporal a determinados documentos"),
]

A, G, S, E, AU, I = "ADMINISTRADOR", "GERENTE", "SUPERVISOR", "EMPLEADO", "AUDITOR", "INVITADO"

# Matriz RBAC del enunciado (+ GESTIONAR_POLITICAS para la configuración del admin)
PERMISOS = [
    ("CREATE", "Crear documento", [A, G, S, E]),
    ("READ", "Consultar documento", [A, G, S, E, AU, I]),
    ("UPDATE", "Modificar documento", [A, G, S, E]),
    ("DELETE", "Eliminar documento", [A, G]),
    ("APPROVE", "Aprobar documento", [A, G, S]),
    ("VIEW_AUDIT", "Ver auditoría", [A, G, AU]),
    ("MANAGE_USERS", "Gestionar usuarios", [A]),
    ("ASSIGN_ROLES", "Asignar roles", [A]),
    ("MANAGE_POLICIES", "Gestionar políticas ABAC", [A]),
]

DEPARTAMENTOS = [
    ("FINANZAS", "Finanzas"),
    ("RRHH", "Recursos Humanos"),
    ("TI", "Tecnologías de la Información"),
    ("AUDITORIA", "Auditoría Interna"),
    ("OPERACIONES", "Operaciones"),
]

ACC_DOC = ["CREATE", "READ", "UPDATE", "DELETE", "APPROVE"]
ACC_CONSULTA = ["READ", "UPDATE", "DELETE", "APPROVE"]

POLITICAS = [
    ("ESTADO_USUARIO", "Estado del usuario",
     "Un usuario suspendido o inactivo no puede acceder al sistema.",
     'usuario.estado == "ACTIVO"',
     {"acciones": ["*"], "requiere_recurso": False, "estados_permitidos": ["ACTIVO"]}),
    ("DEPARTAMENTO", "Departamento",
     "Solo se accede a documentos del propio departamento.",
     "usuario.departamento == documento.departamento",
     {"acciones": ACC_DOC, "roles_exentos": [A, AU, I]}),
    ("NIVEL_SEGURIDAD", "Nivel de seguridad",
     "El nivel de seguridad del usuario debe ser igual o mayor a la confidencialidad del documento.",
     "usuario.nivel_seguridad >= documento.nivel_confidencialidad",
     {"acciones": ACC_DOC, "roles_exentos": []}),
    ("PROPIEDAD", "Propiedad",
     "Solo se modifican los documentos propios (Gerente y Administrador exceptuados).",
     "usuario.id == documento.propietario",
     {"acciones": ["UPDATE"], "roles_exentos": [G, A]}),
    ("HORARIO", "Horario",
     "Los documentos de nivel 4 o más solo se consultan entre 08:00 y 18:00.",
     "documento.nivel_confidencialidad >= 4 => 08:00 <= entorno.hora <= 18:00",
     {"acciones": ACC_CONSULTA, "nivel_minimo": 4, "hora_inicio": "08:00", "hora_fin": "18:00"}),
    ("PAIS", "País",
     "Los documentos de un país solo los consultan usuarios de ese país y desde ese país.",
     "usuario.pais == documento.pais AND entorno.ubicacion == documento.pais",
     {"acciones": ACC_DOC, "validar_ubicacion": True}),
    ("DISPOSITIVO", "Dispositivo",
     "Los documentos de nivel 4 o 5 solo se consultan desde dispositivos corporativos.",
     'documento.nivel_confidencialidad >= 4 => entorno.dispositivo == "CORPORATIVO"',
     {"acciones": ACC_CONSULTA, "nivel_minimo": 4, "dispositivos_permitidos": ["CORPORATIVO"]}),
    ("INVITADO", "Invitados",
     "Un invitado debe ser externo y solo ve documentos publicados de nivel 1 o menos.",
     'usuario.tipo_contrato == "EXTERNO" AND documento.nivel_confidencialidad <= 1 '
     'AND documento.estado == "PUBLICADO"',
     {"acciones": ACC_DOC, "roles": [I], "tipo_contrato": "EXTERNO", "nivel_maximo": 1,
      "estado_documento": "PUBLICADO"}),
]

# username, nombre, rol, departamento, nivel, pais, contrato, estado
USUARIOS = [
    ("admin", "Administrador del Sistema", A, "TI", 5, "PERU", "INTERNO", "ACTIVO"),
    ("maria.gomez", "María Gómez", G, "FINANZAS", 5, "PERU", "INTERNO", "ACTIVO"),
    ("carlos.ruiz", "Carlos Ruiz", S, "FINANZAS", 3, "PERU", "INTERNO", "ACTIVO"),
    ("ana.torres", "Ana Torres", S, "FINANZAS", 3, "PERU", "INTERNO", "ACTIVO"),
    ("luis.perez", "Luis Pérez", E, "FINANZAS", 2, "PERU", "INTERNO", "ACTIVO"),
    ("rosa.diaz", "Rosa Díaz", E, "RRHH", 2, "PERU", "INTERNO", "ACTIVO"),
    ("jorge.salas", "Jorge Salas", AU, "AUDITORIA", 5, "PERU", "INTERNO", "ACTIVO"),
    ("invitado.ext", "Invitado Externo", I, "FINANZAS", 1, "PERU", "EXTERNO", "ACTIVO"),
    ("pedro.inactivo", "Pedro Inactivo", E, "FINANZAS", 2, "PERU", "INTERNO", "INACTIVO"),
]

# titulo, departamento, nivel, estado, propietario
DOCUMENTOS = [
    ("Reporte de gastos Q3", "FINANZAS", 2, "PENDIENTE", "luis.perez"),
    ("Planilla de personal", "RRHH", 2, "PENDIENTE", "rosa.diaz"),
    ("Presupuesto anual", "FINANZAS", 3, "PENDIENTE", "ana.torres"),
    ("Presupuesto corporativo", "FINANZAS", 4, "APROBADO", "maria.gomez"),
    ("Plan estratégico de inversiones", "FINANZAS", 5, "APROBADO", "maria.gomez"),
    ("Manual de bienvenida", "FINANZAS", 1, "PUBLICADO", "ana.torres"),
    ("Contrato con proveedor", "FINANZAS", 3, "APROBADO", "carlos.ruiz"),
    ("Borrador de circular interna", "FINANZAS", 2, "BORRADOR", "luis.perez"),
    ("Política de vacaciones", "RRHH", 1, "PUBLICADO", "rosa.diaz"),
    ("Conciliación bancaria septiembre", "FINANZAS", 2, "PENDIENTE", "carlos.ruiz"),
]


def seed(db: Session) -> None:
    if db.scalar(select(Rol).limit(1)) is not None:
        return  # ya hay datos

    roles = {c: Rol(codigo=c, nombre=n, descripcion=d) for c, n, d in ROLES}
    db.add_all(roles.values())
    for codigo, nombre, con_permiso in PERMISOS:
        permiso = Permiso(codigo=codigo, nombre=nombre)
        db.add(permiso)
        for r in con_permiso:
            roles[r].permisos.append(permiso)

    deps = {c: Departamento(codigo=c, nombre=n) for c, n in DEPARTAMENTOS}
    db.add_all(deps.values())

    for i, (codigo, nombre, desc, expr, params) in enumerate(POLITICAS, start=1):
        db.add(Politica(codigo=codigo, nombre=nombre, descripcion=desc, expresion=expr,
                        activa=True, parametros=json.dumps(params), orden=i))

    pw = hash_password(PASSWORD_DEMO)
    usuarios = {}
    for username, nombre, rol, dep, nivel, pais, contrato, estado in USUARIOS:
        u = Usuario(username=username, nombre=nombre, correo=f"{username}@techcorp.pe",
                    password_hash=pw, rol=roles[rol], departamento=deps[dep], nivel_seguridad=nivel,
                    pais=pais, tipo_contrato=contrato, estado=estado)
        db.add(u)
        usuarios[username] = u
    db.flush()

    for titulo, dep, nivel, estado, dueno in DOCUMENTOS:
        db.add(Documento(titulo=titulo, descripcion=f"Documento de ejemplo: {titulo}",
                         propietario_id=usuarios[dueno].id, departamento=deps[dep],
                         nivel_confidencialidad=nivel, estado=estado, pais="PERU"))
    db.commit()
