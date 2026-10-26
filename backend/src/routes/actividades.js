const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const path = require('path');
const fs = require('fs');
const { getConnection, HOY_LIMA } = require('../db');
const { verifyToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

const OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };

// Valida el cuerpo; devuelve { error } o { datos }
function validar(body) {
  const nombre = body.nombre ? String(body.nombre).trim() : '';
  if (!nombre) return { error: 'Falta campo requerido: nombre' };
  const texto = (v, max) => (v ? String(v).trim().slice(0, max) || null : null);
  const duracion = body.duracion_min === '' || body.duracion_min == null ? null : parseInt(body.duracion_min, 10);
  const costo = body.costo_soles === '' || body.costo_soles == null ? null : parseFloat(body.costo_soles);
  if (duracion !== null && !(duracion >= 0)) return { error: 'La duración debe ser un número mayor o igual a 0' };
  if (costo !== null && !(costo >= 0)) return { error: 'El costo debe ser un número mayor o igual a 0' };
  let cupo = null;
  if (body.cupo_por_horario !== undefined && body.cupo_por_horario !== '' && body.cupo_por_horario !== null) {
    cupo = parseInt(body.cupo_por_horario, 10);
    if (!(cupo >= 1 && cupo <= 9999)) return { error: 'El cupo por horario debe estar entre 1 y 9999' };
  }
  return {
    datos: {
      nombre: nombre.slice(0, 120), tipo: texto(body.tipo, 60), lugar: texto(body.lugar, 150),
      duracion_min: duracion, costo_soles: costo, descripcion: texto(body.descripcion, 1000)
    },
    cupo
  };
}

// GET /api/actividades - lista pública (con sus horarios y el cupo por horario)
router.get('/', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const sql = `SELECT a.id_actividad, a.nombre, a.tipo, a.lugar, a.duracion_min, a.costo_soles, a.descripcion, a.foto_ruta,
                        (SELECT LISTAGG(h.hora_inicio, ', ') WITHIN GROUP (ORDER BY h.hora_inicio)
                         FROM HORARIO_ACTIVIDAD h WHERE h.id_actividad = a.id_actividad) AS horarios,
                        (SELECT MAX(h.cupo_maximo) FROM HORARIO_ACTIVIDAD h WHERE h.id_actividad = a.id_actividad) AS cupo_por_horario
                 FROM ACTIVIDAD a
                 ORDER BY a.nombre`;
    const result = await conn.execute(sql, [], OBJ);
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
  const v = validar(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const cupo = v.cupo || 10;
  let conn;
  try {
    conn = await getConnection();
    const ins = await conn.execute(
      `INSERT INTO ACTIVIDAD (nombre, tipo, lugar, duracion_min, costo_soles, descripcion)
       VALUES (:nombre, :tipo, :lugar, :duracion_min, :costo_soles, :descripcion)
       RETURNING id_actividad INTO :out_id`,
      { ...v.datos, out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
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
// Si llega cupo_por_horario, también actualiza el cupo de sus 3 horarios (misma transacción).
// No se permite bajar el cupo por debajo de lo ya reservado en alguna fecha futura.
router.put('/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const v = validar(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  let conn;
  try {
    conn = await getConnection();
    const upd = await conn.execute(
      `UPDATE ACTIVIDAD SET nombre = :nombre, tipo = :tipo, lugar = :lugar, duracion_min = :duracion_min,
                            costo_soles = :costo_soles, descripcion = :descripcion
       WHERE id_actividad = :id_actividad`,
      { ...v.datos, id_actividad: id }, { autoCommit: false });
    if (upd.rowsAffected === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'La actividad no existe' });
    }

    if (v.cupo) {
      // Bloquea los horarios de la actividad para que nadie reserve mientras se cambia el cupo
      await conn.execute(
        `SELECT id_horario FROM HORARIO_ACTIVIDAD WHERE id_actividad = :id FOR UPDATE`, { id });
      const oc = await conn.execute(
        `SELECT NVL(MAX(o.personas_reservadas), 0) AS maximo
         FROM vw_ocupacion_horario o
         JOIN HORARIO_ACTIVIDAD h ON h.id_horario = o.id_horario
         WHERE h.id_actividad = :id AND o.fecha_visita >= ${HOY_LIMA}`, { id }, OBJ);
      const maximo = oc.rows[0].MAXIMO;
      if (v.cupo < maximo) {
        await conn.rollback();
        return res.status(400).json({ error: `No se puede bajar el cupo a ${v.cupo}: ya hay un horario con ${maximo} personas reservadas.` });
      }
      await conn.execute(
        `UPDATE HORARIO_ACTIVIDAD SET cupo_maximo = :cupo WHERE id_actividad = :id`,
        { cupo: v.cupo, id }, { autoCommit: false });
    }

    await conn.commit();
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
