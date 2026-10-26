const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const path = require('path');
const fs = require('fs');
const { getConnection } = require('../db');
const { verifyToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

// GET /api/actividades - lista pública
router.get('/', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const sql = `SELECT id_actividad, nombre, tipo, lugar, TO_CHAR(fecha_realizacion, 'YYYY-MM-DD') AS fecha_realizacion, duracion_min, costo_soles, descripcion, foto_ruta FROM ACTIVIDAD ORDER BY nombre`;
    const result = await conn.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    console.error('Error GET /api/actividades:', err.message);
    res.status(500).json({ error: 'Error obteniendo actividades', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// POST /api/actividades - crear (protegido)
// En una sola transacción: inserta la actividad y sus 3 horarios fijos (08:00, 11:00, 14:00)
router.post('/', verifyToken, async (req, res) => {
  const { nombre, tipo, lugar, fecha_realizacion, duracion_min, costo_soles, descripcion, cupo_por_horario } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Falta campo requerido: nombre' });
  const cupo = cupo_por_horario ? parseInt(cupo_por_horario, 10) : 10;
  if (!(cupo >= 1)) return res.status(400).json({ error: 'El cupo por horario debe ser mayor a 0' });
  let conn;
  try {
    conn = await getConnection();
    const ins = await conn.execute(
      `INSERT INTO ACTIVIDAD (nombre, tipo, lugar, fecha_realizacion, duracion_min, costo_soles, descripcion)
       VALUES (:nombre, :tipo, :lugar, TO_DATE(:fecha_realizacion, 'YYYY-MM-DD'), :duracion_min, :costo_soles, :descripcion)
       RETURNING id_actividad INTO :out_id`,
      {
        nombre: nombre.trim(),
        tipo: tipo ? tipo.trim() : null,
        lugar: lugar ? lugar.trim() : null,
        fecha_realizacion: fecha_realizacion || null,
        duracion_min: duracion_min ? parseInt(duracion_min, 10) : null,
        costo_soles: costo_soles ? parseFloat(costo_soles) : null,
        descripcion: descripcion ? descripcion.trim().slice(0, 1000) : null,
        out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: false });
    const newId = ins.outBinds.out_id[0];
    await conn.execute(
      `INSERT INTO HORARIO_ACTIVIDAD (id_actividad, hora_inicio, cupo_maximo)
       SELECT :id_actividad, h.hora, :cupo
       FROM (SELECT '08:00' AS hora FROM dual
             UNION ALL SELECT '11:00' FROM dual
             UNION ALL SELECT '14:00' FROM dual) h`,
      { id_actividad: newId, cupo },
      { autoCommit: false });
    await conn.commit();
    res.json({ ok: true, id_actividad: newId });
  } catch (err) {
    console.error('Error POST /api/actividades:', err.message);
    if (conn) try { await conn.rollback(); } catch (e) {}
    res.status(500).json({ error: 'Error creando actividad', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// POST /api/actividades/:id/foto - subir foto (protegido)
router.post('/:id/foto', verifyToken, upload.single('foto'), async (req, res) => {
  const actividadId = parseInt(req.params.id, 10);
  if (!actividadId) return res.status(400).json({ error: 'ID de actividad inválido' });
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });

  const fotoRuta = `/uploads/${req.file.filename}`;
  let conn;
  try {
    conn = await getConnection();
    const selectSql = `SELECT foto_ruta FROM ACTIVIDAD WHERE id_actividad = :id_actividad`;
    const selectResult = await conn.execute(selectSql, { id_actividad: actividadId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const oldFoto = selectResult.rows[0]?.FOTO_RUTA;
    
    const updateSql = `UPDATE ACTIVIDAD SET foto_ruta = :foto_ruta WHERE id_actividad = :id_actividad`;
    const result = await conn.execute(updateSql, { foto_ruta: fotoRuta, id_actividad: actividadId }, { autoCommit: true });
    
    if (oldFoto) {
      const oldPath = path.join(__dirname, '../../' + oldFoto);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { console.warn('No se pudo borrar foto anterior:', e.message); }
      }
    }
    
    res.json({ ok: true, foto_ruta: fotoRuta, rowsAffected: result.rowsAffected });
  } catch (err) {
    console.error('Error POST /api/actividades/:id/foto:', err.message);
    if (req.file) {
      const filePath = path.join(__dirname, '../../uploads', req.file.filename);
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
    if (conn) try { await conn.rollback(); } catch (e) {}
    res.status(500).json({ error: 'Error subiendo foto', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// PUT /api/actividades/:id - actualizar (protegido)
router.put('/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { nombre, tipo, lugar, fecha_realizacion, duracion_min, costo_soles, descripcion } = req.body;
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  if (!nombre) return res.status(400).json({ error: 'Falta campo requerido: nombre' });
  let conn;
  try {
    conn = await getConnection();
    const sql = `UPDATE ACTIVIDAD SET nombre = :nombre, tipo = :tipo, lugar = :lugar, fecha_realizacion = ${fecha_realizacion ? "TO_DATE(:fecha_realizacion, 'YYYY-MM-DD')" : 'NULL'}, duracion_min = :duracion_min, costo_soles = :costo_soles, descripcion = :descripcion WHERE id_actividad = :id_actividad`;
    const binds = { nombre: nombre.trim(), tipo: tipo ? tipo.trim() : null, lugar: lugar ? lugar.trim() : null, duracion_min: duracion_min ? parseInt(duracion_min, 10) : null, costo_soles: costo_soles ? parseFloat(costo_soles) : null, descripcion: descripcion ? descripcion.trim().slice(0, 1000) : null, id_actividad: id };
    if (fecha_realizacion) binds.fecha_realizacion = fecha_realizacion;
    await conn.execute(sql, binds, { autoCommit: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error PUT /api/actividades/:id', err.message);
    if (conn) try { await conn.rollback(); } catch (e) {}
    res.status(500).json({ error: 'Error actualizando actividad', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// DELETE /api/actividades/:id - borrar (protegido)
router.delete('/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  let conn;
  try {
    conn = await getConnection();
    await conn.execute(`DELETE FROM ACTIVIDAD WHERE id_actividad = :id_actividad`, { id_actividad: id }, { autoCommit: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error DELETE /api/actividades/:id', err.message);
    if (conn) try { await conn.rollback(); } catch (e) {}
    if (err.errorNum === 2292) return res.status(400).json({ error: 'No se puede eliminar: la actividad tiene reservas asociadas' });
    res.status(500).json({ error: 'Error eliminando actividad', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

module.exports = router;
