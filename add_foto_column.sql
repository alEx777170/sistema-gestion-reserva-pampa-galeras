-- Script para agregar columna foto_ruta a la tabla ANIMAL
ALTER SESSION SET CONTAINER = XEPDB1;

ALTER TABLE ANIMAL ADD (foto_ruta VARCHAR2(500));

COMMIT;

-- Verificar que la columna fue creada
DESC ANIMAL;
