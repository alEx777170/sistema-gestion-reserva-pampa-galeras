/**
 * setup_adb.js - Despliega el esquema completo en Oracle Autonomous Database (ADB)
 *
 * Uso:  node setup_adb.js
 *
 * Qué hace:
 *  1. Conecta como ADMIN (credenciales de la ADB) y (re)crea los usuarios:
 *     admin_rnpg (dueño del esquema), app_rnpg, reportes_rnpg, personal_sernanp.
 *  2. Transforma proyecto_completo.sql -> proyecto_adb.sql quitando lo que ADB
 *     no permite (CONTAINER, ROLES, PROFILES, GRANT ANY TABLE, ALTER SYSTEM).
 *  3. Ejecuta el SQL adaptado como admin_rnpg: tablas, vistas, índices y datos.
 *  4. Otorga los permisos de objeto directamente a los usuarios (sin roles).
 *  5. Verifica la carga con conteos.
 *
 * Variables de entorno requeridas (en backend/.env):
 *  ORACLE_ADMIN_USER, ORACLE_ADMIN_PASSWORD  (usuario ADMIN de la ADB)
 *  ORACLE_CONNECT_STRING                     (alias TNS, p.ej. xdj14bpg9jq95hgc_high)
 *  TNS_ADMIN                                 (carpeta del wallet)
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const oracledb = require('oracledb');

// Mismo mecanismo de wallet que usa src/db.js
process.env.TNS_ADMIN = process.env.TNS_ADMIN || path.join(__dirname, 'wallet');

const ADMIN_USER = process.env.ORACLE_ADMIN_USER || 'ADMIN';
const ADMIN_PASS = process.env.ORACLE_ADMIN_PASSWORD;
const APP_USER = process.env.ORACLE_USER || 'admin_rnpg';
const APP_PASS = process.env.ORACLE_PASSWORD || 'AdminRNPG_2025*';
const CONNECT = process.env.ORACLE_CONNECT_STRING;

// Usuarios secundarios del guion original (curso), con sus contraseñas
const OTROS_USUARIOS = [
  ['app_rnpg', 'AppRNPG_2025*'],
  ['reportes_rnpg', 'ReportesRNPG_2025*'],
  ['personal_sernanp', 'PersonalSERNANP_2025*']
];

if (!ADMIN_PASS) {
  console.error('Falta ORACLE_ADMIN_PASSWORD en backend/.env (contraseña del ADMIN de la ADB).');
  process.exit(1);
}

const OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };

async function conn(user, pass) {
  return oracledb.getConnection({ user, password: pass, connectString: CONNECT });
}

async function run(c, sql, label) {
  try {
    await c.execute(sql);
    return true;
  } catch (err) {
    // Errores tolerados en re-ejecuciones (objeto/usuario ya existe, etc.)
    const tolerados = [
      /ORA-01920/i,  // user name already exists (grants conflict)
      /ORA-01918/i,  // user does not exist (en drops)
      /ORA-01430/i,  // column being added already exists
      /ORA-00955/i,  // name already used by an existing object
      /ORA-02264/i,  // name already used by an existing constraint
      /ORA-00942/i,  // table or view does not exist (en drops/grants previos)
      /ORA-01418/i,  // index does not exist
      /ORA-04081/i,  // trigger already exists
      /ORA-00957/i,  // column already has a primary key
      /ORA-02275/i,  // such a referential constraint already exists
      /ORA-02261/i,  // such unique or primary key already exists
      /ORA-02270/i,  // no matching unique or primary key
      /ORA-02299/i   // cannot validate (found duplicate keys) - solo si datos previos
    ];
    if (tolerados.some(re => re.test(err.message))) {
      console.warn(`   ~ omitido (${label}): ${err.message.split('\n')[0]}`);
      return true;
    }
    console.error(`   ✗ ERROR en ${label}: ${err.message}`);
    return false;
  }
}

async function runMany(c, sqlText) {
  // Divide el script en sentencias por ';' (ninguna sentencia de este guion
  // contiene ';' dentro de comillas) y las ejecuta en orden.
  const sentencias = sqlText
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !/^--/.test(s.replace(/^(--[^\n]*\n\s*)+/, '')));
  let ok = 0, fail = 0;
  for (const s of sentencias) {
    // Ignorar bloques que son solo comentarios
    const limpio = s.replace(/--[^\n]*/g, '').trim();
    if (!limpio) continue;
    const r = await run(c, s, limpio.slice(0, 60).replace(/\s+/g, ' '));
    if (r) ok++; else fail++;
  }
  return { ok, fail };
}

