# Imagen de la aplicación (la usan los dos nodos)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Primero las dependencias: así Docker reutiliza esta capa si el código cambia pero las librerías no
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/salud || exit 1
CMD ["node", "src/server.js"]
