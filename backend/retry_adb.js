// retry_adb.js - reintenta conectar cada 20s (por defecto 60 min)
// Uso: node retry_adb.js [minutos]
const path = require('path');
process.env.TNS_ADMIN = path.join(__dirname, 'wallet');
require('dotenv').config();
const oracledb = require('oracledb');

const MINUTOS = parseInt(process.argv[2] || '60', 10);
const HASTA = Date.now() + MINUTOS * 60 * 1000;
let intento = 0;

(async () => {
  while (Date.now() < HASTA) {
    intento++;
    try {
      const c = await oracledb.getConnection({
        user: process.env.ORACLE_ADMIN_USER,
        password: process.env.ORACLE_ADMIN_PASSWORD,
        connectString: process.env.ORACLE_CONNECT_STRING
      });
      const r = await c.execute("SELECT USER, SYS_CONTEXT('USERENV','CON_NAME') AS pdb FROM dual",
        [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      console.log(`EXITO intento ${intento}: conectado como ${r.rows[0].USER} en ${r.rows[0].PDB}`);
      await c.close();
      return;
    } catch (err) {
      console.log(`intento ${intento}: ${err.message.split('\n')[0]}`);
    }
    await new Promise(r => setTimeout(r, 20000));
  }
  console.log(`AGOTADO: ${MINUTOS} minutos sin conectar.`);
})();
