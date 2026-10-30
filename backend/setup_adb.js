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

// Modo thick (Instant Client): la ADB solo acepta este modo (ver src/init.js)
const { initOracle } = require('./src/init');
initOracle();

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

/**
 * Divide un script SQL en sentencias completas.
 * Respeta los ';' que aparecen dentro de:
 *   - cadenas '...' e identificadores "..." (con '' / "" escapados)
 *   - comentarios de línea --  y de bloque /* ... *\/
 * (El split(';') simple cortaba los comentarios "todo los días; la fecha..."
 *  y las descripciones que contienen ';', generando ORA-00900 / ORA-01756.)
 */
function dividirSentencias(sql) {
  const out = [];
  let buf = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const dos = sql.substr(i, 2);
    if (dos === '--') {                       // comentario hasta fin de línea
      let fin = sql.indexOf('\n', i);
      if (fin === -1) fin = n;
      buf += sql.slice(i, fin);
      i = fin;
      continue;
    }
    if (dos === '/*') {                       // comentario de bloque
      let fin = sql.indexOf('*/', i + 2);
      fin = fin === -1 ? n : fin + 2;
      buf += sql.slice(i, fin);
      i = fin;
      continue;
    }
    const ch = sql[i];
    if (ch === "'" || ch === '"') {           // cadena / identificador entre comillas
      let j = i + 1;
      while (j < n) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) { j += 2; continue; } // '' o "" escapado
          j++;
          break;
        }
        j++;
      }
      buf += sql.slice(i, j);
      i = j;
      continue;
    }
    if (ch === ';') {
      out.push(buf);
      buf = '';
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

/** Quita comentarios y colapsa espacios (para analizar/etiquetar la sentencia). */
function limpiarComentarios(s) {
  return s
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function runMany(c, sqlText) {
  const sentencias = dividirSentencias(sqlText);
  let ok = 0, fail = 0;
  for (const s of sentencias) {
    const limpio = limpiarComentarios(s);
    if (!limpio) continue; // sentencia que era solo comentario
    const r = await run(c, s.trim(), limpio.slice(0, 60));
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

  // Se analiza cada sentencia COMPLETA (no cada línea): así un CREATE USER
  // multilínea se elimina entero y no queda su suelto "DEFAULT TABLESPACE...".
  const sentenciasOriginales = dividirSentencias(original);

  // Sentencias que ADB no permite o que este script ya hace por su cuenta
  // (usuarios, roles, perfiles y permisos: creados arriba como ADMIN).
  const quitar = [
    /^ALTER\s+SESSION\s+SET\s+CONTAINER/i,
    /^ALTER\s+SESSION\s+SET\s+CURRENT_SCHEMA/i,
    /^ALTER\s+SYSTEM/i,
    /^(CREATE|DROP|ALTER)\s+PROFILE/i,
    /^(CREATE|DROP|ALTER)\s+ROLE/i,
    /^(CREATE|DROP|ALTER)\s+USER/i,
    /^DROP\s+USER/i,
    /^GRANT\s+/i,                          // permisos: ADMIN (sistema) + dueño (objetos)
    /^WHENEVER\s+SQLERROR/i,
    /^SELECT\s+object_type/i,              // verificación con DBA_OBJECTS (no disponible en ADB)
    /^SELECT\s+'RESERVA'\s+AS\s+tabla/i,
    /^SELECT\s+\*\s+FROM\s+ANIMAL\b/i,
    /^SELECT\s+USER\s+FROM\s+dual/i,
    /^SELECT\s+COUNT\(\*\)\s+FROM\s+admin_rnpg/i,
    /^SELECT\s+id_reserva,\s+nombre\s+FROM\s+admin_rnpg/i
  ];

  const conservadas = [];
  for (const sent of sentenciasOriginales) {
    const limpio = limpiarComentarios(sent);
    if (!limpio) continue;                                  // solo comentarios
    if (quitar.some(re => re.test(limpio))) continue;
    conservadas.push(sent.trim());
  }
  // ';' final: sin él, el bloque de permisos que se añade abajo se pegaría
  // a la última sentencia (la vista vw_resumen_actividades) y Oracle daría ORA-03048.
  const sqlLimpio = conservadas.join(';\n') + ';';

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
