# ============================================================
# Reserva Nacional Pampa Galeras - imagen única (frontend + backend)
# Etapa 1: compilar el frontend React (Vite)
# Etapa 2: backend Express que sirve la API y el SPA compilado
# ============================================================

# ---------- Etapa 1: build del frontend ----------
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ---------- Etapa 2: backend + frontend compilado ----------
FROM node:20-slim
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Código del backend
COPY backend/src ./src

# Wallet de Oracle ADB (tnsnames.ora, cwallet.sso, ...) para conectar a la nube.
# Si el repo NO trae el wallet (p. ej. repo público), la carpeta existe vacía
# (solo .gitkeep) y el entrypoint la completa desde la variable secreta WALLET_B64.
COPY backend/wallet ./wallet/

# Carpeta de subidas de fotos (se monta como volumen en docker-compose)
RUN mkdir -p uploads

# Frontend compilado: index.js lo busca en ../../frontend/dist
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# unzip + base64: usados por el entrypoint para instalar el wallet desde WALLET_B64
RUN apt-get update \
    && apt-get install -y --no-install-recommends unzip \
    && rm -rf /var/lib/apt/lists/*

COPY backend/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["/bin/sh", "/entrypoint.sh"]
