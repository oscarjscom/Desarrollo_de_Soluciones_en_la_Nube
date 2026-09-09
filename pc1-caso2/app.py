from flask import Flask, request, send_file, render_template_string
import openpyxl
import os

app = Flask(__name__)
EXCEL_PATH = "/app/data/miembros_mesa.xlsx"
HEADERS = ["DNI", "Region", "Provincia", "Distrito", "Direccion del local de votacion"]

HTML = """
<!DOCTYPE html>
<html>
<head><title>Registro de Miembros de Mesa</title></head>
<body style="font-family: Arial; text-align: center; padding: 50px;">
    <h1 style="color: #028090;">Registro de Miembros de Mesa</h1>
    <p>Consulta previa en el portal ONPE:
       <a href="https://consultaelectoral.onpe.gob.pe/inicio" target="_blank">
       consultaelectoral.onpe.gob.pe</a></p>
    <form method="POST" action="/registrar">
        <input type="text" name="dni" placeholder="DNI" required><br><br>
        <input type="text" name="region" placeholder="Region" required><br><br>
        <input type="text" name="provincia" placeholder="Provincia" required><br><br>
        <input type="text" name="distrito" placeholder="Distrito" required><br><br>
        <input type="text" name="direccion" placeholder="Direccion del local de votacion"
               style="width:300px;" required><br><br>
        <button type="submit" style="padding:8px 16px;">Registrar</button>
    </form>
    {% if mensaje %}<p style="color:green;">{{ mensaje }}</p>{% endif %}
    <br>
    <a href="/descargar">Descargar Excel con los registros</a>
</body>
</html>
"""


def get_or_create_workbook():
    if os.path.exists(EXCEL_PATH):
        return openpyxl.load_workbook(EXCEL_PATH)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "MiembrosMesa"
    ws.append(HEADERS)
    return wb


@app.route('/')
def index():
    return render_template_string(HTML)


@app.route('/registrar', methods=['POST'])
def registrar():
    os.makedirs(os.path.dirname(EXCEL_PATH), exist_ok=True)
    wb = get_or_create_workbook()
    ws = wb["MiembrosMesa"]
    ws.append([
        request.form.get("dni"),
        request.form.get("region"),
        request.form.get("provincia"),
        request.form.get("distrito"),
        request.form.get("direccion"),
    ])
    wb.save(EXCEL_PATH)
    return render_template_string(HTML, mensaje="Registro guardado correctamente.")


@app.route('/descargar')
def descargar():
    if not os.path.exists(EXCEL_PATH):
        return render_template_string(HTML, mensaje="Aun no hay registros.")
    return send_file(EXCEL_PATH, as_attachment=True)


if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5001)
