# Imagen base - Python oficial
FROM python:3.11-slim

# Metadata
LABEL maintainer="oscarolano15@gmail.com"
LABEL description="Registro de miembros de mesa en Excel"

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivo de dependencias
COPY requirements.txt .

# Instalar dependencias
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código de la aplicación
COPY app.py .

# Carpeta donde se guarda el Excel
RUN mkdir -p /app/data

# Exponer el puerto
EXPOSE 5001

# Comando por defecto
CMD ["python", "app.py"]
