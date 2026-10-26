const express = require('express');
const router = express.Router();
const { getConnection } = require('../db');
const { verifyToken } = require('../middleware/auth');

// POST /api/exec/run { sql: "..." }  - protegido por JWT y desactivado salvo ALLOW_EXECUTE=true
// El script completo (proyecto_completo.sql) se ejecuta como SYS en SQL Developer, no desde aquí.
router.post('/run', verifyToken, async (req, res) => {
  if ((process.env.ALLOW_EXECUTE || 'false').toLowerCase() !== 'true') {
    return res.status(403).json({ error: 'Ejecución deshabilitada. Cambia ALLOW_EXECUTE en .env si estás en entorno controlado.' });
  }

  const sql = req.body.sql;
  if (!sql || typeof sql !== 'string') return res.status(400).json({ error: 'Falta campo sql en body' });

  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(sql, [], { autoCommit: true });
    res.json({ ok: true, result: { rowsAffected: result.rowsAffected, outBinds: result.outBinds, rows: result.rows } });
  } catch (err) {
    console.error('Error ejecutando SQL:', err.message);
    if (conn) try { await conn.rollback(); } catch (e) {}
    res.status(500).json({ error: 'Error ejecutando SQL', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

module.exports = router;
