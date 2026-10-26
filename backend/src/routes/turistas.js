const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { getConnection } = require('../db');
const { verifyToken } = require('../middleware/auth');

const OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const ID_RESERVA_NATURAL = 1; // Reserva Nacional Pampa Galeras

async function closeConn(conn) {
  if (conn) try { await conn.close(); } catch (e) {}
}

// Valida y normaliza el cuerpo; devuelve { error } o { datos }
function validar(body) {
  const nombre = body.nombre ? String(body.nombre).trim() : '';
  const apellido = body.apellido ? String(body.apellido).trim() : '';
  const dni = body.dni ? String(body.dni).trim() : '';
  const nacionalidad = body.nacionalidad ? String(body.nacionalidad).trim() : '';
  if (!nombre) return { error: 'Falta campo requerido: nombre' };
  if (dni && !/^\d{8}$/.test(dni)) return { error: 'El DNI debe tener 8 dígitos' };
  let edad = null;
  if (body.edad !== undefined && body.edad !== null && body.edad !== '') {
    edad = parseInt(body.edad, 10);
    if (Number.isNaN(edad) || edad < 0 || edad > 130) return { error: 'La edad debe estar entre 0 y 130' };
  }
  return { datos: { nombre, apellido: apellido || null, dni: dni || null, edad, nacionalidad: nacionalidad || null } };
}

function errorBd(res, err, mensaje) {
  if (err.errorNum === 1) return res.status(400).json({ error: 'Ya existe un turista con ese DNI' });
  if (err.errorNum === 2292) return res.status(400).json({ error: 'No se puede eliminar: el turista tiene reservas asociadas' });
  console.error(mensaje, err.message);
  return res.status(500).json({ error: mensaje, details: err.message });
}

// GET /api/turistas - lista (protegido)
router.get('/', verifyToken, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `SELECT t.id_turista, t.dni, t.nombre, t.apellido, t.edad, t.nacionalidad,
              (SELECT COUNT(*) FROM RESERVA_VISITA rv
               WHERE rv.id_turista = t.id_turista AND rv.estado IN ('PENDIENTE','CONFIRMADA')) AS reservas_activas
       FROM TURISTA t ORDER BY t.apellido, t.nombre`, [], OBJ);
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    errorBd(res, err, 'Error obteniendo turistas');
  } finally {
    await closeConn(conn);
  }
});

// POST /api/turistas - registrar (protegido)
router.post('/', verifyToken, async (req, res) => {
  const v = validar(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `INSERT INTO TURISTA (id_reserva, dni, nombre, apellido, edad, nacionalidad)
       VALUES (:id_reserva, :dni, :nombre, :apellido, :edad, :nacionalidad)
       RETURNING id_turista INTO :out_id`,
      { id_reserva: ID_RESERVA_NATURAL, ...v.datos, out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
      { autoCommit: true });
    res.status(201).json({ ok: true, id_turista: result.outBinds.out_id[0] });
  } catch (err) {
    errorBd(res, err, 'Error creando turista');
  } finally {
    await closeConn(conn);
  }
});

// PUT /api/turistas/:id - actualizar (protegido)
router.put('/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const v = validar(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `UPDATE TURISTA SET dni = :dni, nombre = :nombre, apellido = :apellido,
                          edad = :edad, nacionalidad = :nacionalidad
       WHERE id_turista = :id`,
      { ...v.datos, id }, { autoCommit: true });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'El turista no existe' });
    res.json({ ok: true });
  } catch (err) {
    errorBd(res, err, 'Error actualizando turista');
  } finally {
    await closeConn(conn);
  }
});

// DELETE /api/turistas/:id - eliminar (protegido)
router.delete('/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(`DELETE FROM TURISTA WHERE id_turista = :id`, { id }, { autoCommit: true });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'El turista no existe' });
    res.json({ ok: true });
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch (e) {}
    errorBd(res, err, 'Error eliminando turista');
  } finally {
    await closeConn(conn);
  }
});

module.exports = router;
