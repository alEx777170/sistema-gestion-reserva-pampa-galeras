const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { getConnection } = require('../db');
const { verifyToken } = require('../middleware/auth');

const OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };

async function closeConn(conn) {
  if (conn) try { await conn.close(); } catch (e) {}
}

// Valida y normaliza el cuerpo; devuelve { error } o { datos }
function validar(body) {
  const id_reserva = parseInt(body.id_reserva, 10);
  if (!id_reserva) return { error: 'Falta campo requerido: reserva' };
  const zona = body.zona ? String(body.zona).trim().slice(0, 120) : null;
  let cantidad_animales = null;
  if (body.cantidad_animales !== undefined && body.cantidad_animales !== null && body.cantidad_animales !== '') {
    cantidad_animales = parseInt(body.cantidad_animales, 10);
    if (Number.isNaN(cantidad_animales) || cantidad_animales < 0) {
      return { error: 'La cantidad de animales debe ser un número >= 0' };
    }
  }
  return { datos: { id_reserva, zona, cantidad_animales } };
}

function errorBd(res, err, mensaje) {
  if (err.errorNum === 2291) {
    return res.status(400).json({ error: 'La reserva seleccionada no existe' });
  }
  if (err.errorNum === 2292) {
    return res.status(400).json({ error: 'No se puede eliminar: el hato tiene animales registrados' });
  }
  console.error(mensaje, err.message);
  return res.status(500).json({ error: mensaje, details: err.message });
}

// GET /api/hatos  - lista pública de hatos (para selects y página)
router.get('/', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const sql = `SELECT h.id_hato, h.id_reserva, r.nombre AS reserva, h.zona, h.cantidad_animales,
                        (SELECT COUNT(*) FROM ANIMAL a WHERE a.id_hato = h.id_hato) AS animales_registrados
                 FROM HATO h
                 LEFT JOIN RESERVA r ON r.id_reserva = h.id_reserva
                 ORDER BY r.nombre, h.zona`;
    const result = await conn.execute(sql, [], OBJ);
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    errorBd(res, err, 'Error obteniendo hatos');
  } finally {
    await closeConn(conn);
  }
});

// POST /api/hatos - crear (protegido)
router.post('/', verifyToken, async (req, res) => {
  const v = validar(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `INSERT INTO HATO (id_reserva, cantidad_animales, zona)
       VALUES (:id_reserva, :cantidad_animales, :zona)
       RETURNING id_hato INTO :out_id`,
      { ...v.datos, out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
      { autoCommit: true });
    res.status(201).json({ ok: true, id_hato: result.outBinds.out_id[0] });
  } catch (err) {
    errorBd(res, err, 'Error creando hato');
  } finally {
    await closeConn(conn);
  }
});

// PUT /api/hatos/:id - actualizar (protegido)
router.put('/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const v = validar(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `UPDATE HATO SET id_reserva = :id_reserva, cantidad_animales = :cantidad_animales, zona = :zona
       WHERE id_hato = :id`,
      { ...v.datos, id }, { autoCommit: true });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'El hato no existe' });
    res.json({ ok: true });
  } catch (err) {
    errorBd(res, err, 'Error actualizando hato');
  } finally {
    await closeConn(conn);
  }
});

// DELETE /api/hatos/:id - eliminar (protegido)
router.delete('/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `DELETE FROM HATO WHERE id_hato = :id`, { id }, { autoCommit: true });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'El hato no existe' });
    res.json({ ok: true });
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch (e) {}
    errorBd(res, err, 'Error eliminando hato');
  } finally {
    await closeConn(conn);
  }
});

module.exports = router;
