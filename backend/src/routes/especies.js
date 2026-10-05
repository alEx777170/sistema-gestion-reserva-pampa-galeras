const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { getConnection } = require('../db');
const { verifyToken } = require('../middleware/auth');

// GET /api/especies  - lista pública
router.get('/', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const sql = `SELECT id_especie, nombre_comun, nombre_cientifico, estado_conservacion, clase, orden, familia
                 FROM ESPECIE
                 ORDER BY nombre_comun`;
    const result = await conn.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    console.error('Error GET /api/especies:', err.message);
    res.status(500).json({ error: 'Error obteniendo especies', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// POST /api/especies - crear (protegido)
router.post('/', verifyToken, async (req, res) => {
  const { nombre_comun, nombre_cientifico, estado_conservacion, clase, orden, familia } = req.body;
  let conn;
  try {
    conn = await getConnection();
    const sql = `INSERT INTO ESPECIE (nombre_comun, nombre_cientifico, estado_conservacion, clase, orden, familia) VALUES (:nombre_comun, :nombre_cientifico, :estado_conservacion, :clase, :orden, :familia)`;
    const binds = {
      nombre_comun: nombre_comun ? nombre_comun.trim() : null,
      nombre_cientifico: nombre_cientifico ? nombre_cientifico.trim() : null,
      estado_conservacion: estado_conservacion ? estado_conservacion.trim() : null,
      clase: clase ? clase.trim() : null,
      orden: orden ? orden.trim() : null,
      familia: familia ? familia.trim() : null
    };
    await conn.execute(sql, binds, { autoCommit: false });
    const queryResult = await conn.execute(`SELECT MAX(id_especie) as id_especie FROM ESPECIE`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const newId = queryResult.rows[0]?.ID_ESPECIE || queryResult.rows[0]?.id_especie;
    await conn.commit();
    res.json({ ok: true, id_especie: newId });
  } catch (err) {
    console.error('Error POST /api/especies:', err.message);
    if (conn) try { await conn.rollback(); } catch (e) {}
    res.status(500).json({ error: 'Error creando especie', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// PUT /api/especies/:id - actualizar (protegido)
router.put('/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { nombre_comun, nombre_cientifico, estado_conservacion, clase, orden, familia } = req.body;
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  let conn;
  try {
    conn = await getConnection();
    const sql = `UPDATE ESPECIE SET nombre_comun = :nombre_comun, nombre_cientifico = :nombre_cientifico, estado_conservacion = :estado_conservacion, clase = :clase, orden = :orden, familia = :familia WHERE id_especie = :id_especie`;
    const binds = { nombre_comun: nombre_comun ? nombre_comun.trim() : null, nombre_cientifico: nombre_cientifico ? nombre_cientifico.trim() : null, estado_conservacion: estado_conservacion ? estado_conservacion.trim() : null, clase: clase ? clase.trim() : null, orden: orden ? orden.trim() : null, familia: familia ? familia.trim() : null, id_especie: id };
    await conn.execute(sql, binds, { autoCommit: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error PUT /api/especies/:id', err.message);
    if (conn) try { await conn.rollback(); } catch (e) {}
    res.status(500).json({ error: 'Error actualizando especie', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// DELETE /api/especies/:id - borrar (protegido)
router.delete('/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  let conn;
  try {
    conn = await getConnection();
    await conn.execute(`DELETE FROM ESPECIE WHERE id_especie = :id_especie`, { id_especie: id }, { autoCommit: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error DELETE /api/especies/:id', err.message);
    if (conn) try { await conn.rollback(); } catch (e) {}
    res.status(500).json({ error: 'Error eliminando especie', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

module.exports = router;
