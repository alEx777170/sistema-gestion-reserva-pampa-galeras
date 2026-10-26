const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { getConnection } = require('../db');
const { verifyToken } = require('../middleware/auth');

const OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const REINOS = ['FLORA', 'FAUNA'];
const ESTADOS = ['LC', 'NT', 'VU', 'EN', 'CR', 'DD', 'NE'];

// Valida y normaliza el cuerpo; devuelve { error } o { datos }
function validar(body) {
  const texto = (v, max) => (v ? String(v).trim().slice(0, max) || null : null);
  const datos = {
    nombre_comun: texto(body.nombre_comun, 120),
    nombre_cientifico: texto(body.nombre_cientifico, 160),
    estado_conservacion: texto(body.estado_conservacion, 2),
    clase: texto(body.clase, 100),
    orden: texto(body.orden, 100),
    familia: texto(body.familia, 100),
    reino: body.reino ? String(body.reino).trim().toUpperCase() : 'FAUNA'
  };
  if (!datos.nombre_cientifico) return { error: 'Falta campo requerido: nombre científico' };
  if (!REINOS.includes(datos.reino)) return { error: 'El reino debe ser FLORA o FAUNA' };
  if (datos.estado_conservacion && !ESTADOS.includes(datos.estado_conservacion)) {
    return { error: 'Estado de conservación inválido' };
  }
  return { datos };
}

function errorBd(res, err, mensaje) {
  if (err.errorNum === 2292) {
    return res.status(400).json({ error: 'Hay animales registrados de esta especie: no se puede eliminar ni pasar a flora.' });
  }
  console.error(mensaje, err.message);
  return res.status(500).json({ error: mensaje, details: err.message });
}

// GET /api/especies?reino=FLORA|FAUNA  - lista pública
// Ordenada por reino, clase y nombre (común si existe, si no el científico)
router.get('/', async (req, res) => {
  const reino = req.query.reino ? String(req.query.reino).toUpperCase() : null;
  if (reino && !REINOS.includes(reino)) return res.status(400).json({ error: 'El reino debe ser FLORA o FAUNA' });
  let conn;
  try {
    conn = await getConnection();
    const sql = `SELECT e.id_especie, e.nombre_comun, e.nombre_cientifico, e.estado_conservacion,
                        e.clase, e.orden, e.familia, e.reino,
                        (SELECT COUNT(*) FROM ANIMAL a WHERE a.id_especie = e.id_especie) AS total_animales
                 FROM ESPECIE e
                 ${reino ? 'WHERE e.reino = :reino' : ''}
                 ORDER BY e.reino, e.clase, NVL(e.nombre_comun, e.nombre_cientifico)`;
    const result = await conn.execute(sql, reino ? { reino } : {}, OBJ);
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    errorBd(res, err, 'Error obteniendo especies');
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// POST /api/especies - crear (protegido)
router.post('/', verifyToken, async (req, res) => {
  const v = validar(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `INSERT INTO ESPECIE (nombre_comun, nombre_cientifico, estado_conservacion, clase, orden, familia, reino)
       VALUES (:nombre_comun, :nombre_cientifico, :estado_conservacion, :clase, :orden, :familia, :reino)
       RETURNING id_especie INTO :out_id`,
      { ...v.datos, out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
      { autoCommit: true });
    res.json({ ok: true, id_especie: result.outBinds.out_id[0] });
  } catch (err) {
    errorBd(res, err, 'Error creando especie');
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// PUT /api/especies/:id - actualizar (protegido)
router.put('/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const v = validar(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `UPDATE ESPECIE SET nombre_comun = :nombre_comun, nombre_cientifico = :nombre_cientifico,
                          estado_conservacion = :estado_conservacion, clase = :clase, orden = :orden,
                          familia = :familia, reino = :reino
       WHERE id_especie = :id_especie`,
      { ...v.datos, id_especie: id }, { autoCommit: true });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'La especie no existe' });
    res.json({ ok: true });
  } catch (err) {
    errorBd(res, err, 'Error actualizando especie');
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
    const result = await conn.execute(`DELETE FROM ESPECIE WHERE id_especie = :id_especie`, { id_especie: id }, { autoCommit: true });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'La especie no existe' });
    res.json({ ok: true });
  } catch (err) {
    errorBd(res, err, 'Error eliminando especie');
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

module.exports = router;
