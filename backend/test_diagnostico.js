// test_diagnostico.js - ¿el listener conoce el servicio o no?
// Compara el error al pedir el servicio REAL vs un servicio INVENTADO.
//  - Servicio inventado inexistente  -> ORA-12514 (listener no lo conoce)
//  - Servicio real y instancia caída -> ORA-12506 / ORA-12541 (conocido pero sin instancia)
const path = require('path');
process.env.TNS_ADMIN = path.join(__dirname, 'wallet');
require('dotenv').config();
const oracledb = require('oracledb');

function desc(svc) {
  return `(description=(retry_count=0)(retry_delay=1)
    (address=(protocol=tcps)(port=1522)(host=adb.us-ashburn-1.oraclecloud.com))
    (connect_data=(service_name=${svc}))
    (security=(ssl_server_dn_match=yes)))`;
}

(async () => {
  const pruebas = [
    ['REAL (high)',  'g71523b10d5cea6_xdj14bpg9jq95hgc_high.adb.oraclecloud.com'],
    ['REAL (medium)','g71523b10d5cea6_xdj14bpg9jq95hgc_medium.adb.oraclecloud.com'],
    ['INVENTADO',    'g71523b10d5cea6_servicio_que_no_existe.adb.oraclecloud.com']
  ];
  for (const [ etiqueta, svc ] of pruebas) {
    try {
      const c = await oracledb.getConnection({
        user: process.env.ORACLE_ADMIN_USER,
        password: process.env.ORACLE_ADMIN_PASSWORD,
        connectString: desc(svc)
      });
      console.log(`${etiqueta}: ¡CONECTÓ!`);
      await c.close();
    } catch (err) {
      const linea = err.message.split('\n')[0];
      const codigo = (err.message.match(/ORA-\d+/) || ['(sin ORA)'])[0];
      console.log(`${etiqueta}: ${codigo} -> ${linea.slice(0, 90)}`);
    }
  }
})();
