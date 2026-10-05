const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const path = require('path');
const fs = require('fs');
const { getConnection } = require('../db');
const { verifyToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

// GET /api/animales  - lista pública de animales (join con especie, incluye foto_ruta)
router.get('/', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const sql = `SELECT a.id_animal, a.id_hato, a.id_especie, e.nombre_comun AS especie, a.sexo, a.edad_anios, a.fecha_registro, a.observaciones, a.foto_ruta
                 FROM ANIMAL a
                 LEFT JOIN ESPECIE e ON e.id_especie = a.id_especie
                 ORDER BY a.id_animal`;
    const result = await conn.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    console.error('Error GET /api/animales:', err.message);
    res.status(500).json({ error: 'Error obteniendo animales', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// POST /api/animales  - crear animal (protegido)
router.post('/', verifyToken, async (req, res) => {
  const { id_hato, id_especie, sexo, edad_anios, observaciones } = req.body;
  if (!id_hato || !id_especie) return res.status(400).json({ error: 'Faltan campos requeridos: id_hato, id_especie' });
  let conn;
  try {
    conn = await getConnection();
    const insertSql = `INSERT INTO ANIMAL (id_hato, id_especie, sexo, edad_anios, observaciones)
                       VALUES (:id_hato, :id_especie, :sexo, :edad_anios, :observaciones)`;
    const binds = {
      id_hato: parseInt(id_hato, 10),
      id_especie: parseInt(id_especie, 10),
      sexo: (sexo && sexo.trim()) ? sexo.trim() : null,
      edad_anios: edad_anios ? parseInt(edad_anios, 10) : null,
      observaciones: (observaciones && observaciones.trim()) ? observaciones.trim() : null
    };
    await conn.execute(insertSql, binds, { autoCommit: false });
    
    const querySql = `SELECT MAX(id_animal) as id_animal FROM ANIMAL`;
    const queryResult = await conn.execute(querySql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const newId = queryResult.rows[0]?.ID_ANIMAL || queryResult.rows[0]?.id_animal;
    
    await conn.commit();
    console.log(`Animal creado: ID ${newId}`);
    res.json({ ok: true, id_animal: newId });
  } catch (err) {
    console.error('Error POST /api/animales:', err.message);
    if (conn) try { await conn.rollback(); } catch (e) {}
    res.status(500).json({ error: 'Error creando animal', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// POST /api/animales/:id/foto - subir foto para un animal (protegido)
router.post('/:id/foto', verifyToken, upload.single('foto'), async (req, res) => {
  const animalId = parseInt(req.params.id, 10);
  if (!animalId) return res.status(400).json({ error: 'ID de animal inválido' });
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });

  const fotoRuta = `/uploads/${req.file.filename}`;
  let conn;
  try {
    conn = await getConnection();
    
    // Obtener ruta anterior para borrar archivo viejo
    const selectSql = `SELECT foto_ruta FROM ANIMAL WHERE id_animal = :id_animal`;
    const selectResult = await conn.execute(selectSql, { id_animal: animalId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const oldFoto = selectResult.rows[0]?.FOTO_RUTA;
    
    // Actualizar con nueva ruta
    const updateSql = `UPDATE ANIMAL SET foto_ruta = :foto_ruta WHERE id_animal = :id_animal`;
    const result = await conn.execute(updateSql, { foto_ruta: fotoRuta, id_animal: animalId }, { autoCommit: true });
    
    // Borrar archivo anterior si existe
    if (oldFoto) {
      const oldPath = path.join(__dirname, '../../' + oldFoto);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { console.warn('No se pudo borrar foto anterior:', e.message); }
      }
    }
    
    res.json({ ok: true, foto_ruta: fotoRuta, rowsAffected: result.rowsAffected });
  } catch (err) {
    console.error('Error POST /api/animales/:id/foto:', err.message);
    // Borrar archivo subido si hubo error en BD
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

// PUT /api/animales/:id  - actualizar animal (protegido)
router.put('/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { id_hato, id_especie, sexo, edad_anios, observaciones } = req.body;
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  let conn;
  try {
    conn = await getConnection();
    const sql = `UPDATE ANIMAL SET id_hato = :id_hato, id_especie = :id_especie, sexo = :sexo, edad_anios = :edad_anios, observaciones = :observaciones WHERE id_animal = :id_animal`;
    const binds = { id_hato, id_especie, sexo: sexo || null, edad_anios: edad_anios || null, observaciones: observaciones || null, id_animal: id };
    const result = await conn.execute(sql, binds, { autoCommit: true });
    res.json({ ok: true, rowsAffected: result.rowsAffected });
  } catch (err) {
    console.error('Error PUT /api/animales/:id', err.message);
    if (conn) try { await conn.rollback(); } catch (e) {}
    res.status(500).json({ error: 'Error actualizando animal', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// DELETE /api/animales/:id  - borrar animal (protegido)
router.delete('/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  let conn;
  try {
    conn = await getConnection();
    
    // Obtener ruta de foto antes de borrar
    const selectSql = `SELECT foto_ruta FROM ANIMAL WHERE id_animal = :id_animal`;
    const selectResult = await conn.execute(selectSql, { id_animal: id }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const fotoRuta = selectResult.rows[0]?.FOTO_RUTA;
    
    // Borrar registro
    const sql = `DELETE FROM ANIMAL WHERE id_animal = :id_animal`;
    const result = await conn.execute(sql, { id_animal: id }, { autoCommit: true });
    
    // Borrar archivo de foto si existe
    if (fotoRuta) {
      const filePath = path.join(__dirname, '../../' + fotoRuta);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) { console.warn('No se pudo borrar foto:', e.message); }
      }
    }
    
    res.json({ ok: true, rowsAffected: result.rowsAffected });
  } catch (err) {
    console.error('Error DELETE /api/animales/:id', err.message);
    if (conn) try { await conn.rollback(); } catch (e) {}
    res.status(500).json({ error: 'Error eliminando animal', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

module.exports = router;
