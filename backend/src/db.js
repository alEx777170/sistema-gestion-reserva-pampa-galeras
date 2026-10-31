const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config();

// Wallet de Oracle Autonomous Database (ADB)
// node-oracledb (modo thin) localiza el wallet (tnsnames.ora, cwallet.sso) a través
// de la variable de entorno TNS_ADMIN. Se fija aquí para que funcione tanto con
// `npm run dev` como con `npm start`, sin depender del shell.
const tnsAdmin = process.env.TNS_ADMIN || path.join(__dirname, '../wallet');
process.env.TNS_ADMIN = tnsAdmin;

// Modo thick (Instant Client): requerido para conectar a la ADB (ver src/init.js)
const { initOracle } = require('./init');
initOracle();

const cfg = {
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING // alias TNS, p.ej. xdj14bpg9jq95hgc_high
};

// Pool de conexiones: abrir una conexión nueva a la ADB tarda ~1.5 s por petición.
// Con el pool, conn.close() devuelve la conexión al pool (las rutas no cambian).
// Se crea en la primera petición; la promesa se comparte para no crear dos pools.
let poolPromise = null;

function getPool() {
  if (!cfg.user || !cfg.password || !cfg.connectString) {
    return Promise.reject(new Error('Oracle connection not configured. Set ORACLE_USER, ORACLE_PASSWORD, ORACLE_CONNECT_STRING in environment.'));
  }
  if (!poolPromise) {
    poolPromise = oracledb.createPool({
      ...cfg,
      poolMin: 1,
      poolMax: Number(process.env.DB_POOL_MAX) || 5,
      poolIncrement: 1,
      poolPingInterval: 60, // descarta conexiones que la ADB cerró por inactividad
      queueTimeout: 20000   // si el pool está lleno, falla en 20 s en vez de colgarse
    }).catch(err => { poolPromise = null; throw err; }); // reintenta en la siguiente petición
  }
  return poolPromise;
}

async function getConnection() {
  return (await getPool()).getConnection();
}

async function closePool() {
  if (!poolPromise) return;
  try { await (await poolPromise).close(10); } catch (e) { /* ya cerrado o nunca abrió */ }
}

// Fecha y hora actual de Perú, sin depender de la zona horaria del servidor Oracle
// (SYSDATE usa la hora del sistema operativo del servidor, que suele estar en UTC).
const AHORA_LIMA = `CAST(SYSTIMESTAMP AT TIME ZONE 'America/Lima' AS DATE)`;
const HOY_LIMA = `TRUNC(${AHORA_LIMA})`;

module.exports = { getConnection, closePool, AHORA_LIMA, HOY_LIMA };
