# Reserva Backend

Servidor Express que permite leer y (opcionalmente) ejecutar el archivo `proyect.sql`.

Requerimientos:
- Node.js 16+ (recomendado 18+)
- Para ejecutar sentencias en Oracle: instalar y configurar `oracledb` y los Oracle Client Libraries (consulta la documentación de `oracledb`)

Instalación:

1. Copiar `.env.example` a `.env` y configurar las variables (ORACLE_* y SQL_FILE_PATH si no está en la raíz)

2. Instalar dependencias (desde `backend`):

```powershell
cd backend; npm install
```

3. Iniciar en modo desarrollo:

```powershell
npm run dev
```

Endpoints principales:
- `GET /api/sql/raw` -> devuelve el contenido bruto de `proyect.sql` (usa `SQL_FILE_PATH` o `../proyect.sql` por defecto)
- `GET /api/sql/sections` -> detecta y devuelve secciones basadas en comentarios `-- SECCIÓN ...`
- `POST /api/exec/run` -> ejecuta una sentencia SQL (solo si `ALLOW_EXECUTE=true` en .env)

Autenticación y ejecución segura:
- `POST /api/auth/login` -> { user, pass } devuelve `token` JWT para operaciones protegidas. Las credenciales válidas son `ADMIN_USER` y `ADMIN_PASS` en `.env`.
- `POST /api/exec/run` -> requiere `Authorization: Bearer <token>` y `ALLOW_EXECUTE=true`.
- `POST /api/exec/run-file` -> ejecuta el archivo SQL completo (dividido por líneas que contienen solo `/`). Requiere `Authorization: Bearer <token>`, `ALLOW_EXECUTE=true` y `ALLOW_EXECUTE_FULL=true`.

Ejemplo de login (curl):

```powershell
curl -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"user":"admin","pass":"changeme"}'
```

Guarda el `token` y úsalo así:

```powershell
curl -X POST http://localhost:4000/api/exec/run -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"sql":"SELECT 1 FROM DUAL"}'
```

Notas de seguridad:
- No habilites `ALLOW_EXECUTE=true` en entornos no controlados.
- El backend no valida permisos SQL a nivel de aplicación; controla accesos con firewall o autenticación si lo vas a exponer.

Uso con SQL Developer:

- Si tu objetivo es abrir `proyect.sql` desde SQL Developer, simplemente abre el archivo con File -> Open y ejecútalo allí. Este backend está pensado para integraciones web y para servir el script y sus secciones a una UI.
