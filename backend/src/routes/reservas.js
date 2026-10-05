const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const path = require('path');
const fs = require('fs');
const { getConnection } = require('../db');
const { verifyToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

// GET /api/reservas - lista pública
router.get('/', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const sql = `SELECT id_reserva, nombre, ubicacion, superficie_ha, categoria, foto_ruta FROM RESERVA ORDER BY nombre`;
    const result = await conn.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    console.error('Error GET /api/reservas:', err.message);
    res.status(500).json({ error: 'Error obteniendo reservas', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// POST /api/reservas - crear (protegido)
router.post('/', verifyToken, async (req, res) => {
  const { nombre, ubicacion, superficie_ha, categoria } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Falta campo requerido: nombre' });
  let conn;
  try {
    conn = await getConnection();
    const sql = `INSERT INTO RESERVA (nombre, ubicacion, superficie_ha, categoria) VALUES (:nombre, :ubicacion, :superficie_ha, :categoria)`;
    const binds = {
      nombre: nombre.trim(),
      ubicacion: ubicacion ? ubicacion.trim() : null,
      superficie_ha: superficie_ha ? parseFloat(superficie_ha) : null,
      categoria: categoria ? categoria.trim() : null
    };
    await conn.execute(sql, binds, { autoCommit: false });
    const queryResult = await conn.execute(`SELECT MAX(id_reserva) as id_reserva FROM RESERVA`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const newId = queryResult.rows[0]?.ID_RESERVA || queryResult.rows[0]?.id_reserva;
    await conn.commit();
    res.json({ ok: true, id_reserva: newId });
  } catch (err) {
    console.error('Error POST /api/reservas:', err.message);
    if (conn) try { await conn.rollback(); } catch (e) {}
    res.status(500).json({ error: 'Error creando reserva', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// POST /api/reservas/:id/foto - subir foto (protegido)
router.post('/:id/foto', verifyToken, upload.single('foto'), async (req, res) => {
  const reservaId = parseInt(req.params.id, 10);
  if (!reservaId) return res.status(400).json({ error: 'ID de reserva inválido' });
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });

  const fotoRuta = `/uploads/${req.file.filename}`;
  let conn;
  try {
    conn = await getConnection();
    const selectSql = `SELECT foto_ruta FROM RESERVA WHERE id_reserva = :id_reserva`;
    const selectResult = await conn.execute(selectSql, { id_reserva: reservaId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const oldFoto = selectResult.rows[0]?.FOTO_RUTA;
    
    const updateSql = `UPDATE RESERVA SET foto_ruta = :foto_ruta WHERE id_reserva = :id_reserva`;
    const result = await conn.execute(updateSql, { foto_ruta: fotoRuta, id_reserva: reservaId }, { autoCommit: true });
    
    if (oldFoto) {
      const oldPath = path.join(__dirname, '../../' + oldFoto);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { console.warn('No se pudo borrar foto anterior:', e.message); }
      }
    }
    
    res.json({ ok: true, foto_ruta: fotoRuta, rowsAffected: result.rowsAffected });
  } catch (err) {
    console.error('Error POST /api/reservas/:id/foto:', err.message);
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

// PUT /api/reservas/:id - actualizar (protegido)
router.put('/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { nombre, ubicacion, superficie_ha, categoria } = req.body;
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  let conn;
  try {
    conn = await getConnection();
    const sql = `UPDATE RESERVA SET nombre = :nombre, ubicacion = :ubicacion, superficie_ha = :superficie_ha, categoria = :categoria WHERE id_reserva = :id_reserva`;
    const binds = { nombre: nombre.trim(), ubicacion: ubicacion ? ubicacion.trim() : null, superficie_ha: superficie_ha ? parseFloat(superficie_ha) : null, categoria: categoria ? categoria.trim() : null, id_reserva: id };
    await conn.execute(sql, binds, { autoCommit: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error PUT /api/reservas/:id', err.message);
    if (conn) try { await conn.rollback(); } catch (e) {}
    res.status(500).json({ error: 'Error actualizando reserva', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// DELETE /api/reservas/:id - borrar (protegido)
router.delete('/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  let conn;
  try {
    conn = await getConnection();
    await conn.execute(`DELETE FROM RESERVA WHERE id_reserva = :id_reserva`, { id_reserva: id }, { autoCommit: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error DELETE /api/reservas/:id', err.message);
    if (conn) try { await conn.rollback(); } catch (e) {}
    res.status(500).json({ error: 'Error eliminando reserva', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

module.exports = router;
