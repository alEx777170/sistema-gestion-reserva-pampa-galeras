const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { getConnection } = require('../db');

// GET /api/hatos  - lista pública de hatos (para selects)
router.get('/', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const sql = `SELECT h.id_hato, r.nombre AS reserva, h.zona, h.cantidad_animales
                 FROM HATO h
                 LEFT JOIN RESERVA r ON r.id_reserva = h.id_reserva
                 ORDER BY h.id_hato`;
    const result = await conn.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    console.error('Error GET /api/hatos:', err.message);
    res.status(500).json({ error: 'Error obteniendo hatos', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

module.exports = router;
