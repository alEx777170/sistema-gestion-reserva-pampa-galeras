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

async function getConnection() {
  if (!cfg.user || !cfg.password || !cfg.connectString) {
    throw new Error('Oracle connection not configured. Set ORACLE_USER, ORACLE_PASSWORD, ORACLE_CONNECT_STRING in environment.');
  }
  return await oracledb.getConnection(cfg);
}

// Fecha y hora actual de Perú, sin depender de la zona horaria del servidor Oracle
// (SYSDATE usa la hora del sistema operativo del servidor, que suele estar en UTC).
const AHORA_LIMA = `CAST(SYSTIMESTAMP AT TIME ZONE 'America/Lima' AS DATE)`;
const HOY_LIMA = `TRUNC(${AHORA_LIMA})`;

module.exports = { getConnection, AHORA_LIMA, HOY_LIMA };
