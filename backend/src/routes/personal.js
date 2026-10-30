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
  const nombre = body.nombre ? String(body.nombre).trim() : '';
  const apellido = body.apellido ? String(body.apellido).trim() : '';
  const cargo = body.cargo ? String(body.cargo).trim() : '';
  const especialidad = body.especialidad ? String(body.especialidad).trim() : '';
  if (!nombre) return { error: 'Falta campo requerido: nombre' };
  return {
    datos: {
      nombre: nombre.slice(0, 60),
      apellido: apellido.slice(0, 80) || null,
      cargo: cargo.slice(0, 80) || null,
      especialidad: especialidad.slice(0, 120) || null
    }
  };
}

function errorBd(res, err, mensaje) {
  if (err.errorNum === 2292) {
    return res.status(400).json({ error: 'No se puede eliminar: el personal tiene actividades asignadas' });
  }
  console.error(mensaje, err.message);
  return res.status(500).json({ error: mensaje, details: err.message });
}

// GET /api/personal - lista (protegido)
router.get('/', verifyToken, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `SELECT p.id_personal, p.nombre, p.apellido, p.cargo, p.especialidad,
              (SELECT COUNT(*) FROM ACTIVIDAD_PERSONAL ap WHERE ap.id_personal = p.id_personal) AS actividades_asignadas
       FROM PERSONAL p ORDER BY p.apellido, p.nombre`, [], OBJ);
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    errorBd(res, err, 'Error obteniendo personal');
  } finally {
    await closeConn(conn);
  }
});

// POST /api/personal - crear (protegido)
router.post('/', verifyToken, async (req, res) => {
  const v = validar(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `INSERT INTO PERSONAL (nombre, apellido, cargo, especialidad)
       VALUES (:nombre, :apellido, :cargo, :especialidad)
       RETURNING id_personal INTO :out_id`,
      { ...v.datos, out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
      { autoCommit: true });
    res.status(201).json({ ok: true, id_personal: result.outBinds.out_id[0] });
  } catch (err) {
    errorBd(res, err, 'Error creando personal');
  } finally {
    await closeConn(conn);
  }
});

// PUT /api/personal/:id - actualizar (protegido)
router.put('/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const v = validar(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `UPDATE PERSONAL SET nombre = :nombre, apellido = :apellido,
                           cargo = :cargo, especialidad = :especialidad
       WHERE id_personal = :id`,
      { ...v.datos, id }, { autoCommit: true });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'El personal no existe' });
    res.json({ ok: true });
  } catch (err) {
    errorBd(res, err, 'Error actualizando personal');
  } finally {
    await closeConn(conn);
  }
});

// DELETE /api/personal/:id - eliminar (protegido)
router.delete('/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `DELETE FROM PERSONAL WHERE id_personal = :id`, { id }, { autoCommit: true });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'El personal no existe' });
    res.json({ ok: true });
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch (e) {}
    errorBd(res, err, 'Error eliminando personal');
  } finally {
    await closeConn(conn);
  }
});

module.exports = router;
