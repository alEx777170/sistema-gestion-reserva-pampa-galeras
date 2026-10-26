# Reserva Frontend

App React (Vite) que consume la API del backend.

Instalación:

```powershell
cd frontend
npm install
npm run dev
```

Por defecto asume que el backend está disponible en `http://localhost:4000` y Vite hará proxy automático si lo configuras. Si el backend corre en otro host, cambia los `fetch`/`axios` en `App.jsx` o agrega un proxy en `vite.config.js`.

Imagen de logo: reemplaza `frontend/public/assets/nombredelafoto.png` o crea la carpeta `frontend/assets` y coloca ahí tus imágenes.

Proxy en desarrollo:
El proyecto ya incluye un `vite.config.js` que proxea `/api` a `http://localhost:4000`. Si el backend corre en otro puerto/host, actualiza `vite.config.js`.

Panel Admin:
- El frontend incluye un panel admin que permite "login" con las credenciales definidas en `backend/.env` (`ADMIN_USER`, `ADMIN_PASS`) y ejecutar SQL mediante los endpoints protegidos. Estas acciones son peligrosas: el backend previene la ejecución remota por defecto (ver `ALLOW_EXECUTE` y `ALLOW_EXECUTE_FULL` en `backend/.env.example`).