async function main() {
  console.log('=== Despliegue en Oracle Autonomous Database (ADB) ===');
  console.log(`Conexión: ${CONNECT}`);
  console.log(`ADMIN: ${ADMIN_USER} | Esquema de la app: ${APP_USER}\n`);

  // ---------------------------------------------------------------
  // PASO 1: como ADMIN, (re)crear los usuarios
  // ---------------------------------------------------------------
  console.log('[1/5] Conectando como ADMIN...');
  let cAdmin;
  try {
    cAdmin = await conn(ADMIN_USER, ADMIN_PASS);
  } catch (err) {
    console.error('\n✗ No se pudo conectar como ADMIN.');
    console.error('  Verifica la contraseña del ADMIN de la ADB y que el wallet sea el correcto.');
    console.error(`  Detalle: ${err.message}`);
    process.exit(1);
  }
  console.log('   ✓ Conectado a la ADB como ADMIN\n');

  console.log('[2/5] Creando/limpiando usuarios...');
  // Limpiar en orden inverso a las dependencias (por si hubo grants previos)
  for (const [u] of [...OTROS_USUARIOS].reverse()) {
    await run(cAdmin, `DROP USER ${u} CASCADE`, `drop ${u}`);
  }
  await run(cAdmin, `DROP USER ${APP_USER} CASCADE`, `drop ${APP_USER}`);

  await run(cAdmin,
    `CREATE USER ${APP_USER} IDENTIFIED BY "${APP_PASS}"`,
    `create ${APP_USER}`);
  await run(cAdmin,
    `GRANT CREATE SESSION, CREATE TABLE, CREATE VIEW, CREATE SEQUENCE TO ${APP_USER}`,
    `grants sistema ${APP_USER}`);
  await run(cAdmin, `GRANT UNLIMITED TABLESPACE TO ${APP_USER}`, `tablespace ${APP_USER}`);

  for (const [u, p] of OTROS_USUARIOS) {
    await run(cAdmin, `CREATE USER ${u} IDENTIFIED BY "${p}"`, `create ${u}`);
    await run(cAdmin, `GRANT CREATE SESSION TO ${u}`, `grants ${u}`);
  }
  console.log(`   ✓ Usuarios listos: ${APP_USER}, ${OTROS_USUARIOS.map(u => u[0]).join(', ')}\n`);
  await cAdmin.close();

  // ---------------------------------------------------------------
  // PASO 2: transformar proyecto_completo.sql -> SQL para ADB
  // ---------------------------------------------------------------
  console.log('[3/5] Generando proyecto_adb.sql (adaptado para ADB)...');
  const original = fs.readFileSync(path.join(__dirname, '..', 'proyecto_completo.sql'), 'utf8');

  const lineas = original.split(/\r?\n/);
  const salida = [];
  // Patrones que ADB no permite o que no aplican (la creación de usuarios ya se hizo arriba)
  const quitar = [
    /^\s*ALTER\s+SESSION\s+SET\s+CONTAINER/i,
    /^\s*ALTER\s+SYSTEM/i,
    /^\s*(CREATE|DROP)\s+PROFILE/i,
    /^\s*(CREATE|DROP)\s+ROLE/i,
    /^\s*DROP\s+USER/i,
    /^\s*CREATE\s+USER/i,
    /^\s*GRANT\s+(CREATE|ALTER|DROP)\s+[A-Z,\s]+TO\s+rol_/i,
    /^\s*GRANT\s+(SELECT|INSERT|UPDATE)\s+ANY\s+TABLE/i,
    /^\s*GRANT\s+rol_/i,
    /^\s*GRANT\s+ALTER\s+USER/i,
    /^\s*GRANT\s+DROP\s+USER/i,
    /^\s*WHENEVER\s+SQLERROR/i,
    /^\s*SELECT\s+object_type/i,          // verificación dba_objects (no accesible)
    /^\s*SELECT\s+'RESERVA'\s+AS\s+tabla/i,
    /^\s*SELECT\s+\*\s+FROM\s+ANIMAL;/i,
    /^\s*SELECT\s+USER\s+FROM\s+dual;/i,
    /^\s*SELECT\s+COUNT\(\*\)\s+FROM\s+admin_rnpg/i,
    /^\s*SELECT\s+id_reserva,\s+nombre\s+FROM\s+admin_rnpg/i,
    /^\s*GRANT\s+SELECT\s+ON\s+vw_/i     // se re-hacen al final con usuarios reales
  ];
  let enBlancoSeguidas = 0;
  for (const linea of lineas) {
    if (quitar.some(re => re.test(linea))) continue;
    // Colapsar líneas en blanco repetidas
    if (/^\s*$/.test(linea)) {
      enBlancoSeguidas++;
      if (enBlancoSeguidas > 1) continue;
    } else {
      enBlancoSeguidas = 0;
    }
    salida.push(linea);
  }

  // Quitar los grants que usan roles sobre tablas/vistas (líneas sueltas GRANT ... TO rol_*)
  const sqlLimpio = salida
    .join('\n')
    .replace(/^\s*GRANT\s+SELECT[^;]*TO\s+rol_[^;]*;.*$/gim, '')
    .replace(/^\s*GRANT\s+SELECT,\s*INSERT[^;]*TO\s+rol_[^;]*;.*$/gim, '')
    .replace(/^\s*GRANT\s+INSERT[^;]*TO\s+rol_[^;]*;.*$/gim, '')
    .replace(/ALTER\s+SESSION\s+SET\s+CURRENT_SCHEMA[^;]*;/gi, '')
    .replace(/ALTER\s+SESSION\s+SET\s+CONTAINER[^;]*;/gi, '');

  // Agregar al final los permisos de objeto para los usuarios reales de ADB
  const grants = `
--------------------------------------------------------
-- PERMISOS DE OBJETO (ADB: directos a usuarios, sin roles)
-- Otorgados por ${APP_USER} (dueño de los objetos)
--------------------------------------------------------
-- app_rnpg: CRUD completo sobre las tablas de gestión
GRANT SELECT, INSERT, UPDATE, DELETE ON RESERVA TO app_rnpg;
GRANT SELECT, INSERT, UPDATE, DELETE ON TURISTA TO app_rnpg;
GRANT SELECT, INSERT, UPDATE, DELETE ON ACTIVIDAD TO app_rnpg;
GRANT SELECT, INSERT, UPDATE, DELETE ON PERSONAL TO app_rnpg;
GRANT SELECT, INSERT, UPDATE, DELETE ON HATO TO app_rnpg;
GRANT SELECT, INSERT, UPDATE, DELETE ON ESPECIE TO app_rnpg;
GRANT SELECT, INSERT, UPDATE, DELETE ON ANIMAL TO app_rnpg;
GRANT SELECT, INSERT, UPDATE, DELETE ON TURISTA_ACTIVIDAD TO app_rnpg;
GRANT SELECT, INSERT, UPDATE, DELETE ON AUDITORIA_ANIMAL TO app_rnpg;
GRANT SELECT, INSERT, UPDATE ON RESERVA_VISITA TO app_rnpg;
GRANT SELECT, INSERT, UPDATE ON HORARIO_ACTIVIDAD TO app_rnpg;
GRANT SELECT, INSERT ON AUDITORIA_RESERVA TO app_rnpg;

-- reportes_rnpg: solo consulta
GRANT SELECT ON RESERVA TO reportes_rnpg;
GRANT SELECT ON ACTIVIDAD TO reportes_rnpg;
GRANT SELECT ON ESPECIE TO reportes_rnpg;
GRANT SELECT ON ANIMAL TO reportes_rnpg;
GRANT SELECT ON PERSONAL TO reportes_rnpg;
GRANT SELECT ON TURISTA TO reportes_rnpg;
GRANT SELECT ON RESERVA_VISITA TO reportes_rnpg;
GRANT SELECT ON HORARIO_ACTIVIDAD TO reportes_rnpg;

-- personal_sernanp: consulta general + CRUD en animales, hatos y auditoría
GRANT SELECT ON RESERVA TO personal_sernanp;
GRANT SELECT ON ACTIVIDAD TO personal_sernanp;
GRANT SELECT ON TURISTA TO personal_sernanp;
GRANT SELECT ON ESPECIE TO personal_sernanp;
GRANT SELECT, INSERT, UPDATE ON PERSONAL TO personal_sernanp;
GRANT SELECT, INSERT, UPDATE, DELETE ON ANIMAL TO personal_sernanp;
GRANT SELECT, INSERT, UPDATE, DELETE ON HATO TO personal_sernanp;
GRANT INSERT ON AUDITORIA_ANIMAL TO personal_sernanp;

-- Vistas para todos los usuarios
GRANT SELECT ON vw_animales_por_reserva TO app_rnpg, reportes_rnpg, personal_sernanp;
GRANT SELECT ON vw_especies_conservacion TO app_rnpg, reportes_rnpg, personal_sernanp;
GRANT SELECT ON vw_ocupacion_horario TO app_rnpg, reportes_rnpg, personal_sernanp;
GRANT SELECT ON vw_reservas_visita TO app_rnpg, reportes_rnpg, personal_sernanp;
GRANT SELECT ON vw_resumen_actividades TO app_rnpg, reportes_rnpg, personal_sernanp;

COMMIT;
`;

  const sqlFinal = sqlLimpio + '\n' + grants;
  const destino = path.join(__dirname, '..', 'proyecto_adb.sql');
  fs.writeFileSync(destino, sqlFinal, 'utf8');
  console.log(`   ✓ Escrito: ${destino}\n`);

  // ---------------------------------------------------------------
  // PASO 3: ejecutar el SQL como admin_rnpg
  // ---------------------------------------------------------------
  console.log(`[4/5] Conectando como ${APP_USER} y creando esquema + datos...`);
  const cApp = await conn(APP_USER, APP_PASS);
  const r = await runMany(cApp, sqlFinal);
  console.log(`   ✓ Sentencias ejecutadas: ${r.ok} correctas, ${r.fail} con error\n`);

  // ---------------------------------------------------------------
  // PASO 4: verificar
  // ---------------------------------------------------------------
  console.log('[5/5] Verificación de datos:');
  const verif = await cApp.execute(
    `SELECT 'RESERVA' AS tabla, COUNT(*) AS filas FROM RESERVA UNION ALL
     SELECT 'ESPECIE',   COUNT(*) FROM ESPECIE   UNION ALL
     SELECT 'HATO',      COUNT(*) FROM HATO      UNION ALL
     SELECT 'ANIMAL',    COUNT(*) FROM ANIMAL    UNION ALL
     SELECT 'ACTIVIDAD', COUNT(*) FROM ACTIVIDAD UNION ALL
     SELECT 'HORARIO_ACTIVIDAD', COUNT(*) FROM HORARIO_ACTIVIDAD UNION ALL
     SELECT 'TURISTA',   COUNT(*) FROM TURISTA   UNION ALL
     SELECT 'PERSONAL',  COUNT(*) FROM PERSONAL  UNION ALL
     SELECT 'TURISTA_ACTIVIDAD', COUNT(*) FROM TURISTA_ACTIVIDAD UNION ALL
     SELECT 'ACTIVIDAD_PERSONAL', COUNT(*) FROM ACTIVIDAD_PERSONAL`,
    [], OBJ);
  for (const f of verif.rows) {
    console.log(`   ${String(f.TABLA).padEnd(22)} ${f.FILAS} filas`);
  }

  await cApp.close();
  console.log('\n✓ Despliegue completado. El backend ya puede conectarse con ORACLE_USER=' + APP_USER);
}

main().catch(err => {
  console.error('\n✗ Error fatal:', err.message);
  process.exit(1);
});
