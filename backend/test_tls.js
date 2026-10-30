// test_tls.js - probar conexión TLS (sin certificado de cliente) a la ADB
// Las ADB nuevas admiten TLS en el mismo puerto 1522; el wallet mTLS no hace falta.
require('dotenv').config();
const oracledb = require('oracledb');

// TLS puro: no queremos que se cargue el wallet mTLS
delete process.env.TNS_ADMIN;

const SERVICE = process.env.ORACLE_CONNECT_STRING; // xdj14bpg9jq95hgc_high

// Descriptor explícito: TLS puro, sin presentar certificado de cliente.
// Importante: TNS_ADMIN NO apunta al wallet (queremos TLS, no mTLS).
const DESCRIPTOR = `(description=(retry_count=3)(retry_delay=1)
  (address=(protocol=tcps)(port=1522)(host=adb.us-ashburn-1.oraclecloud.com))
  (connect_data=(service_name=g71523b10d5cea6_${SERVICE}.adb.oraclecloud.com))
  (security=(ssl_server_dn_match=yes)))`;

(async () => {
  // A) TLS sin wallet
  try {
    const c = await oracledb.getConnection({
      user: process.env.ORACLE_ADMIN_USER,
      password: process.env.ORACLE_ADMIN_PASSWORD,
      connectString: DESCRIPTOR
    });
    const r = await c.execute("SELECT USER, SYS_CONTEXT('USERENV','CON_NAME') AS pdb FROM dual",
      [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    console.log(`A) TLS sin wallet: OK, conectado como ${r.rows[0].USER} en ${r.rows[0].PDB}`);
    await c.close();
    return;
  } catch (err) {
    console.log(`A) TLS sin wallet: ${err.message.split('\n')[0]}`);
  }

  // B) TLS con ssl_server_dn_match=no (por si el certificado no coincide)
  try {
    const c = await oracledb.getConnection({
      user: process.env.ORACLE_ADMIN_USER,
      password: process.env.ORACLE_ADMIN_PASSWORD,
      connectString: DESCRIPTOR.replace('ssl_server_dn_match=yes', 'ssl_server_dn_match=no')
    });
    console.log('B) TLS sin DN match: OK');
    await c.close();
    return;
  } catch (err) {
    console.log(`B) TLS sin DN match: ${err.message.split('\n')[0]}`);
  }
})();
