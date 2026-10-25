const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { getConnection } = require('../db');
const { verifyToken } = require('../middleware/auth');

// GET /api/turistas - lista (protegido)
router.get('/', verifyToken, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `SELECT id_turista, dni, nombre, apellido, edad, nacionalidad FROM TURISTA ORDER BY apellido, nombre`,
      [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    console.error('Error GET /api/turistas:', err.message);
    res.status(500).json({ error: 'Error obteniendo turistas', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// POST /api/turistas - registro rápido (protegido)
router.post('/', verifyToken, async (req, res) => {
  const { dni, nombre, apellido, edad, nacionalidad } = req.body;
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'Falta campo requerido: nombre' });
  if (dni && !/^\d{8}$/.test(String(dni).trim())) return res.status(400).json({ error: 'El DNI debe tener 8 dígitos' });
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `INSERT INTO TURISTA (dni, nombre, apellido, edad, nacionalidad)
       VALUES (:dni, :nombre, :apellido, :edad, :nacionalidad)
       RETURNING id_turista INTO :out_id`,
      {
        dni: dni ? String(dni).trim() : null,
        nombre: String(nombre).trim(),
        apellido: apellido ? String(apellido).trim() : null,
        edad: edad ? parseInt(edad, 10) : null,
        nacionalidad: nacionalidad ? String(nacionalidad).trim() : null,
        out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: true });
    res.status(201).json({ ok: true, id_turista: result.outBinds.out_id[0] });
  } catch (err) {
    if (err.errorNum === 1) return res.status(400).json({ error: 'Ya existe un turista con ese DNI' });
    console.error('Error POST /api/turistas:', err.message);
    res.status(500).json({ error: 'Error creando turista', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

module.exports = router;
