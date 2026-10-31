# Guía de despliegue — Reserva Nacional Pampa Galeras

Sistema completo (React + Express + Oracle ADB) empaquetado en Docker y
desplegado en un servidor gratuito.

## Arquitectura

```
Usuario → Servidor gratuito (Docker) → Oracle Autonomous Database (nube OCI)
           Express (API) + React (SPA)     admin_rnpg / ADB us-ashburn-1
```

El backend se conecta a la ADB por **TCPS 1522** usando el wallet que está en
`backend/wallet/` (obligatorio: ADB exige TLS con certificados del wallet).

---

## 1. Despliegue local con Docker (prueba previa)

Requisitos: [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado.

```bash
# 1) Cargar el esquema y datos en la ADB (una sola vez, desde tu PC)
cd backend
node setup_adb.js

# 2) Levantar el sistema completo
cd ..
docker compose up -d --build

# 3) Abrir en el navegador
#    http://localhost:4000
#    Usuario: admin   Contraseña: admin123
```

Útiles:

```bash
docker compose logs -f      # ver logs en vivo
docker compose down         # detener
docker compose up -d --build  # reconstruir tras cambios de código
```

---

## 2. Despliegue en servidor gratuito

Opción recomendada: **Oracle Cloud Free Tier** (la misma cuenta donde vive la ADB),
instancia Always Free `VM.Standard.A1.Flex` (ARM, hasta 4 OCPU/24 GB gratis).

### 2.1 Crear la VM

1. OCI Console → **Compute → Instances → Create instance**.
2. Name: `pampa-galeras-app`.
3. Image: **Canonical Ubuntu 22.04** (o superior).
4. Shape: **VM.Standard.A1.Flex** con 1 OCPU y 6 GB RAM (Always Free).
5. Agregar llave SSH (o usar Cloud Shell).
6. En **Networking → Virtual cloud network → Security lists** abrir el puerto
   **TCP 4000** (o 80/443 si usarás puerto estándar) en la inbound rules.

### 2.2 Instalar Docker y desplegar

Conéctate por SSH:

```bash
ssh -i tu_llave.pem ubuntu@<IP_PUBLICA>
```

Instala Docker:

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker ubuntu && newgrp docker
```

Sube el proyecto (desde tu PC):

```bash
scp -i tu_llave.pem -r "ruta/al/proyecto" ubuntu@<IP_PUBLICA>:~/sistema
```

En la VM:

```bash
cd ~/sistema
cp backend/.env.example backend/.env   # si no traes tu .env real
nano backend/.env                      # completar credenciales ADB y JWT
docker compose up -d --build
```

### 2.3 (Recomendado) HTTPS con Caddy

```bash
sudo apt install -y caddy
sudo nano /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Contenido (con tu dominio o IP):

```
tu-dominio.com {
    reverse_proxy localhost:4000
}
```

Si usas IP pública sin dominio, abre solo el puerto 4000 y accede por
`http://<IP>:4000`.

### 2.4 Render (plan Free) — el elegido

**Paso A — Subir el código a GitHub** (solo el integrante designado):

```bash
cd "ruta\al\proyecto"
git add .
git commit -m "feat: empaquetado Docker + despliegue en Render (ADB en la nube)"
git push origin main
```

El wallet de la ADB y el `.env` **no** se suben (`.gitignore` los excluye).

**Paso B — Crear el servicio en Render:**

1. Entra a [render.com](https://render.com) con la cuenta del integrante.
2. **New → Web Service** → conecta el repo de GitHub
   `alEx777170/sistema-gestion-reserva-pampa-galeras`.
3. Render detecta el `render.yaml`; si no, configura a mano:
   - Runtime: **Docker**
   - Dockerfile path: `./Dockerfile`
   - Instance type: **Free**
4. Environment → añade estas variables:

| Key | Valor |
|---|---|
| `ORACLE_USER` | `admin_rnpg` |
| `ORACLE_PASSWORD` | `AdminRNPG_2025*` |
| `ORACLE_CONNECT_STRING` | `vkczdham6nyr8ljv_high` |
| `WALLET_B64` | (contenido de `wallet_b64.txt`, una sola línea enorme) |
| `JWT_SECRET` | (una frase secreta de ≥16 caracteres) |
| `ADMIN_USER` | (usuario del panel de administración, p. ej. `admin`) |
| `ADMIN_PASS` | (contraseña propia y fuerte; NO usar `admin123` en producción) |

`WALLET_B64` se genera en tu PC con:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\gen_wallet_b64.ps1
# abre wallet_b64.txt, copia TODO el contenido y pégalo en Render
```

5. **Create Web Service** → Render construye la imagen (frontend + backend) y
   publica la app en `https://pampa-galeras-xxxx.onrender.com`.

**Paso C — Cargar el esquema en la ADB** (desde tu PC, una vez):

```bash
cd backend
node setup_adb.js
```

**Paso D — Verificar:** abre la URL de Render, entra con el `ADMIN_USER`/`ADMIN_PASS` que definiste en Render.

> Nota del plan Free: tras ~15 min sin visitas la app se "duerme"; la primera
> visita tarda ~1 min en despertarla. Al reciclar el contenedor se pierden las
> fotos subidas (disco efímero). La información de la base de datos no se
> afecta: vive en la ADB.

### 2.5 Otras opciones gratuitas

| Servidor | Cómo | Notas |
|---|---|---|
| **Render.com** (Free) | New → Web Service → conectar el repo GitHub, Build: Dockerfile | Free plan duerme tras 15 min sin uso (al primer visitante tarda ~1 min en despertar). Permite salir a internet → conecta con la ADB sin problema. |
| **Fly.io** (Free allowance) | `fly launch` + `fly secrets set` | Buen rendimiento, requiere tarjeta de crédito para verificar. |
| **Oracle Cloud Free VM** | VM + Docker (guía arriba) | Siempre encendida, la mejor opción si ya tienes cuenta OCI. |

---

## 3. Cargar el esquema en la ADB (una sola vez)

Desde cualquier PC con Node.js y el repo:

```bash
cd backend
npm install
node setup_adb.js
```

El script:

1. Conecta como `ADMIN` de la ADB y (re)crea los usuarios del proyecto.
2. Genera `proyecto_adb.sql` (versión adaptada de `proyecto_completo.sql`: sin
   `CONTAINER`, `ROLE`, `PROFILE`, `GRANT ANY TABLE` — que ADB no permite).
3. Ejecuta el SQL como `admin_rnpg`: 10 tablas, 5 vistas, índices y ~400 filas.
4. Otorga permisos de objeto directos (sin roles intermedios).
5. Verifica con conteos por tabla.

---

## 4. Arquitectura de usuarios en la ADB

| Usuario | Contraseña | Rol |
|---|---|---|
| `ADMIN` | (la de la ADB) | Solo para `setup_adb.js`; nunca en producción |
| `admin_rnpg` | `AdminRNPG_2025*` | Dueño del esquema; lo usa el backend |
| `app_rnpg` | `AppRNPG_2025*` | CRUD completo (ejercicio de seguridad del curso) |
| `reportes_rnpg` | `ReportesRNPG_2025*` | Solo consulta |
| `personal_sernanp` | `PersonalSERNANP_2025*` | CRUD en animales/hatos/auditoría |

ADB no permite `CREATE ROLE`/`CREATE PROFILE`, por eso los permisos se otorgan
directamente a los usuarios en lugar de vía roles como en la versión local.

---

## 5. Archivos incluidos

| Archivo | Propósito |
|---|---|
| `Dockerfile` | Build en 2 etapas: compila el frontend y empaqueta backend + SPA |
| `docker-compose.yml` | Un solo servicio `app` en el puerto 4000, volumen para fotos |
| `.dockerignore` | Excluye `node_modules`, `dist`, `.env` y `uploads` del build |
| `backend/.env.example` | Plantilla de variables (copiar a `backend/.env`) |
| `backend/setup_adb.js` | Despliegue automático del esquema en la ADB |
| `backend/test_adb.js` | Diagnóstico de conectividad con la ADB |
| `backend/retry_adb.js` | Reintenta la conexión cada 20 s (15 min) |
| `backend/entrypoint.sh` | Instala el wallet desde WALLET_B64 al arrancar en Render |
| `scripts/gen_wallet_b64.ps1` | Genera `wallet_b64.txt` para la variable de Render |
| `render.yaml` | Configuración del servicio en Render (plan Free) |
| `backend/wallet/` | Wallet de la ADB (TCPS 1522 + mTLS; no se sube al repo) |
| `ENTREGA.txt` | Integrantes, enlace y credenciales (para el docente) |

---

## 6. Solución de problemas (ADB)

### ORA-12506 / NJS-511 "connection to listener was refused"

El TLS con el wallet **sí se negocia bien** (si el wallet fuera incorrecto el
error sería de SSL: NJS-510 / ORA-29024). `ORA-12506` significa que el listener
respondió pero **el servicio de la base aún no está registrado**:

- **Causa habitual:** la ADB se reinició o despertó de modo suspendido; el
  estado "Available" en la consola aparece antes de que el servicio esté listo.
  Esperar 5-15 min y reintentar (`node backend/retry_adb.js` reintenta solo).
- **Otra causa:** acceso por IP restringido. En la consola de la ADB, revisar
  que esté activado **Secure Access from Everywhere** (o que la IP pública
  actual esté en la lista permitida).
- **Descartar:** abrir **Database actions → SQL** en la consola de OCI; si ahí
  conecta, la base está viva y el problema es de red/IP.

### Credenciales rechazadas (ORA-01017 invalid username/password)

Ahí sí es la contraseña: verificar `ORACLE_USER`/`ORACLE_PASSWORD` en `.env`
(o en las variables de Render). La contraseña de `admin_rnpg` es sensible a
mayúsculas/minúsculas y caracteres especiales.
