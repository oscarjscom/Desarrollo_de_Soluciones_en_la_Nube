import pytest

from tests.casos import CASOS, ENTORNO_BASE, cabeceras_de, ejecutar, token


@pytest.mark.parametrize("caso", CASOS, ids=lambda c: f"caso{c.nro:02d}")
def test_caso(client, caso):
    res = ejecutar(client, caso)
    assert res.resultado == caso.esperado, f"{caso.escenario}: {res}"
    if caso.etapa:
        assert res.etapa == caso.etapa, f"{caso.escenario}: {res}"

    # Cada intento debe quedar en la auditoría con su resultado.
    auditoria = client.get("/auditoria", params={"usuario": caso.usuario, "limite": 5},
                           headers=cabeceras_de(client, "admin")).json()
    assert any(a["resultado"] == caso.esperado for a in auditoria)


# ---------- Pruebas complementarias ----------

def test_ejemplo_guia_seccion_9(client):
    """Empleada de RRHH (nivel 2) intenta modificar 'Presupuesto corporativo'
    (FINANZAS, nivel 4): RBAC permitido, ABAC denegado por departamento y nivel."""
    r = client.put("/documentos/4", json={"titulo": "x"}, headers=cabeceras_de(client, "rosa.diaz"))
    assert r.status_code == 403
    d = r.json()["detail"]
    assert d["etapa"] == "ABAC"
    assert "DEPARTAMENTO" in d["motivo"] and "NIVEL_SEGURIDAD" in d["motivo"]


def test_token_de_usuario_desactivado_deja_de_servir(client):
    """Si se desactiva a alguien con sesión abierta, su token ya no le sirve (política ESTADO_USUARIO)."""
    t = token(client, "ana.torres")
    admin = cabeceras_de(client, "admin")
    usuarios = client.get("/usuarios", headers=admin).json()
    ana = next(u for u in usuarios if u["username"] == "ana.torres")
    try:
        assert client.put(f"/usuarios/{ana['id']}", json={"estado": "SUSPENDIDO"}, headers=admin).status_code == 200
        r = client.get("/documentos/1", headers={**ENTORNO_BASE, "Authorization": f"Bearer {t}"})
        assert r.status_code == 403
        assert "ESTADO_USUARIO" in r.json()["detail"]["motivo"]
    finally:
        client.put(f"/usuarios/{ana['id']}", json={"estado": "ACTIVO"}, headers=admin)


def test_listado_filtra_por_politicas(client):
    ids = {d["id"] for d in client.get("/documentos", headers=cabeceras_de(client, "invitado.ext")).json()}
    assert ids == {6, 9}  # solo los documentos PUBLICADO de nivel 1


def test_empleado_no_puede_crear_en_otro_departamento(client):
    r = client.post("/documentos", json={"titulo": "Nuevo", "departamento": "RRHH"},
                    headers=cabeceras_de(client, "luis.perez"))
    assert r.status_code == 403 and r.json()["detail"]["etapa"] == "ABAC"


def test_empleado_crea_y_modifica_su_documento(client):
    h = cabeceras_de(client, "luis.perez")
    doc = client.post("/documentos", json={"titulo": "Informe propio", "nivel_confidencialidad": 2}, headers=h).json()
    assert doc["departamento"] == "FINANZAS" and doc["propietario"] == "luis.perez"
    assert client.put(f"/documentos/{doc['id']}", json={"descripcion": "v2"}, headers=h).status_code == 200


def test_no_puede_subir_nivel_por_encima_del_suyo(client):
    """Un empleado nivel 2 no puede subir su documento a nivel 4 (se valida el estado final)."""
    h = cabeceras_de(client, "luis.perez")
    r = client.put("/documentos/1", json={"nivel_confidencialidad": 4}, headers=h)
    assert r.status_code == 403 and "NIVEL_SEGURIDAD" in r.json()["detail"]["motivo"]


def test_login_credenciales_invalidas(client):
    r = client.post("/auth/login", json={"username": "luis.perez", "password": "incorrecta"})
    assert r.status_code == 401


def test_sin_token_401(client):
    assert client.get("/documentos").status_code == 401


def test_registro_auditoria_tiene_campos_pedidos(client):
    registro = client.get("/auditoria", params={"limite": 1}, headers=cabeceras_de(client, "jorge.salas")).json()[0]
    for campo in ("usuario", "recurso", "accion", "fecha", "resultado", "motivo"):
        assert registro[campo] not in (None, "")
