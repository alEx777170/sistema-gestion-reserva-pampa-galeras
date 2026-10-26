const oracledb = require('oracledb');
require('dotenv').config();

const cfg = {
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING
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
