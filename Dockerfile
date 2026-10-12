# Imagen para Railway, Fly.io o cualquier hosting con Docker.
FROM node:22-slim

# better-sqlite3 se compila al instalar; estas herramientas lo permiten.
RUN apt-get update && apt-get install -y --no-install-recommends python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

# La base de datos vive aquí. Monta un volumen en /data para que persista.
ENV DB_PATH=/data/barberia.db
VOLUME ["/data"]

EXPOSE 3000
CMD ["npm", "start"]
