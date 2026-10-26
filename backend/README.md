# Backend – Reserva Nacional Pampa Galeras

API Express sobre Oracle Database 21c (`oracledb`).

## Instalación

```
cd backend
copy .env.example .env   # completar Oracle, ADMIN_USER, ADMIN_PASS y JWT_SECRET
npm install
npm run dev
```

## Endpoints

Públicos: `GET /api/animales`, `/api/especies?reino=FAUNA|FLORA`, `/api/hatos`, `/api/reservas`,
`/api/actividades`, `/api/reservas-visita/disponibilidad?fecha=AAAA-MM-DD`, `POST /api/auth/login`.

Con token (`Authorization: Bearer ...`): altas, cambios y bajas de cada recurso, `GET/POST /api/turistas`,
`GET/POST /api/reservas-visita`, `PUT /api/reservas-visita/:id/confirmar`, `PUT /api/reservas-visita/:id/cancelar`
y `POST /api/exec/run` (solo con `ALLOW_EXECUTE=true`).
