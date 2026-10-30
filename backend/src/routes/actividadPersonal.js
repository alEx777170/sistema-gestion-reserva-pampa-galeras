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
  const id_personal = parseInt(body.id_personal, 10);
  const id_actividad = parseInt(body.id_actividad, 10);
  if (!id_personal || !id_actividad) return { error: 'Faltan campos requeridos: personal y actividad' };
  const rol = body.rol ? String(body.rol).trim().slice(0, 60) : null;
  let fecha_asignacion = null;
  if (body.fecha_asignacion) {
    const f = String(body.fecha_asignacion).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return { error: 'Formato de fecha inválido (AAAA-MM-DD)' };
    fecha_asignacion = f;
  }
  return { datos: { id_personal, id_actividad, rol, fecha_asignacion } };
}

function errorBd(res, err, mensaje) {
  if (err.errorNum === 1) {
    return res.status(400).json({ error: 'Este personal ya está asignado a esa actividad' });
  }
  if (err.errorNum === 2291) {
    return res.status(400).json({ error: 'El personal o la actividad seleccionados no existen' });
  }
  if (err.errorNum === 2292) {
    return res.status(400).json({ error: 'No se puede eliminar esta asignación por restricciones de integridad' });
  }
  console.error(mensaje, err.message);
  return res.status(500).json({ error: mensaje, details: err.message });
}

// GET /api/asignaciones - lista (protegido)
// Devuelve todas las asignaciones con nombres de personal y actividad
router.get('/', verifyToken, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `SELECT ap.id_personal, ap.id_actividad, ap.rol, ap.fecha_asignacion,
              p.nombre || ' ' || NVL(p.apellido, '') AS nombre_personal,
              p.cargo,
              a.nombre AS nombre_actividad,
              a.lugar AS lugar_actividad
       FROM ACTIVIDAD_PERSONAL ap
       JOIN PERSONAL p ON p.id_personal = ap.id_personal
       JOIN ACTIVIDAD a ON a.id_actividad = ap.id_actividad
       ORDER BY ap.fecha_asignacion DESC, p.apellido, p.nombre`, [], OBJ);
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    errorBd(res, err, 'Error obteniendo asignaciones');
  } finally {
    await closeConn(conn);
  }
});

// POST /api/asignaciones - crear (protegido)
router.post('/', verifyToken, async (req, res) => {
  const v = validar(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  let conn;
  try {
    conn = await getConnection();
    const binds = {
      id_personal: v.datos.id_personal,
      id_actividad: v.datos.id_actividad,
      rol: v.datos.rol
    };
    let sql;
    if (v.datos.fecha_asignacion) {
      sql = `INSERT INTO ACTIVIDAD_PERSONAL (id_personal, id_actividad, rol, fecha_asignacion)
             VALUES (:id_personal, :id_actividad, :rol, TO_DATE(:fecha, 'YYYY-MM-DD'))`;
      binds.fecha = v.datos.fecha_asignacion;
    } else {
      sql = `INSERT INTO ACTIVIDAD_PERSONAL (id_personal, id_actividad, rol)
             VALUES (:id_personal, :id_actividad, :rol)`;
    }
    await conn.execute(sql, binds, { autoCommit: true });
    res.status(201).json({ ok: true });
  } catch (err) {
    errorBd(res, err, 'Error creando asignación');
  } finally {
    await closeConn(conn);
  }
});

// PUT /api/asignaciones/:idPersonal/:idActividad - actualizar (protegido)
// Solo actualiza el rol y la fecha de asignación (la PK no cambia)
router.put('/:idPersonal/:idActividad', verifyToken, async (req, res) => {
  const oldPersonal = parseInt(req.params.idPersonal, 10);
  const oldActividad = parseInt(req.params.idActividad, 10);
  if (!oldPersonal || !oldActividad) return res.status(400).json({ error: 'IDs inválidos' });
  const rol = req.body.rol ? String(req.body.rol).trim().slice(0, 60) : null;
  let fecha_asignacion = null;
  if (req.body.fecha_asignacion) {
    const f = String(req.body.fecha_asignacion).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return { error: 'Formato de fecha inválido (AAAA-MM-DD)' };
    fecha_asignacion = f;
  }
  let conn;
  try {
    conn = await getConnection();
    const binds = { rol, id_personal: oldPersonal, id_actividad: oldActividad };
    let sql;
    if (fecha_asignacion) {
      sql = `UPDATE ACTIVIDAD_PERSONAL SET rol = :rol, fecha_asignacion = TO_DATE(:fecha, 'YYYY-MM-DD')
             WHERE id_personal = :id_personal AND id_actividad = :id_actividad`;
      binds.fecha = fecha_asignacion;
    } else {
      sql = `UPDATE ACTIVIDAD_PERSONAL SET rol = :rol
             WHERE id_personal = :id_personal AND id_actividad = :id_actividad`;
    }
    const result = await conn.execute(sql, binds, { autoCommit: true });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'La asignación no existe' });
    res.json({ ok: true });
  } catch (err) {
    errorBd(res, err, 'Error actualizando asignación');
  } finally {
    await closeConn(conn);
  }
});

// DELETE /api/asignaciones/:idPersonal/:idActividad - eliminar (protegido)
router.delete('/:idPersonal/:idActividad', verifyToken, async (req, res) => {
  const idPersonal = parseInt(req.params.idPersonal, 10);
  const idActividad = parseInt(req.params.idActividad, 10);
  if (!idPersonal || !idActividad) return res.status(400).json({ error: 'IDs inválidos' });
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `DELETE FROM ACTIVIDAD_PERSONAL WHERE id_personal = :id_personal AND id_actividad = :id_actividad`,
      { id_personal: idPersonal, id_actividad: idActividad }, { autoCommit: true });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'La asignación no existe' });
    res.json({ ok: true });
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch (e) {}
    errorBd(res, err, 'Error eliminando asignación');
  } finally {
    await closeConn(conn);
  }
});

module.exports = router;
