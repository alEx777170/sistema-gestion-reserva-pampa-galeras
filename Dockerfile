# ============================================================
# Reserva Nacional Pampa Galeras - imagen única (frontend + backend)
# Etapa 1: compilar el frontend React (Vite)
# Etapa 2: backend Express que sirve la API y el SPA compilado,
#          en modo THICK contra Oracle Autonomous Database.
#
# ¿Por qué Instant Client? La ADB rechaza el modo thin de node-oracledb
# (ORA-12506); el stack nativo de Oracle usa el wallet auto-login (cwallet.sso)
# y conecta correctamente. Se instala Basic Light de Oracle Instant Client.
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

# Oracle Instant Client (modo thick) + libaio (requerido por el cliente nativo)
# ca-certificates: necesario para que curl confíe en download.oracle.com
RUN apt-get update \
    && apt-get install -y --no-install-recommends unzip curl ca-certificates libaio1 libnsl2 \
    && curl -fsSL -o /tmp/ic.zip \
         https://download.oracle.com/otn_software/linux/instantclient/instantclient-basiclite-linuxx64.zip \
    && mkdir -p /opt/oracle \
    && unzip -q /tmp/ic.zip -d /opt/oracle \
    && rm /tmp/ic.zip \
    && ln -s /opt/oracle/instantclient_* /opt/oracle/instantclient \
    && rm -rf /var/lib/apt/lists/*

# Registrar las bibliotecas del Instant Client con el enlazador dinámico
# (sin esto, libclntsh.so no encuentra libnnz.so y node-oracledb falla DPI-1047)
RUN echo "/opt/oracle/instantclient" > /etc/ld.so.conf.d/oracle-instantclient.conf \
    && ldconfig

# Carpeta estable del Instant Client (la versión real queda en el symlink)
ENV ORACLE_IC_HOME=/opt/oracle/instantclient

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

COPY backend/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["/bin/sh", "/entrypoint.sh"]
