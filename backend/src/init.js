// init.js - Inicializa node-oracledb en modo THICK (Oracle Instant Client)
//
// ¿Por qué thick y no thin?
// La clave privada del wallet de la ADB (ewallet.pem) viene ENCRIPTADA. En modo
// thin el cliente no logra presentar su certificado al servidor y el listener de
// Oracle rechaza la conexion con:
//     NJS-511 / ORA-12506: TNS:listener rejected connection based on service ACL filtering
// En modo thick se usa cwallet.sso (auto-login, sin contraseña), el stack de red
// nativo de Oracle, y la conexion funciona correctamente.
//
// El modo se activa definiendo ORACLE_IC_HOME (carpeta de Instant Client).
// Si no esta definido, se mantiene el modo thin (para entornos sin Instant Client).
const oracledb = require('oracledb');

let listo = false;

function initOracle() {
  if (listo) return true;

  const ic = process.env.ORACLE_IC_HOME;
  if (!ic) return false; // sin Instant Client: modo thin

  try {
    oracledb.initOracleClient({ libDir: ic });
    listo = true;
    console.log(`[oracle] modo thick activo (Instant Client: ${ic})`);
    return true;
  } catch (err) {
    const msg = String(err.message || err);
    if (msg.includes('already been initialized') || msg.includes('NJS-507')) {
      listo = true;
      return true;
    }
    console.warn(`[oracle] no se pudo iniciar Instant Client, se usara modo thin: ${msg.split('\n')[0]}`);
    return false;
  }
}

module.exports = { initOracle };
