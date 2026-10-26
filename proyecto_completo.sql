--------------------------------------------------------
-- proyecto_completo.sql: base de datos completa de la Reserva Pampa Galeras
-- (usuarios, roles, tablas, datos, vistas, permisos y reservas transaccionales)
-- Ejecutar en SQL Developer conectado como SYS (rol SYSDBA)
-- al servicio XE (contenedor raíz), con F5 "Ejecutar script".
-- Se puede volver a ejecutar: borra y recrea todo desde cero.
--------------------------------------------------------
SET SERVEROUTPUT ON SIZE UNLIMITED;
WHENEVER SQLERROR CONTINUE;

ALTER SESSION SET CONTAINER = XEPDB1;

--------------------------------------------------------
-- SECCIÓN 0: LIMPIEZA (permite re-ejecutar el script)
--------------------------------------------------------
-- Cierra las sesiones abiertas de los usuarios del proyecto
-- (backend, SQL Developer, etc.) para que se puedan borrar
BEGIN
    FOR u IN (SELECT username FROM dba_users
              WHERE username IN ('ADMIN_RNPG','APP_RNPG','REPORTES_RNPG','PERSONAL_SERNANP')) LOOP
        EXECUTE IMMEDIATE 'ALTER USER ' || u.username || ' ACCOUNT LOCK';
    END LOOP;
    FOR s IN (SELECT sid, serial# AS serial FROM v$session
              WHERE username IN ('ADMIN_RNPG','APP_RNPG','REPORTES_RNPG','PERSONAL_SERNANP')) LOOP
        EXECUTE IMMEDIATE 'ALTER SYSTEM KILL SESSION ''' || s.sid || ',' || s.serial || ''' IMMEDIATE';
        DBMS_OUTPUT.PUT_LINE('Sesión cerrada: ' || s.sid);
    END LOOP;
    DBMS_LOCK.SLEEP(3);
END;
/

BEGIN
    FOR u IN (SELECT username FROM dba_users
              WHERE username IN ('ADMIN_RNPG','APP_RNPG','REPORTES_RNPG','PERSONAL_SERNANP')) LOOP
        EXECUTE IMMEDIATE 'DROP USER ' || u.username || ' CASCADE';
        DBMS_OUTPUT.PUT_LINE('Usuario eliminado: ' || u.username);
    END LOOP;
    FOR r IN (SELECT role FROM dba_roles
              WHERE role IN ('ROL_ADMINISTRADOR','ROL_APLICACION','ROL_CONSULTA','ROL_PERSONAL')) LOOP
        EXECUTE IMMEDIATE 'DROP ROLE ' || r.role;
        DBMS_OUTPUT.PUT_LINE('Rol eliminado: ' || r.role);
    END LOOP;
    FOR p IN (SELECT DISTINCT profile FROM dba_profiles
              WHERE profile IN ('PERFIL_ADMIN','PERFIL_APLICACION')) LOOP
        EXECUTE IMMEDIATE 'DROP PROFILE ' || p.profile || ' CASCADE';
        DBMS_OUTPUT.PUT_LINE('Perfil eliminado: ' || p.profile);
    END LOOP;
END;
/

--------------------------------------------------------
-- SECCIÓN 1: CONFIGURACIÓN INICIAL
--------------------------------------------------------
ALTER SYSTEM SET RESOURCE_LIMIT = TRUE SCOPE = BOTH;

--------------------------------------------------------
-- SECCIÓN 2: PERFILES Y USUARIOS
--------------------------------------------------------

-- PERFIL 1: Administrador
CREATE PROFILE PERFIL_ADMIN LIMIT
    SESSIONS_PER_USER       UNLIMITED
    IDLE_TIME               UNLIMITED
    CONNECT_TIME            UNLIMITED
    PASSWORD_LIFE_TIME      UNLIMITED
    FAILED_LOGIN_ATTEMPTS   UNLIMITED
    CPU_PER_SESSION         UNLIMITED;

-- PERFIL 2: Aplicación (Seguro)
CREATE PROFILE PERFIL_APLICACION LIMIT
    SESSIONS_PER_USER       5
    IDLE_TIME               60
    CONNECT_TIME            600
    FAILED_LOGIN_ATTEMPTS   3
    PASSWORD_LOCK_TIME      1
    PASSWORD_LIFE_TIME      30
    PASSWORD_REUSE_TIME     30;
    -- NOTA: Se comenta la siguiente línea para evitar errores si la función no existe en tu BD
    -- PASSWORD_VERIFY_FUNCTION ORA12C_VERIFY_FUNCTION; 

-- Creación de Usuarios
-- 1. Admin
CREATE USER admin_rnpg IDENTIFIED BY "AdminRNPG_2025*"
    DEFAULT TABLESPACE users
    TEMPORARY TABLESPACE temp
    QUOTA UNLIMITED ON users
    PROFILE PERFIL_ADMIN;

-- 2. App
CREATE USER app_rnpg IDENTIFIED BY "AppRNPG_2025*"
    DEFAULT TABLESPACE users
    TEMPORARY TABLESPACE temp
    QUOTA 50M ON users
    PROFILE PERFIL_APLICACION;

-- 3. Reportes
CREATE USER reportes_rnpg IDENTIFIED BY "ReportesRNPG_2025*"
    DEFAULT TABLESPACE users
    TEMPORARY TABLESPACE temp
    QUOTA 5M ON users
    PROFILE PERFIL_APLICACION;

-- 4. Personal
CREATE USER personal_sernanp IDENTIFIED BY "PersonalSERNANP_2025*"
    DEFAULT TABLESPACE users
    TEMPORARY TABLESPACE temp
    QUOTA 5M ON users
    PROFILE PERFIL_APLICACION;

-- Permisos básicos de conexión
GRANT CREATE SESSION TO admin_rnpg, app_rnpg, reportes_rnpg, personal_sernanp;

--------------------------------------------------------
-- SECCIÓN 3: ROLES (Solo Definición)
--------------------------------------------------------
CREATE ROLE rol_administrador;
CREATE ROLE rol_aplicacion;
CREATE ROLE rol_consulta;
CREATE ROLE rol_personal;

-- Asignación de permisos de sistema a los roles
GRANT CREATE TABLE, CREATE VIEW, CREATE PROCEDURE, CREATE SEQUENCE, CREATE TRIGGER, CREATE ROLE, ALTER USER, DROP USER TO rol_administrador WITH ADMIN OPTION;
GRANT SELECT ANY TABLE, INSERT ANY TABLE, UPDATE ANY TABLE TO rol_aplicacion; -- Cuidado con ANY TABLE en producción
GRANT SELECT ANY TABLE TO rol_consulta;

-- Asignación de roles a usuarios
GRANT rol_administrador TO admin_rnpg;
GRANT rol_aplicacion TO app_rnpg;
GRANT rol_consulta TO reportes_rnpg;
GRANT rol_personal TO personal_sernanp;

--------------------------------------------------------
-- CORRECCIÓN: todos los objetos se crean en el esquema ADMIN_RNPG
-- (el backend se conecta con este usuario y usa nombres sin prefijo)
--------------------------------------------------------
ALTER SESSION SET CURRENT_SCHEMA = admin_rnpg;

--------------------------------------------------------
-- SECCIÓN 4: CREACIÓN DE TABLAS (DDL)
--------------------------------------------------------

-- 1. Tabla RESERVA
CREATE TABLE RESERVA (
    id_reserva      NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR2(120) NOT NULL,
    ubicacion       VARCHAR2(200),
    superficie_ha   NUMBER(12,2) CHECK (superficie_ha >= 0),
    categoria       VARCHAR2(50),
    foto_ruta       VARCHAR2(500)
);

COMMENT ON TABLE RESERVA IS 'Reservas naturales o áreas protegidas.';

-- 2. Tabla TURISTA
CREATE TABLE TURISTA (
    id_turista      NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY PRIMARY KEY,
    id_reserva      NUMBER,
    dni             CHAR(8) UNIQUE,
    nombre          VARCHAR2(60) NOT NULL,
    apellido        VARCHAR2(80),
    edad            NUMBER CHECK (edad >= 0 AND edad <= 130),
    nacionalidad    VARCHAR2(60),
    CONSTRAINT fk_turista_reserva FOREIGN KEY (id_reserva) REFERENCES RESERVA(id_reserva) ON DELETE SET NULL
);

-- 3. Tabla ACTIVIDAD
CREATE TABLE ACTIVIDAD (
    id_actividad        NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY PRIMARY KEY,
    nombre              VARCHAR2(120) NOT NULL,
    tipo                VARCHAR2(60),
    lugar               VARCHAR2(150),
    fecha_realizacion   DATE,
    duracion_min        NUMBER CHECK (duracion_min >= 0),
    costo_soles         NUMBER(10,2) CHECK (costo_soles >= 0),
    foto_ruta           VARCHAR2(500),
    descripcion         VARCHAR2(1000)
);

-- 4. Tabla TURISTA_ACTIVIDAD
CREATE TABLE TURISTA_ACTIVIDAD (
    id_turista          NUMBER NOT NULL,
    id_actividad        NUMBER NOT NULL,
    fecha_participacion DATE DEFAULT SYSDATE,
    estado              VARCHAR2(30) DEFAULT 'confirmado',
    CONSTRAINT pk_turista_actividad PRIMARY KEY (id_turista, id_actividad, fecha_participacion),
    CONSTRAINT fk_ta_turista FOREIGN KEY (id_turista) REFERENCES TURISTA(id_turista) ON DELETE CASCADE,
    CONSTRAINT fk_ta_actividad FOREIGN KEY (id_actividad) REFERENCES ACTIVIDAD(id_actividad) ON DELETE CASCADE
);

CREATE INDEX idx_ta_turista ON TURISTA_ACTIVIDAD(id_turista);
CREATE INDEX idx_ta_actividad ON TURISTA_ACTIVIDAD(id_actividad);

-- 5. Tabla PERSONAL
CREATE TABLE PERSONAL (
    id_personal     NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR2(60) NOT NULL,
    apellido        VARCHAR2(80),
    cargo           VARCHAR2(80),
    especialidad    VARCHAR2(120)
);

-- 6. Tabla ACTIVIDAD_PERSONAL
CREATE TABLE ACTIVIDAD_PERSONAL (
    id_personal         NUMBER NOT NULL,
    id_actividad        NUMBER NOT NULL,
    rol                 VARCHAR2(60),
    fecha_asignacion    DATE DEFAULT SYSDATE,
    CONSTRAINT pk_actividad_personal PRIMARY KEY (id_personal, id_actividad),
    CONSTRAINT fk_ap_personal FOREIGN KEY (id_personal) REFERENCES PERSONAL(id_personal) ON DELETE CASCADE,
    CONSTRAINT fk_ap_actividad FOREIGN KEY (id_actividad) REFERENCES ACTIVIDAD(id_actividad) ON DELETE CASCADE
);

-- 7. Tabla HATO
CREATE TABLE HATO (
    id_hato             NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY PRIMARY KEY,
    id_reserva          NUMBER NOT NULL,
    cantidad_animales   NUMBER CHECK (cantidad_animales >= 0),
    zona                VARCHAR2(120),
    CONSTRAINT fk_hato_reserva FOREIGN KEY (id_reserva) REFERENCES RESERVA(id_reserva) ON DELETE CASCADE
);

-- 8. Tabla ESPECIE (Modificada para coincidir con tu data de inserción)
CREATE TABLE ESPECIE (
    id_especie          NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY PRIMARY KEY,
    nombre_comun        VARCHAR2(120), -- Se quita NOT NULL para permitir carga masiva inicial
    nombre_cientifico   VARCHAR2(160),
    estado_conservacion VARCHAR2(60),
    clase               VARCHAR2(100), -- Agregado
    orden               VARCHAR2(100), -- Agregado
    familia             VARCHAR2(100), -- Agregado
    CONSTRAINT chk_estado_cons CHECK (estado_conservacion IS NULL OR estado_conservacion IN ('LC','NT','VU','EN','CR','DD','NE'))
);

-- 9. Tabla ANIMAL
CREATE TABLE ANIMAL (
    id_animal       NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY PRIMARY KEY,
    id_hato         NUMBER NOT NULL,
    id_especie      NUMBER NOT NULL,
    sexo            CHAR(1) CHECK (sexo IN ('M','F','U')),
    edad_anios      NUMBER CHECK (edad_anios >= 0),
    fecha_registro  DATE DEFAULT SYSDATE,
    observaciones   VARCHAR2(1000),
    foto_ruta       VARCHAR2(500),
    CONSTRAINT fk_animal_hato FOREIGN KEY (id_hato) REFERENCES HATO(id_hato) ON DELETE CASCADE,
    CONSTRAINT fk_animal_especie FOREIGN KEY (id_especie) REFERENCES ESPECIE(id_especie) -- Quitamos restrict para evitar problemas de FK simples
);

-- 10. Tabla AUDITORIA_ANIMAL
CREATE TABLE AUDITORIA_ANIMAL (
    id_auditoria NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY PRIMARY KEY,
    id_animal    NUMBER,
    operacion    VARCHAR2(10),
    usuario      VARCHAR2(50),
    fecha        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

--------------------------------------------------------
-- SECCIÓN 6: VISTAS
--------------------------------------------------------

CREATE OR REPLACE VIEW vw_animales_por_reserva AS
SELECT r.id_reserva, 
       r.nombre AS reserva, 
       h.id_hato, 
       h.zona, 
       a.id_animal, 
       e.nombre_comun AS especie, 
       a.sexo, 
       a.edad_anios, 
       a.fecha_registro 
FROM RESERVA r 
JOIN HATO h ON h.id_reserva = r.id_reserva 
JOIN ANIMAL a ON a.id_hato = h.id_hato 
JOIN ESPECIE e ON e.id_especie = a.id_especie;

CREATE OR REPLACE VIEW vw_resumen_actividades AS 
SELECT 
    a.id_actividad, 
    a.nombre, 
    a.fecha_realizacion, 
    a.costo_soles, 
    COUNT(ta.id_turista) AS total_participantes, 
    a.costo_soles * COUNT(ta.id_turista) AS ingresos_total 
FROM ACTIVIDAD a 
LEFT JOIN TURISTA_ACTIVIDAD ta ON a.id_actividad = ta.id_actividad 
    AND ta.estado != 'cancelado' 
GROUP BY a.id_actividad, a.nombre, a.fecha_realizacion, a.costo_soles;

CREATE OR REPLACE VIEW vw_especies_conservacion AS 
SELECT 
    e.estado_conservacion, 
    COUNT(DISTINCT e.id_especie) AS total_especies, 
    COUNT(a.id_animal) AS total_individuos 
FROM ESPECIE e 
LEFT JOIN ANIMAL a ON e.id_especie = a.id_especie 
GROUP BY e.estado_conservacion 
ORDER BY 
    CASE e.estado_conservacion 
        WHEN 'CR' THEN 1 
        WHEN 'EN' THEN 2 
        WHEN 'VU' THEN 3 
        WHEN 'NT' THEN 4 
        ELSE 5 
    END;

GRANT SELECT ON vw_resumen_actividades TO rol_consulta;
GRANT SELECT ON vw_animales_por_reserva TO rol_consulta;
GRANT SELECT ON vw_especies_conservacion TO rol_consulta;

--------------------------------------------------------
-- SECCIÓN 7: INSERCIÓN DE DATOS (DML)
--------------------------------------------------------
-- Datos RESERVA
INSERT INTO RESERVA (nombre, ubicacion, superficie_ha, categoria) 
VALUES ('Reserva Nacional Pampa Galeras Bárbara D''Achille', 'Lucanas, Ayacucho', 6500.00, 'Reserva Nacional'); 

INSERT INTO RESERVA (nombre, ubicacion, superficie_ha, categoria) 
VALUES ('Zona de Amortiguamiento Norte', 'Lucanas, Ayacucho', 2500.00, 'Zona Amortiguamiento'); 

-- Datos ESPECIE (Corregido para Oracle: Sin backticks ` y columnas mapeadas)

  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Malvales','Malvaceae','Tarasa urbaniana');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Mammalia','Cetartiodactyla','Camelidae','Vicugna vicugna');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Stipa hans-meyeri');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Tinamiformes','Tinamidae','Tinamotis pentlandii');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Rosales','Rosaceae','Tetraglochin alata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Turdidae','Turdus chiguanco');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Troglodytidae','Troglodytes aedon');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Charadriiformes','Thinocoridae','Thinocorus rumicivorus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Upucerthia albigula');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Upucerthia validirostris');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Rosales','Urticaceae','Urtica flabellata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Werneria pygmaea');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Charadriiformes','Charadriidae','Vanellus resplendens');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Charadriiformes','Scolopacidae','Tringa flavipes');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Cathartiformes','Cathartidae','Vultur gryphus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Charadriiformes','Scolopacidae','Tringa melanoleuca');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Passerellidae','Zonotrichia capensis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Trisetum spicatum');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Caprimulgiformes','Caprimulgidae','Systellura longirostris');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Vulpia myuros var. hirsuta');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Charadriiformes','Thinocoridae','Thinocorus orbignyianus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Cotingidae','Zaratornis stresemanni');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Brassicales','Brassicaceae','Weberbauera peruviana');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Werneria apiculata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Dipsacales','Caprifoliaceae','Valeriana asplenifolia');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Cyperaceae','Trichophorum rigidum');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Fabales','Fabaceae','Trifolium amabile');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Falconiformes','Falconidae','Falco femoralis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Nassella inconspicua');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Geraniales','Geraniaceae','Erodium cicutarium');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Nassella brachyphylla');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Thraupidae','Sicalis uropygialis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Fabales','Fabaceae','Lupinus ananeanus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Tyrannidae','Agriornis albicauda');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Caryophyllales','Caryophyllaceae','Arenaria tetragyna');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Thraupidae','Conirostrum cinereum');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Mammalia','Carnivora','Mephitidae','Conepatus chinga');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Pelecaniformes','Ardeidae','Ardea alba');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Lamiales','Scrophulariaceae','Buddleja incana');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Deschampsia ovata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Insecta','Diptera','Calliphoridae','Compsomyiops melloi');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Falconiformes','Falconidae','Falco peregrinus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Insecta','Diptera','Calliphoridae','Compsomyiops arequipensis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Tyrannidae','Anairetes flavirostris');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Tyrannidae','Anairetes parulus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Apodiformes','Trochilidae','Metallura phoebe');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Mammalia','Carnivora','Canidae','Lycalopex (Pseudalopex) culpaeus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Apodiformes','Trochilidae','Patagona gigas');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Dielsiochloa floribunda');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Anseriformes','Anatidae','Anas flavirostris');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Juncaceae','Luzula racemosa');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Lamiales','Orobanchaceae','Castilleja fissifolia');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Fabales','Fabaceae','Lupinus microphyllus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Falconiformes','Falconidae','Falco sparverius');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Juncaceae','Luzula peruviana');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Myrtales','Onagraceae','Epilobium denticulatum');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Charadriiformes','Laridae','Chroicocephalus serranus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Ranunculales','Ranunculaceae','Ranunculus trichophyllus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Columbiformes','Columbidae','Metriopelia aymara');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Mammalia','Carnivora','Felidae','Leopardus jacobitus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Perezia coerulescens');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Mammalia','Cetartiodactyla','Cervidae','Hippocamelus antisensis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Anatherostipa obtusa');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Anatherostipa rigidiseta');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Psittaciformes','Psittacidae','Bolborhynchus orbygnesius');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Fabales','Fabaceae','Lupinus pinguis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Thraupidae','Catamenia analis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Thraupidae','Phrygilus punensis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Thraupidae','Rhopospina alaudina');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Erigeron ecuadoriensis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Erigeron bonariensis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Hypochaeris echegarayi');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Insecta','Diptera','Calliphoridae','Sarconesia splendida');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Insecta','Diptera','Calliphoridae','Sarconesia versicolor');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Insecta','Diptera','Calliphoridae','Sarconesiopsis magellanica');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asparagales','Iridaceae','Sisyrinchium jamesonii');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Hypochaeris taraxacoides');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Tyrannidae','Ochthoeca oenanthoides');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Tyrannidae','Lessonia oreas');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Tyrannidae','Ochthoeca leucophrys');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Poa annua');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Accipitriformes','Accipitridae','Buteo brachyurus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Cathartiformes','Cathartidae','Cathartes aura');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Insecta','Diptera','Calliphoridae','Calliphora nigribasis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Malvales','Malvaceae','Acaulimalva purdiei');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Saxifragales','Saxifragaceae','Saxifraga magellanica');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Bidens andicola');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Caryophyllales','Cactaceae','Cumulopuntia galerasensis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Ranunculales','Berberidaceae','Berberis lutea');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Saxifragales','Grossulariaceae','Ribes cuneifolium');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Accipitriformes','Accipitridae','Geranoaetus polyosoma');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Belloa piptolepis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Accipitriformes','Accipitridae','Geranoaetus melanoleucus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Geraniales','Geraniaceae','Geranium sessiliflorum');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Charadriiformes','Scolopacidae','Calidris melanotos');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Thraupidae','Geospizopsis unicolor');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Phoenicopteriformes','Phoenicopteridae','Phoenicopterus chilensis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Thraupidae','Geospizopsis plebejus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Poa aequigluma');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Hirundinidae','Orochelidon murina');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Geositta tenuirostris');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Geositta cunicularia');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Geositta crassirostris');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Deyeuxia tarmensis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Cyperaceae','Carex hypsipedos');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Charadriiformes','Scolopacidae','Calidris bairdii');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Hirundinidae','Orochelidon andecola');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Solanales','Solanaceae','Salpichroa glandulosa');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Malvales','Malvaceae','Nototriche sulcata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Malvales','Malvaceae','Nototriche pinnata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Stenotaphrum secundatum');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Proustia berberidifolia');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Lamiales','Calceolariaceae','Calceolaria lobata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Accipitriformes','Accipitridae','Circus cinereus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Poa calycina');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Gentianales','Gentianaceae','Gentianella potamophila');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Loricaria graveolens');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Baccharis tricuneata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Piciformes','Picidae','Colaptes atricollis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Cornales','Loasaceae','Caiophora cirsiifolia');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Perezia multiflora');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Charadriiformes','Charadriidae','Oreopholus ruficollis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Insecta','Coleoptera','Silphidae','Oxelytrum anticola');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Gentianales','Gentianaceae','Gentianella brunneotincta');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Tyrannidae','Cnemarchus rufipennis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Cinnagrostis vicunarum');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Cinnagrostis minima');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Calamagrostis amoena');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Apodiformes','Trochilidae','Oreotrochilus estella');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Caryophyllales','Montiaceae','Calandrinia ciliata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Cinnagrostis jamesonii');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Calamagrostis heterophylla');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Gentianales','Gentianaceae','Gentiana prolata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Tinamiformes','Tinamidae','Nothoprocta pentlandii');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Cinnagrostis curvula');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Apodiformes','Apodidae','Aeronautes andecolus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Cinnagrostis brevifolia');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Calamagrostis macbridei');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Calamagrostis macrophylla');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Santalales','Loranthaceae','Ligaria cuneifolia');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Calamagrostis recta');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Calamagrostis rigescens');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Tinamiformes','Tinamidae','Nothoprocta ornata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Anseriformes','Anatidae','Oressochen melanopterus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Calamagrostis spiciformis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Calamagrostis trichophylla');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Baccharis genistelloides');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Poa chamaeclinos');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Ranunculales','Ranunculaceae','Ranunculus flagelliformis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Poa fibrifera');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Poa gilgiana');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Boraginales','Boraginaceae','Plagiobothrys congestus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Poa gymnantha');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Brassicales','Brassicaceae','Capsella bursa-pastoris');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Apiales','Apiaceae','Azorella diapensioides');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Leptasthenura striata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Caryophyllales','Caryophyllaceae','Pycnophyllum molle');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Caryophyllales','Caryophyllaceae','Pycnophyllum bryoides');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Bromeliaceae','Puya ponderosa');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Bromeliaceae','Puya hamata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Lamiales','Plantaginaceae','Plantago major');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Apiales','Apiaceae','Lilaeopsis macloviana');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Poa lilloi');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Leptasthenura pileata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Poa macusaniensis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Aciachne pulvinata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Poa pearsonii');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Agrostis breviculmis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Poa perligulata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Leptasthenura andicola');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Gamochaeta purpurea');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Poa pseudoaequigluma');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Paranephelius ovatus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Pelecaniformes','Threskiornithidae','Plegadis ridgwayi');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Gentianales','Rubiaceae','Gallium canescens');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Mammalia','Carnivora','Felidae','Puma concolor');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Poa serpaiana');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Parastrephia lepidophylla');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Apodiformes','Trochilidae','Colibri coruscans');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Poa spicigera');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Poa trollii');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Caryophyllales','Cactaceae','Austrocylindropuntia floccosa');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Agrostis exasperata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Cinclodes atacamensis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Reptilia','Sauria','Liolaemidae','Liolaemus wari');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Charadriiformes','Scolopacidae','Gallinago andina');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Bromus lanatus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Lamiales','Plantaginaceae','Plantago nubicola');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Mammalia','Rodentia','Cricetidae','Auliscomys pictus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Agrostis tolucensis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Reptilia','Sauria','Liolaemidae','Liolaemus williamsi');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Lamiales','Plantaginaceae','Plantago rigida');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Fringillidae','Spinus magellanicus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Polypodiales','Pteridaceae','Pellaea ternifolia');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Fringillidae','Spinus uropygialis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Thraupidae','Diglossa brunneiventris');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Insecta','Diptera','Calliphoridae','Cochliomyia macellaria');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Fringillidae','Spinus crassirostris');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Insecta','Diptera','Piophilidae','Piophila casei');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Isoetales','Isoetaceae','Isoetes hieronymi');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Juncaceae','Distichia muscoides');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Fringillidae','Spinus atratus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Bromus catharticus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Muhlenbergia ligularis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Charadriiformes','Thinocoridae','Attagis gayi');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Luciliocline subspicata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Cinclodes albiventris');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Misbrookea strigosissima');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Muhlenbergia peruviana');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Gruiformes','Rallidae','Fulica ardesiaca');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Insecta','Coleoptera','Staphylinidae','Creophilus maxilosus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Solanales','Solanaceae','Jaltomata diversa');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Malvales','Malvaceae','Fuertesimalva echinata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Pseudasthenes cactorum');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Passerellidae','Atlapetes nationi');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Lamiales','Plantaginaceae','Plantago sericea');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Jarava ichu');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Strigiformes','Strigidae','Athene cunicularia');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Cyperaceae','Eleocharis albibracteata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Senecio evacoides');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Insecta','Diptera','Muscidae','Musca domestica');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Alopecurus hitchcockii');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Tyrannidae','Muscisaxicola albifrons');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Caryophyllales','Caryophyllaceae','Paronychia andina');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Senecio hohenackeri');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Tyrannidae','Muscisaxicola cinereus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Anseriformes','Anatidae','Spatula puna');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Thraupidae','Rhipospina fruticeti');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Rosales','Rosaceae','Polylepis triacontandra');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Chuquiraga spinosa');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Insecta','Coleoptera','Trogidae','Polynoncus peruanus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Tyrannidae','Muscisaxicola griseus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Apiales','Apiaceae','Bowlesia flabili');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Senecio nutans');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Tyrannidae','Muscisaxicola juninensis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Anseriformes','Anatidae','Spatula cyanoptera');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Tyrannidae','Agriornis montanus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Alismatales','Hydrocharitaceae','Elodea potamogeton');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Lamiales','Orobanchaceae','Neobartsia mutica');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Tyrannidae','Muscisaxicola maclovianus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Tyrannidae','Muscisaxicola maculirostris');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Lamiales','Scrophulariaceae','Buddleja coriacea');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Tyrannidae','Muscisaxicola rufivertex');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Senecio rufescens');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Polypodiales','Dryopteridaceae','Polystichum orbiculatum');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Mutisia hastata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Senecio spinosus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Polypodiales','Pteridaceae','Cheilanthes fraseri');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Fabales','Fabaceae','Astragalus minimus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Solanales','Solanaceae','Solanum acaule');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Brassicales','Brassicaceae','Lepidium chichicara');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Fabales','Fabaceae','Astragalus micranthellus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Polypodiales','Pteridaceae','Cheilanthes pruinata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Brassicales','Brassicaceae','Descurainia depressa');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Fabales','Fabaceae','Astragalus garbancillo');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Strigiformes','Strigidae','Bubo virginianus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Dactilis glomerata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Fabales','Fabaceae','Astragalus brackenridgei');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Asthenes wyatti');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Asthenes pudibunda');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Asthenes ottonis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Asthenes modesta');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Pseudognaphalium cheiranthifolium');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Asthenes humilis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Furnariidae','Asthenes dorbignyi');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Polypodiales','Aspleniaceae','Asplenium triphyllum');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Rosales','Rosaceae','Lachemilla diplophylla');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Rosales','Rosaceae','Lachemilla pinnata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Polypodiales','Aspleniaceae','Asplenium monanthes');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Ephedrales','Ephedraceae','Ephedra americana');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Saxifragales','Haloragaceae','Myriophyllum quitense');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Fabales','Fabaceae','Medicago sativa');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Caryophyllales','Cactaceae','Corryocactus brevistylus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Strigiformes','Strigidae','Asio flammeus');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Mammalia','Cetartiodactyla','Camelidae','Lama guanicoe');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Charadriiformes','Scolopacidae','Phalaropus tricolor');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Anseriformes','Anatidae','Merganetta armata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Festuca rigescens');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Piciformes','Picidae','Colaptes rupicola');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Festuca peruviana');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Festuca parvipaniculata');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Columbiformes','Columbidae','Metriopelia melanoptera');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Festuca lasiorrhachis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Festuca humilior');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Festuca huamachucensis');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Festuca dolichophylla');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Festuca divergens');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Columbiformes','Columbidae','Metriopelia ceciliae');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Conyza deserticola');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Poales','Poaceae','Nassella rupestris');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Thraupidae','Sicalis olivascens');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Passeriformes','Thraupidae','Sicalis raimondii');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Equisetopsida','Asterales','Asteraceae','Pseudognaphalium lacteum');
  INSERT INTO ESPECIE (Clase, Orden, Familia, nombre_cientifico) VALUES ('Aves','Falconiformes','Falconidae','Phalcoboenus megalopterus');
commit;

-- Datos PERSONAL
INSERT INTO PERSONAL (nombre, apellido, cargo, especialidad) 
VALUES ('Carlos', 'Mendoza', 'Jefe de Reserva', 'Gestión Ambiental'); 

INSERT INTO PERSONAL (nombre, apellido, cargo, especialidad) 
VALUES ('Ana', 'Quispe', 'Bióloga Senior', 'Conservación de Fauna'); 

INSERT INTO PERSONAL (nombre, apellido, cargo, especialidad) 
VALUES ('Luis', 'Torres', 'Guardaparque', 'Vigilancia y Control'); 

INSERT INTO PERSONAL (nombre, apellido, cargo, especialidad) 
VALUES ('Yuzo', 'Diaz Sobrino', 'Investigador Científico', 'Investigación de Biodiversidad'); 

INSERT INTO PERSONAL (nombre, apellido, cargo, especialidad) 
VALUES ('Manuel Alejandro', 'Távara Zuloaga', 'Investigador Científico', 'Conservación de Especies'); 

-- Datos TURISTA
INSERT INTO TURISTA (id_reserva, dni, nombre, apellido, edad, nacionalidad) 
VALUES (1, '71234567', 'María', 'Gonzales', 28, 'Peruana'); 

INSERT INTO TURISTA (id_reserva, dni, nombre, apellido, edad, nacionalidad) 
VALUES (1, '87654321', 'John', 'Smith', 35, 'Estadounidense'); 

INSERT INTO TURISTA (id_reserva, dni, nombre, apellido, edad, nacionalidad) 
VALUES (1, '76543210', 'Laura', 'Fernández', 42, 'Española'); 

-- Datos ACTIVIDAD
INSERT INTO ACTIVIDAD (nombre, tipo, lugar, fecha_realizacion, duracion_min, costo_soles) 
VALUES ('Avistamiento de Vicuñas', 'Ecoturismo', 'Zona Norte', DATE '2025-04-15', 120, 50.00); 

INSERT INTO ACTIVIDAD (nombre, tipo, lugar, fecha_realizacion, duracion_min, costo_soles) 
VALUES ('Caminata Ecológica', 'Turismo Aventura', 'Sendero Principal', DATE '2025-04-20', 180, 30.00); 

INSERT INTO ACTIVIDAD (nombre, tipo, lugar, fecha_realizacion, duracion_min, costo_soles) 
VALUES ('Chaccu Tradicional', 'Cultural', 'Zona Sur', DATE '2025-05-10', 240, 80.00);

-- Actividades adicionales (con descripcion)
INSERT INTO ACTIVIDAD (nombre, tipo, lugar, fecha_realizacion, duracion_min, costo_soles, descripcion)
VALUES ('Observación de Aves Andinas', 'Ecoturismo', 'Zona Norte', TRUNC(SYSDATE) + 10, 150, 40.00,
        'Recorrido guiado con binoculares para observar aves de altura como el cóndor andino, el halcón peregrino y el colibrí gigante. Incluye guía especializado y una breve charla sobre su conservación.');

INSERT INTO ACTIVIDAD (nombre, tipo, lugar, fecha_realizacion, duracion_min, costo_soles, descripcion)
VALUES ('Fotografía de Naturaleza', 'Turismo Aventura', 'Sendero Principal', TRUNC(SYSDATE) + 17, 180, 60.00,
        'Sesión fotográfica guiada por los paisajes de la puna y la fauna de la reserva. Se recomiendan cámara con zoom y ropa abrigada; el guía indica los mejores puntos de luz y de avistamiento.');

-- Descripciones de las actividades originales
UPDATE ACTIVIDAD SET descripcion = 'Caminata de observación para ver vicuñas en su hábitat natural, acompañados por un guía. Se aprende sobre su comportamiento, su fibra y las medidas de protección de la especie.' WHERE nombre = 'Avistamiento de Vicuñas';
UPDATE ACTIVIDAD SET descripcion = 'Recorrido a pie por el sendero principal de la reserva, con paradas para observar flora y fauna de la puna. Nivel de dificultad moderado; se recomienda calzado de trekking y protector solar.' WHERE nombre = 'Caminata Ecológica';
UPDATE ACTIVIDAD SET descripcion = 'Participación en el chaccu, ceremonia ancestral de captura y esquila de vicuñas que combina tradición andina y manejo sostenible. Incluye explicación cultural a cargo de la comunidad.' WHERE nombre = 'Chaccu Tradicional'; 

-- Datos HATO
INSERT INTO HATO (id_reserva, cantidad_animales, zona) 
VALUES (1, 150, 'Zona Norte'); 

INSERT INTO HATO (id_reserva, cantidad_animales, zona) 
VALUES (1, 200, 'Zona Sur'); 

-- Datos ANIMAL
-- NOTA: Como hemos insertado especies masivamente, asumimos que el ID 1 y 2 existen.
-- Si la tabla estaba vacía y se llenó en orden, el ID 1 corresponde a 'Tarasa urbaniana' (planta) y el 2 a 'Vicugna vicugna'.
-- Ajustaré el insert para usar ID 2 (Vicuña) que tiene sentido en un hato.

INSERT INTO ANIMAL (id_hato, id_especie, sexo, edad_anios, fecha_registro, observaciones) 
VALUES (1, 8, 'M', 3, DATE '2025-01-10', 'Estado saludable, sin observaciones'); 

INSERT INTO ANIMAL (id_hato, id_especie, sexo, edad_anios, fecha_registro, observaciones) 
VALUES (1, 9, 'F', 4, DATE '2025-01-10', 'Adulto reproductor'); 

INSERT INTO ANIMAL (id_hato, id_especie, sexo, edad_anios, fecha_registro, observaciones) 
VALUES (2, 10, 'M', 2, DATE '2025-01-15', 'Juvenil en crecimiento');

-- Animales adicionales (la especie se busca por nombre científico)
INSERT INTO ANIMAL (id_hato, id_especie, sexo, edad_anios, fecha_registro, observaciones)
SELECT 1, id_especie, 'M', 12, DATE '2025-02-05', 'Cóndor andino adulto, observado con frecuencia en zonas altas'
FROM ESPECIE WHERE nombre_cientifico = 'Vultur gryphus' FETCH FIRST 1 ROW ONLY;

INSERT INTO ANIMAL (id_hato, id_especie, sexo, edad_anios, fecha_registro, observaciones)
SELECT 2, id_especie, 'F', 9, DATE '2025-02-05', 'Hembra adulta, nidifica en farallones rocosos'
FROM ESPECIE WHERE nombre_cientifico = 'Vultur gryphus' FETCH FIRST 1 ROW ONLY;

INSERT INTO ANIMAL (id_hato, id_especie, sexo, edad_anios, fecha_registro, observaciones)
SELECT 2, id_especie, 'M', 5, DATE '2025-02-12', 'Zorro andino adulto, de hábitos crepusculares'
FROM ESPECIE WHERE nombre_cientifico LIKE 'Lycalopex%culpaeus' FETCH FIRST 1 ROW ONLY;

INSERT INTO ANIMAL (id_hato, id_especie, sexo, edad_anios, fecha_registro, observaciones)
SELECT 1, id_especie, 'F', 3, DATE '2025-02-12', 'Zorrino andino, avistado cerca de zonas de pastizal'
FROM ESPECIE WHERE nombre_cientifico = 'Conepatus chinga' FETCH FIRST 1 ROW ONLY;

INSERT INTO ANIMAL (id_hato, id_especie, sexo, edad_anios, fecha_registro, observaciones)
SELECT 1, id_especie, 'U', 2, DATE '2025-02-20', 'Ave de pastizales húmedos, sexo no determinado'
FROM ESPECIE WHERE nombre_cientifico = 'Vanellus resplendens' FETCH FIRST 1 ROW ONLY;

INSERT INTO ANIMAL (id_hato, id_especie, sexo, edad_anios, fecha_registro, observaciones)
SELECT 2, id_especie, 'F', 4, DATE '2025-02-20', 'Halcón peregrino, cazador de aves de altura'
FROM ESPECIE WHERE nombre_cientifico = 'Falco peregrinus' FETCH FIRST 1 ROW ONLY;

INSERT INTO ANIMAL (id_hato, id_especie, sexo, edad_anios, fecha_registro, observaciones)
SELECT 1, id_especie, 'M', 2, DATE '2025-03-01', 'Colibrí gigante, visita arbustos floridos'
FROM ESPECIE WHERE nombre_cientifico = 'Patagona gigas' FETCH FIRST 1 ROW ONLY;

INSERT INTO ANIMAL (id_hato, id_especie, sexo, edad_anios, fecha_registro, observaciones)
SELECT 2, id_especie, 'F', 3, DATE '2025-03-01', 'Pato barcino de lagunas altoandinas'
FROM ESPECIE WHERE nombre_cientifico = 'Anas flavirostris' FETCH FIRST 1 ROW ONLY;

INSERT INTO ANIMAL (id_hato, id_especie, sexo, edad_anios, fecha_registro, observaciones)
SELECT 1, id_especie, 'M', 3, DATE '2025-03-08', 'Perdiz de la puna, de vuelo corto y camuflaje en el ichu'
FROM ESPECIE WHERE nombre_cientifico = 'Tinamotis pentlandii' FETCH FIRST 1 ROW ONLY;

INSERT INTO ANIMAL (id_hato, id_especie, sexo, edad_anios, fecha_registro, observaciones)
SELECT 2, id_especie, 'F', 5, DATE '2025-03-08', 'Hembra con cría, en el grupo familiar'
FROM ESPECIE WHERE nombre_cientifico = 'Vicugna vicugna' FETCH FIRST 1 ROW ONLY;

INSERT INTO ANIMAL (id_hato, id_especie, sexo, edad_anios, fecha_registro, observaciones)
SELECT 1, id_especie, 'F', 1, DATE '2025-03-15', 'Cría de la temporada, en buen estado de salud'
FROM ESPECIE WHERE nombre_cientifico = 'Vicugna vicugna' FETCH FIRST 1 ROW ONLY;
 

-- Datos TURISTA_ACTIVIDAD
INSERT INTO TURISTA_ACTIVIDAD (id_turista, id_actividad, fecha_participacion, estado) 
VALUES (1, 1, DATE '2025-04-15', 'confirmado'); 

INSERT INTO TURISTA_ACTIVIDAD (id_turista, id_actividad, fecha_participacion, estado) 
VALUES (2, 1, DATE '2025-04-15', 'confirmado'); 

INSERT INTO TURISTA_ACTIVIDAD (id_turista, id_actividad, fecha_participacion, estado) 
VALUES (3, 2, DATE '2025-04-20', 'pendiente'); 

-- Datos ACTIVIDAD_PERSONAL
INSERT INTO ACTIVIDAD_PERSONAL (id_personal, id_actividad, rol, fecha_asignacion) 
VALUES (1, 1, 'Coordinador General', DATE '2025-04-10'); 

INSERT INTO ACTIVIDAD_PERSONAL (id_personal, id_actividad, rol, fecha_asignacion) 
VALUES (2, 1, 'Guía Especializado', DATE '2025-04-10'); 

INSERT INTO ACTIVIDAD_PERSONAL (id_personal, id_actividad, rol, fecha_asignacion) 
VALUES (3, 2, 'Guía de Ruta', DATE '2025-04-15'); 

INSERT INTO ACTIVIDAD_PERSONAL (id_personal, id_actividad, rol, fecha_asignacion) 
VALUES (4, 3, 'Investigador Principal', DATE '2025-05-01'); 

INSERT INTO ACTIVIDAD_PERSONAL (id_personal, id_actividad, rol, fecha_asignacion) 
VALUES (5, 3, 'Asistente de Investigación', DATE '2025-05-01'); 

COMMIT;

-- CORRECCIÓN: los permisos de objeto se otorgan al final,
-- cuando ya existen las tablas, vistas y el paquete.
--------------------------------------------------------
-- SECCIÓN 5: PERMISOS DE OBJETO (GRANTS)
--------------------------------------------------------
-- Ahora que las tablas existen, asignamos permisos específicos
-- 1. Permisos al ROL_CONSULTA (Visitante/Reportes)
-- Solo pueden ver (SELECT) los datos
GRANT SELECT ON RESERVA TO rol_consulta;
GRANT SELECT ON ACTIVIDAD TO rol_consulta;
GRANT SELECT ON ESPECIE TO rol_consulta;
GRANT SELECT ON ANIMAL TO rol_consulta;
GRANT SELECT ON PERSONAL TO rol_consulta;
GRANT SELECT ON TURISTA TO rol_consulta;
-- Permiso de ejecución para la función de reporte (si existiera)

-- 2. Permisos al ROL_APLICACION (Administrador/Backend)
-- Permisos completos (CRUD) para la gestión
GRANT SELECT, INSERT, UPDATE, DELETE ON RESERVA TO rol_aplicacion;
GRANT SELECT, INSERT, UPDATE, DELETE ON TURISTA TO rol_aplicacion;
GRANT SELECT, INSERT, UPDATE, DELETE ON ACTIVIDAD TO rol_aplicacion;
GRANT SELECT, INSERT, UPDATE, DELETE ON PERSONAL TO rol_aplicacion;
GRANT SELECT, INSERT, UPDATE, DELETE ON HATO TO rol_aplicacion;
GRANT SELECT, INSERT, UPDATE, DELETE ON ESPECIE TO rol_aplicacion;
GRANT SELECT, INSERT, UPDATE, DELETE ON ANIMAL TO rol_aplicacion;
GRANT SELECT, INSERT, UPDATE, DELETE ON TURISTA_ACTIVIDAD TO rol_aplicacion;
GRANT SELECT, INSERT, UPDATE, DELETE ON AUDITORIA_ANIMAL TO rol_aplicacion;
-- Permiso de ejecución de la lógica de negocio

-- 3. Permisos al ROL_ADMINISTRADOR
-- Rol de administración del sistema (creación de usuarios, etc. - DCL)
-- Estos permisos se otorgan a nivel de sistema, no de objeto.

-- 4. Permisos al ROL_PERSONAL (Personal de Campo/Guardaparques)
-- Pueden ver todas las tablas de referencia y gestionar la información que les compete.
-- (Ej: Registrar avistamientos de animales)

-- A. Permisos de CONSULTA (SELECT) en tablas generales
GRANT SELECT ON RESERVA TO rol_personal;
GRANT SELECT ON ACTIVIDAD TO rol_personal;
GRANT SELECT ON TURISTA TO rol_personal;
GRANT SELECT ON ESPECIE TO rol_personal;

-- B. Permisos de GESTIÓN (CRUD) en sus propias tablas de trabajo
-- El personal puede gestionar su propia información y la de los animales que vigila.
GRANT SELECT, INSERT, UPDATE ON PERSONAL TO rol_personal;
GRANT SELECT, INSERT, UPDATE, DELETE ON ANIMAL TO rol_personal;
GRANT SELECT, INSERT, UPDATE, DELETE ON HATO TO rol_personal;
GRANT INSERT ON AUDITORIA_ANIMAL TO rol_personal; -- Solo insertar registros de auditoría

-- C. Permiso de ejecución de la lógica de negocio

-- 5. Otorgar acceso a las VISTAS
GRANT SELECT ON vw_animales_por_reserva TO rol_consulta, rol_aplicacion, rol_personal;
GRANT SELECT ON vw_resumen_actividades TO rol_consulta, rol_aplicacion, rol_personal;
GRANT SELECT ON vw_especies_conservacion TO rol_consulta, rol_aplicacion, rol_personal;


--------------------------------------------------------
-- SECCIÓN 8: RESERVAS DE VISITA (CORE DEL NEGOCIO)
-- Cada actividad tiene 3 horarios por día (08:00, 11:00 y 14:00),
-- cada uno con su propio cupo. La reserva se hace sobre un horario.
-- La transacción (crear / confirmar / cancelar) la ejecuta el backend con SQL.
--------------------------------------------------------
ALTER SESSION SET CURRENT_SCHEMA = admin_rnpg;

BEGIN
    EXECUTE IMMEDIATE 'DROP TABLE AUDITORIA_RESERVA PURGE';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF;
END;
/
BEGIN
    EXECUTE IMMEDIATE 'DROP TABLE RESERVA_VISITA PURGE';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF;
END;
/
BEGIN
    EXECUTE IMMEDIATE 'DROP TABLE HORARIO_ACTIVIDAD PURGE';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF;
END;
/

-- 8.1 Horarios de cada actividad (solo 3 permitidos por día)
CREATE TABLE HORARIO_ACTIVIDAD (
    id_horario    NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY PRIMARY KEY,
    id_actividad  NUMBER NOT NULL,
    hora_inicio   VARCHAR2(5) NOT NULL,
    cupo_maximo   NUMBER(4) DEFAULT 10 NOT NULL,
    CONSTRAINT chk_horario_hora   CHECK (hora_inicio IN ('08:00','11:00','14:00')),
    CONSTRAINT chk_horario_cupo   CHECK (cupo_maximo > 0),
    CONSTRAINT uq_horario_actividad UNIQUE (id_actividad, hora_inicio),
    CONSTRAINT fk_horario_actividad FOREIGN KEY (id_actividad)
        REFERENCES ACTIVIDAD(id_actividad) ON DELETE CASCADE
);

-- 8.2 Reservas de visita (el turista reserva un horario de una actividad)
CREATE TABLE RESERVA_VISITA (
    id_reserva_visita   NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY PRIMARY KEY,
    id_reserva          NUMBER NOT NULL,
    id_turista          NUMBER NOT NULL,
    id_horario          NUMBER NOT NULL,
    num_personas        NUMBER(3) NOT NULL CHECK (num_personas > 0),
    monto_total         NUMBER(10,2) NOT NULL CHECK (monto_total >= 0),
    estado              VARCHAR2(15) DEFAULT 'PENDIENTE' NOT NULL,
    fecha_creacion      TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    fecha_confirmacion  TIMESTAMP,
    fecha_cancelacion   TIMESTAMP,
    motivo_cancelacion  VARCHAR2(300),
    CONSTRAINT chk_rv_estado CHECK (estado IN ('PENDIENTE','CONFIRMADA','CANCELADA')),
    CONSTRAINT fk_rv_reserva FOREIGN KEY (id_reserva) REFERENCES RESERVA(id_reserva),
    CONSTRAINT fk_rv_turista FOREIGN KEY (id_turista) REFERENCES TURISTA(id_turista),
    CONSTRAINT fk_rv_horario FOREIGN KEY (id_horario) REFERENCES HORARIO_ACTIVIDAD(id_horario)
);

CREATE INDEX idx_rv_horario_estado ON RESERVA_VISITA(id_horario, estado);
CREATE INDEX idx_rv_turista ON RESERVA_VISITA(id_turista);

-- Un turista no puede tener dos reservas activas en el mismo horario
-- (la regla la exige Oracle, aunque se inserte desde SQL Developer)
CREATE UNIQUE INDEX uq_rv_turista_horario_activa ON RESERVA_VISITA (
    CASE WHEN estado IN ('PENDIENTE','CONFIRMADA') THEN id_turista END,
    CASE WHEN estado IN ('PENDIENTE','CONFIRMADA') THEN id_horario END
);

-- 8.3 Auditoria de cambios de estado
CREATE TABLE AUDITORIA_RESERVA (
    id_auditoria        NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY PRIMARY KEY,
    id_reserva_visita   NUMBER NOT NULL,
    operacion           VARCHAR2(20) NOT NULL,
    estado_anterior     VARCHAR2(15),
    estado_nuevo        VARCHAR2(15),
    usuario             VARCHAR2(50) DEFAULT SYS_CONTEXT('USERENV','SESSION_USER'),
    fecha               TIMESTAMP DEFAULT SYSTIMESTAMP
);

-- 8.4 Fechas de demostración: las actividades originales estaban en 2025;
-- el sistema solo acepta reservas para fechas futuras.
UPDATE ACTIVIDAD SET fecha_realizacion = TRUNC(SYSDATE) + 7  WHERE nombre = 'Avistamiento de Vicuñas';
UPDATE ACTIVIDAD SET fecha_realizacion = TRUNC(SYSDATE) + 14 WHERE nombre = 'Caminata Ecológica';
UPDATE ACTIVIDAD SET fecha_realizacion = TRUNC(SYSDATE) + 21 WHERE nombre = 'Chaccu Tradicional';

-- 8.5 Los 3 horarios de cada actividad existente, con 10 cupos cada uno
INSERT INTO HORARIO_ACTIVIDAD (id_actividad, hora_inicio, cupo_maximo)
SELECT a.id_actividad, h.hora, 10
FROM ACTIVIDAD a
CROSS JOIN (SELECT '08:00' AS hora FROM dual
            UNION ALL SELECT '11:00' FROM dual
            UNION ALL SELECT '14:00' FROM dual) h;
COMMIT;

-- 8.6 Vista de consulta (une 5 tablas)
CREATE OR REPLACE VIEW vw_reservas_visita AS
SELECT rv.id_reserva_visita,
       r.nombre                         AS reserva_natural,
       t.id_turista,
       t.nombre || ' ' || t.apellido    AS turista,
       t.dni,
       a.id_actividad,
       a.nombre                         AS actividad,
       a.fecha_realizacion,
       h.id_horario,
       h.hora_inicio,
       rv.num_personas,
       a.costo_soles                    AS costo_unitario,
       rv.monto_total,
       rv.estado,
       rv.fecha_creacion,
       rv.fecha_confirmacion,
       rv.fecha_cancelacion
FROM RESERVA_VISITA rv
JOIN RESERVA            r ON r.id_reserva   = rv.id_reserva
JOIN TURISTA            t ON t.id_turista   = rv.id_turista
JOIN HORARIO_ACTIVIDAD  h ON h.id_horario   = rv.id_horario
JOIN ACTIVIDAD          a ON a.id_actividad = h.id_actividad;

-- 8.7 Permisos
GRANT SELECT, INSERT, UPDATE ON RESERVA_VISITA TO rol_aplicacion;
GRANT SELECT, INSERT, UPDATE ON HORARIO_ACTIVIDAD TO rol_aplicacion;
GRANT SELECT, INSERT ON AUDITORIA_RESERVA TO rol_aplicacion;
GRANT SELECT ON vw_reservas_visita TO rol_aplicacion, rol_consulta, rol_personal;
GRANT SELECT ON RESERVA_VISITA TO rol_consulta;
GRANT SELECT ON HORARIO_ACTIVIDAD TO rol_consulta;

--------------------------------------------------------
-- SECCIÓN 9: VERIFICACIÓN
--------------------------------------------------------
SELECT object_type, COUNT(*) AS total, SUM(CASE WHEN status = 'INVALID' THEN 1 ELSE 0 END) AS invalidos
FROM dba_objects
WHERE owner = 'ADMIN_RNPG'
GROUP BY object_type
ORDER BY object_type;

SELECT 'RESERVA' AS tabla, COUNT(*) AS filas FROM admin_rnpg.RESERVA UNION ALL
SELECT 'ESPECIE',   COUNT(*) FROM admin_rnpg.ESPECIE   UNION ALL
SELECT 'HATO',      COUNT(*) FROM admin_rnpg.HATO      UNION ALL
SELECT 'ANIMAL',    COUNT(*) FROM admin_rnpg.ANIMAL    UNION ALL
SELECT 'ACTIVIDAD', COUNT(*) FROM admin_rnpg.ACTIVIDAD UNION ALL
SELECT 'TURISTA',   COUNT(*) FROM admin_rnpg.TURISTA   UNION ALL
SELECT 'PERSONAL',  COUNT(*) FROM admin_rnpg.PERSONAL;

SELECT * FROM ANIMAL;

SELECT USER FROM dual;
SELECT COUNT(*) FROM admin_rnpg.HATO;
SELECT COUNT(*) FROM admin_rnpg.ANIMAL;
SELECT id_reserva, nombre FROM admin_rnpg.RESERVA;