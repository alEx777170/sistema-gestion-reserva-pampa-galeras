// test_adb.js - diagnóstico de conectividad con la ADB
// Prueba el alias configurado en .env (ORACLE_CONNECT_STRING) y los demás
// aliases de servicio del mismo wallet.
const path = require('path');
process.env.TNS_ADMIN = path.join(__dirname, 'wallet');
require('dotenv').config();
const oracledb = require('oracledb');

const fs = require('fs');
const tns = fs.readFileSync(path.join(__dirname, 'wallet', 'tnsnames.ora'), 'utf8');
const aliases = [...tns.matchAll(/^(\w+)\s*=/gm)].map(m => m[1]);

(async () => {
  for (const a of aliases) {
    try {
      const c = await oracledb.getConnection({
        user: process.env.ORACLE_ADMIN_USER,
        password: process.env.ORACLE_ADMIN_PASSWORD,
        connectString: a
      });
      const r = await c.execute("SELECT USER, SYS_CONTEXT('USERENV','CON_NAME') AS pdb FROM dual",
        [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      console.log(`OK ${a}: conectado como ${r.rows[0].USER} en ${r.rows[0].PDB}`);
      await c.close();
      return;
    } catch (err) {
      console.log(`FALLA ${a}: ${err.message.split('\n')[0]}`);
    }
  }
  console.log('\nNinguna ADB accesible.');
})();
