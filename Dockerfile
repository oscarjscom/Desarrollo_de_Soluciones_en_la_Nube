# Imagen base - Python oficial
FROM python:3.11-slim

# Metadata
LABEL maintainer="oscarolano15@gmail.com"
LABEL description="App para descargar videos de redes sociales"

# Establecer directorio de trabajo
WORKDIR /app

# ffmpeg es necesario para que yt-dlp una audio y video
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copiar archivo de dependencias
COPY requirements.txt .

# Instalar dependencias
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código de la aplicación
COPY app.py .

# Carpeta donde se guardan los videos descargados
RUN mkdir -p /app/downloads

# Exponer el puerto
EXPOSE 5000

# Comando por defecto
CMD ["python", "app.py"]
