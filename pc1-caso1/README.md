# Descargador de Videos de Redes Sociales

Práctica Calificada 1 - Caso 1
Curso: Desarrollo de Soluciones en la Nube
Alumno: Oscar Olano

Hice una aplicación web con Flask y la librería yt-dlp para descargar videos de
YouTube, TikTok, Instagram, Facebook y LinkedIn a partir de una URL. La empaqueté
en Docker en tres versiones: una básica, una optimizada con Alpine y una con
multi-stage build.

> Nota: en Instagram, TikTok, Facebook y LinkedIn algunos videos no se pueden
> descargar si son privados o piden sesión iniciada. Con videos públicos sí
> funciona sin configurar nada extra.

## Requisitos

- Tener Docker Desktop instalado y corriendo.

## Cómo instalarlo y correrlo

1. Clonar el repo:
   ```bash
   git clone https://github.com/oscarjscom/Desarrollo_de_Soluciones_en_la_Nube.git
   cd Desarrollo_de_Soluciones_en_la_Nube/pc1-caso1
   ```

2. Construir la imagen (con cualquiera de las 3 variantes):
   ```bash
   docker build -t descargador-videos:v1.0 .
   # version optimizada:
   docker build -f Dockerfile.optimizado -t descargador-videos:v1.1-alpine .
   # version multi-stage:
   docker build -f Dockerfile.multistage -t descargador-videos:v1.2-alpine .
   ```

3. Correr el contenedor:
   ```bash
   docker run -d -p 5000:5000 --name descargador-videos-container descargador-videos:v1.0
   ```

4. Abrir el navegador en [http://localhost:5000](http://localhost:5000), pegar la
   URL del video que quieras descargar y darle click a "Descargar".

5. Para ver los logs o detenerlo:
   ```bash
   docker logs descargador-videos-container
   docker stop descargador-videos-container
   ```

## Comparando el tamaño de las imágenes

```bash
docker images | grep descargador-videos
docker history descargador-videos:v1.0
```

## URL del repositorio

https://github.com/oscarjscom/Desarrollo_de_Soluciones_en_la_Nube

## Conclusiones

- Con Docker pude empaquetar la app junto con todo lo que necesita (Python,
  Flask, yt-dlp, ffmpeg) para que corra igual en cualquier compu sin tener que
  instalar nada a mano.
- Al comparar las 3 versiones del Dockerfile noté la diferencia de tamaño entre
  usar la imagen base `slim` (Debian) y `alpine`, y cómo con un build
  multi-stage la imagen final queda todavía más ligera porque no incluye las
  herramientas que solo se usan para compilar.
- Trabajar con librerías que dependen de servicios externos (YouTube, Instagram,
  TikTok) me hizo notar que hay que mantener actualizada la librería yt-dlp,
  porque si no, empieza a fallar cuando esas plataformas cambian cómo entregan
  los videos.
