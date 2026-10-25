const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { getConnection } = require('../db');
const { verifyToken } = require('../middleware/auth');

// Errores de negocio de pkg_reservas (ORA-20001 a ORA-20012) -> 400
function handleError(res, err, fallbackMsg) {
  const num = err.errorNum;
  if (num >= 20001 && num <= 20012) {
    const m = /ORA-\d+:\s*(.*)/.exec(err.message);
    return res.status(400).json({ error: m ? m[1].split('\n')[0] : err.message, codigo: num });
  }
  console.error(fallbackMsg, err.message);
  return res.status(500).json({ error: fallbackMsg, details: err.message });
}

async function closeConn(conn) {
  if (conn) try { await conn.close(); } catch (e) {}
}

// GET /api/reservas-visita/disponibilidad - actividades con cupos (público)
router.get('/disponibilidad', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const sql = `SELECT a.id_actividad, a.nombre, a.tipo, a.lugar, a.fecha_realizacion,
                        a.costo_soles, a.cupo_maximo,
                        pkg_reservas.cupos_disponibles(a.id_actividad) AS cupos_disponibles
                 FROM ACTIVIDAD a
                 WHERE a.fecha_realizacion >= TRUNC(SYSDATE)
                 ORDER BY a.fecha_realizacion`;
    const result = await conn.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    handleError(res, err, 'Error obteniendo disponibilidad');
  } finally {
    await closeConn(conn);
  }
});

// GET /api/reservas-visita - listado (protegido)
router.get('/', verifyToken, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `SELECT * FROM vw_reservas_visita ORDER BY fecha_creacion DESC`,
      [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    handleError(res, err, 'Error obteniendo reservas de visita');
  } finally {
    await closeConn(conn);
  }
});

// POST /api/reservas-visita - crear reserva (protegido)
router.post('/', verifyToken, async (req, res) => {
  const id_reserva = parseInt(req.body.id_reserva, 10) || 1; // 1 = Reserva Nacional Pampa Galeras
  const id_turista = parseInt(req.body.id_turista, 10);
  const id_actividad = parseInt(req.body.id_actividad, 10);
  const num_personas = parseInt(req.body.num_personas, 10);
  if (!id_turista || !id_actividad || !num_personas) {
    return res.status(400).json({ error: 'Faltan campos: id_turista, id_actividad, num_personas' });
  }
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `BEGIN pkg_reservas.crear_reserva(:id_reserva, :id_turista, :id_actividad, :num_personas, :out_id); END;`,
      {
        id_reserva, id_turista, id_actividad, num_personas,
        out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      });
    res.status(201).json({ ok: true, id_reserva_visita: result.outBinds.out_id });
  } catch (err) {
    handleError(res, err, 'Error creando reserva de visita');
  } finally {
    await closeConn(conn);
  }
});

// PUT /api/reservas-visita/:id/confirmar (protegido)
router.put('/:id/confirmar', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  let conn;
  try {
    conn = await getConnection();
    await conn.execute(`BEGIN pkg_reservas.confirmar_reserva(:id); END;`, { id });
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, 'Error confirmando reserva');
  } finally {
    await closeConn(conn);
  }
});

// PUT /api/reservas-visita/:id/cancelar (protegido)
router.put('/:id/cancelar', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const motivo = req.body.motivo ? String(req.body.motivo).trim().slice(0, 300) : null;
  let conn;
  try {
    conn = await getConnection();
    await conn.execute(`BEGIN pkg_reservas.cancelar_reserva(:id, :motivo); END;`, { id, motivo });
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, 'Error cancelando reserva');
  } finally {
    await closeConn(conn);
  }
});

module.exports = router;
