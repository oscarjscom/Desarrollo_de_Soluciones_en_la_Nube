from flask import Flask, request, send_file, render_template_string
import yt_dlp
import os
import uuid

app = Flask(__name__)
DOWNLOAD_DIR = "/app/downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

HTML = """
<!DOCTYPE html>
<html>
<head><title>Descargador de Videos</title></head>
<body style="font-family: Arial; text-align: center; padding: 50px;">
    <h1 style="color: #028090;">Descargador de Videos</h1>
    <p>Soporta YouTube, TikTok, Instagram, Facebook y LinkedIn</p>
    <form method="POST" action="/download">
        <input type="text" name="url" placeholder="Pega la URL del video"
               style="width:400px; padding:8px;" required>
        <button type="submit" style="padding:8px 16px;">Descargar</button>
    </form>
    {% if error %}<p style="color:red;">{{ error }}</p>{% endif %}
</body>
</html>
"""


@app.route('/')
def index():
    return render_template_string(HTML)


@app.route('/download', methods=['POST'])
def download():
    url = request.form.get('url')
    if not url:
        return render_template_string(HTML, error="Debes ingresar una URL")

    file_id = str(uuid.uuid4())
    output_template = os.path.join(DOWNLOAD_DIR, f"{file_id}.%(ext)s")

    ydl_opts = {
        'outtmpl': output_template,
        'format': 'bestvideo+bestaudio/best',
        'merge_output_format': 'mp4',
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
        return send_file(filename, as_attachment=True)
    except Exception as e:
        return render_template_string(HTML, error=f"Error al descargar: {str(e)}")


if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)
