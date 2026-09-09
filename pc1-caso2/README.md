# Registro de Miembros de Mesa (ONPE)

Aplicación web (Flask + openpyxl) que registra en un archivo Excel una lista de
personas con: DNI, Región, Provincia, Distrito y dirección del local de votación.
Empaquetada en Docker en tres variantes: básica, optimizada (Alpine) y multi-stage.

## Verificación en el portal ONPE

Se consultó el portal https://consultaelectoral.onpe.gob.pe/inicio para verificar
si el estudiante es miembro de mesa. **Resultado: NO es miembro de mesa** para las
Elecciones Regionales y Municipales (4 de octubre de 2026).

Dado que el enunciado indica registrar los datos únicamente **si se es miembro de
mesa**, y no es el caso, la aplicación se demuestra con **datos de ejemplo**
(no se usan datos personales reales, para evitar exponer información sensible en
un repositorio público).

## Requisitos

- Docker Desktop instalado y en ejecución.

## Pasos de instalación y ejecución

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/oscarjscom/Desarrollo_de_Soluciones_en_la_Nube.git
   cd Desarrollo_de_Soluciones_en_la_Nube/pc1-caso2
   ```

2. Construir la imagen (elige una variante):
   ```bash
   docker build -t registro-mesa:v1.0 .
   # o la versión optimizada:
   docker build -f Dockerfile.optimizado -t registro-mesa:v1.1-alpine .
   # o la versión multi-stage:
   docker build -f Dockerfile.multistage -t registro-mesa:v1.2-alpine .
   ```

3. Ejecutar el contenedor:
   ```bash
   docker run -d -p 5001:5001 --name registro-mesa-container registro-mesa:v1.0
   ```

4. Abrir el navegador en [http://localhost:5001](http://localhost:5001), llenar
   el formulario con los datos (ejemplo) y registrar. Descargar el Excel generado
   desde el enlace "Descargar Excel con los registros".

5. Ver logs / detener:
   ```bash
   docker logs registro-mesa-container
   docker stop registro-mesa-container
   ```

## Comparación de imágenes

```bash
docker images | grep registro-mesa
docker history registro-mesa:v1.0
```

## URL del repositorio

https://github.com/oscarjscom/Desarrollo_de_Soluciones_en_la_Nube

## Conclusiones

- La app demuestra un flujo completo de captura de datos y generación de un
  archivo Excel dentro de un contenedor Docker, usando un volumen interno
  (`/app/data`) para persistir el archivo mientras el contenedor corre.
- Se evitó registrar datos personales reales (DNI, nombre, dirección) en el
  repositorio público, priorizando buenas prácticas de protección de datos.
- Igual que en el Caso 1, comparar las 3 variantes de Dockerfile evidencia cómo
  Alpine y el build multi-stage reducen el tamaño final de la imagen.
