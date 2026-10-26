const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const path = require('path');
const fs = require('fs');
const { getConnection } = require('../db');
const { verifyToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

const OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };

// Valida el cuerpo; devuelve { error } o { datos }
function validar(body) {
  const id_hato = parseInt(body.id_hato, 10);
  const id_especie = parseInt(body.id_especie, 10);
  if (!id_hato || !id_especie) return { error: 'Faltan campos requeridos: hato y especie' };
  const sexo = body.sexo ? String(body.sexo).trim().toUpperCase() : 'U';
  if (!['M', 'F', 'U'].includes(sexo)) return { error: 'Sexo inválido' };
  let edad = null;
  if (body.edad_anios !== undefined && body.edad_anios !== null && body.edad_anios !== '') {
    edad = parseInt(body.edad_anios, 10);
    if (!(edad >= 0 && edad <= 100)) return { error: 'La edad debe estar entre 0 y 100 años' };
  }
  const obs = body.observaciones ? String(body.observaciones).trim().slice(0, 1000) : '';
  return { datos: { id_hato, id_especie, sexo, edad_anios: edad, observaciones: obs || null } };
}

// ORA-02291: la FK no encontró el padre. La FK de especie es (id_especie, 'FAUNA'),
// así que también salta si se elige una especie de flora.
function errorBd(res, err, mensaje) {
  if (err.errorNum === 2291) {
    const msg = /FK_ANIMAL_ESPECIE/i.test(err.message)
      ? 'La especie no existe o es de flora: solo se registran animales de especies de fauna.'
      : 'El hato indicado no existe.';
    return res.status(400).json({ error: msg });
  }
  console.error(mensaje, err.message);
  return res.status(500).json({ error: mensaje, details: err.message });
}

// GET /api/animales  - lista pública (con nombre de la especie y del hato)
router.get('/', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const sql = `SELECT a.id_animal, a.id_hato, a.id_especie,
                        NVL(e.nombre_comun, e.nombre_cientifico) AS especie,
                        e.nombre_comun, e.nombre_cientifico, e.clase,
                        h.zona AS hato_zona, r.nombre AS reserva,
                        a.sexo, a.edad_anios, TO_CHAR(a.fecha_registro, 'DD/MM/YYYY') AS fecha_registro,
                        a.observaciones, a.foto_ruta
                 FROM ANIMAL a
                 JOIN ESPECIE e ON e.id_especie = a.id_especie
                 JOIN HATO h ON h.id_hato = a.id_hato
                 LEFT JOIN RESERVA r ON r.id_reserva = h.id_reserva
                 ORDER BY NVL(e.nombre_comun, e.nombre_cientifico), a.id_animal`;
    const result = await conn.execute(sql, [], OBJ);
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    errorBd(res, err, 'Error obteniendo animales');
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// POST /api/animales  - crear animal (protegido)
router.post('/', verifyToken, async (req, res) => {
  const v = validar(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `INSERT INTO ANIMAL (id_hato, id_especie, sexo, edad_anios, observaciones)
       VALUES (:id_hato, :id_especie, :sexo, :edad_anios, :observaciones)
       RETURNING id_animal INTO :out_id`,
      { ...v.datos, out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
      { autoCommit: true });
    res.json({ ok: true, id_animal: result.outBinds.out_id[0] });
  } catch (err) {
    errorBd(res, err, 'Error creando animal');
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
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const v = validar(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `UPDATE ANIMAL SET id_hato = :id_hato, id_especie = :id_especie, sexo = :sexo,
                         edad_anios = :edad_anios, observaciones = :observaciones
       WHERE id_animal = :id_animal`,
      { ...v.datos, id_animal: id }, { autoCommit: true });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'El animal no existe' });
    res.json({ ok: true, rowsAffected: result.rowsAffected });
  } catch (err) {
    errorBd(res, err, 'Error actualizando animal');
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
