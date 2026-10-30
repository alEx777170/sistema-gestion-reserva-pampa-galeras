// test_thick.js - conexión en modo THICK (Instant Client) con node-oracledb
// El modo thin da ORA-12506; el thick usa cwallet.sso (auto-login, sin contraseña).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Instant Client local + wallet del backend (sqlnet.ora apunta a esa carpeta)
const IC = process.env.ORACLE_IC_HOME || 'C:\\Users\\ALEX\\oracle\\instantclient_23_0';
process.env.TNS_ADMIN = path.join(__dirname, 'wallet');

const oracledb = require('oracledb');

(async () => {
  try {
    oracledb.initOracleClient({ libDir: IC });
    console.log('initOracleClient: OK (modo thick)');
  } catch (err) {
    console.log(`initOracleClient FALLÓ: ${err.message.split('\n')[0]}`);
    return;
  }

  try {
    const c = await oracledb.getConnection({
      user: process.env.ORACLE_ADMIN_USER,
      password: process.env.ORACLE_ADMIN_PASSWORD,
      connectString: process.env.ORACLE_CONNECT_STRING
    });
    const r = await c.execute(
      "SELECT USER, SYS_CONTEXT('USERENV','CON_NAME') AS pdb FROM dual",
      [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    console.log(`THICK OK: conectado como ${r.rows[0].USER} en ${r.rows[0].PDB}`);
    await c.close();
  } catch (err) {
    console.log(`THICK FALLA: ${err.message}`);
  }
})();
