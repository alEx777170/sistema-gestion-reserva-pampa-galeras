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

module.exports = { getConnection };
