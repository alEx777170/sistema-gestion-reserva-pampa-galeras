# Reserva Natural - Proyecto (Generado)

Este repositorio contiene:
- `proyect.sql` 
- `backend/` - servidor Express para leer/servir/ejecutar el archivo SQL
- `frontend/` - app React (Vite) para visualizar las secciones y el contenido

Instrucciones rápidas:

1) Backend
```powershell
cd backend
copy .env.example .env
# editar .env con tus credenciales Oracle y SQL_FILE_PATH si es necesario
npm install
npm run dev
```

2) Frontend
```powershell
cd frontend
npm install
npm run dev
```

Notas sobre SQL Developer:
- Si lo que quieres es abrir y ejecutar `proyect.sql` en SQL Developer, abre el archivo con File -> Open y ejecútalo en la conexión deseada.
- El backend ofrece servicios web para integrar el contenido del archivo a una UI y, opcionalmente, ejecutar sentencias en Oracle si configuras `ALLOW_EXECUTE=true` y las credenciales en `.env`.

Seguridad y advertencias:
- No habilites ejecución remota en entornos abiertos.
- Revisa los scripts antes de ejecutarlos con permisos de DBA.


