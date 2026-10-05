-- Script para agregar columnas foto_ruta a las tablas ACTIVIDAD y RESERVA
ALTER SESSION SET CONTAINER = XEPDB1;

ALTER TABLE RESERVA ADD (foto_ruta VARCHAR2(500));
ALTER TABLE ACTIVIDAD ADD (foto_ruta VARCHAR2(500));

COMMIT;

-- Verificar que las columnas fueron creadas
DESC RESERVA;
DESC ACTIVIDAD;
