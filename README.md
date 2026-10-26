# Sistema de gestión – Reserva Nacional Pampa Galeras

Aplicación web para la Reserva Nacional Pampa Galeras Bárbara D'Achille:
React (Vite) en `frontend/`, Express en `backend/` y Oracle Database 21c.

## Base de datos

`proyecto_completo.sql` crea todo: perfiles, usuarios, roles, tablas, datos, vistas y permisos.
Es solo SQL (sin PL/SQL).

1. Detén el backend y cierra en SQL Developer las conexiones de `ADMIN_RNPG`, `APP_RNPG`, `REPORTES_RNPG` y `PERSONAL_SERNANP`.
2. Conéctate como `SYS` (rol SYSDBA) al contenedor raíz de XE.
3. Abre `proyecto_completo.sql` y ejecútalo con F5 (Ejecutar script).

El script se puede volver a ejecutar: borra y recrea todo, así que se pierden los datos registrados desde la aplicación.
La primera vez los `DROP` iniciales dan error porque los objetos no existen; es normal.

## Backend

```
cd backend
copy .env.example .env
# completar las credenciales de Oracle, ADMIN_USER, ADMIN_PASS y JWT_SECRET
npm install
npm run dev
```

El servidor no arranca si faltan `JWT_SECRET`, `ADMIN_USER`, `ADMIN_PASS` o las credenciales de Oracle.

## Frontend

```
cd frontend
npm install
npm run dev
```

## Reglas de negocio de las reservas

- Las actividades se realizan todos los días a las 08:00, 11:00 y 14:00.
- Cada horario tiene un cupo por día (`HORARIO_ACTIVIDAD.cupo_maximo`).
- Se reserva una actividad, una fecha (desde hoy hasta 60 días después) y un horario.
- Crear, confirmar y cancelar son transacciones SQL en el backend (`SELECT ... FOR UPDATE`, `INSERT`, `UPDATE`, `MERGE`, `COMMIT` / `ROLLBACK`).
- Una visita cuya fecha y hora ya pasaron no se puede confirmar ni cancelar.
- La hora se calcula en hora de Perú (`America/Lima`), sin depender de la zona horaria del servidor.

## Seguridad

- La consola SQL del panel Admin solo funciona con `ALLOW_EXECUTE=true`; déjala en `false` salvo en desarrollo.
- No subas `backend/.env` al repositorio (ya está en `.gitignore`).
