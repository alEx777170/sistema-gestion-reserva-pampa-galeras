const path = require('path');
process.env.TNS_ADMIN = path.join(__dirname, 'wallet');
require('dotenv').config();
const oracledb = require('oracledb');

const aliases = [
  'xdj14bpg9jq95hgc_high',
  'xdj14bpg9jq95hgc_medium',
  'xdj14bpg9jq95hgc_low',
  'xdj14bpg9jq95hgc_tpurgent'
];

(async () => {
  for (const a of aliases) {
    try {
      const c = await oracledb.getConnection({
        user: process.env.ORACLE_ADMIN_USER,
        password: process.env.ORACLE_ADMIN_PASSWORD,
        connectString: a
      });
      const r = await c.execute('SELECT USER, SYS_CONTEXT(\'USERENV\',\'CON_NAME\') AS pdb FROM dual', [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      console.log(`OK ${a}: conectado como ${r.rows[0].USER} en ${r.rows[0].PDB}`);
      await c.close();
      return;
    } catch (err) {
      console.log(`FALLA ${a}: ${err.message.split('\n')[0]}`);
    }
  }
  console.log('\nNinguna ADB accesible: probablemente la base esta DETENIDA en OCI.');
})();
