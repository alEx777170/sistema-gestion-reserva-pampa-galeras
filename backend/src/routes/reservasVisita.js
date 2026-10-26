const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { getConnection } = require('../db');
const { verifyToken } = require('../middleware/auth');

const OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const ESTADOS_ACTIVOS = `('PENDIENTE','CONFIRMADA')`;
// Fecha y hora exacta de la visita (fecha de la actividad + hora del horario). Alias: a = ACTIVIDAD, h = HORARIO_ACTIVIDAD
const VISITA_DT = `TO_DATE(TO_CHAR(a.fecha_realizacion, 'YYYY-MM-DD') || ' ' || h.hora_inicio, 'YYYY-MM-DD HH24:MI')`;

// Error de regla de negocio -> HTTP 400 con mensaje claro
class ReglaNegocio extends Error {}

function handleError(res, err, fallbackMsg) {
  if (err instanceof ReglaNegocio) return res.status(400).json({ error: err.message });
  console.error(fallbackMsg, err.message);
  return res.status(500).json({ error: fallbackMsg, details: err.message });
}

async function closeConn(conn) {
  if (conn) try { await conn.close(); } catch (e) {}
}

async function existe(conn, sql, binds) {
  const r = await conn.execute(sql, binds, OBJ);
  return r.rows[0].N > 0;
}

async function auditar(conn, id, operacion, anterior, nuevo) {
  await conn.execute(
    `INSERT INTO AUDITORIA_RESERVA (id_reserva_visita, operacion, estado_anterior, estado_nuevo)
     VALUES (:id, :operacion, :anterior, :nuevo)`,
    { id, operacion, anterior, nuevo });
}

// ---------------------------------------------------------------
// Transacción: crear reserva sobre un horario de una actividad
// Tablas: RESERVA, TURISTA, HORARIO_ACTIVIDAD (bloqueo) + ACTIVIDAD,
//         RESERVA_VISITA, TURISTA_ACTIVIDAD, AUDITORIA_RESERVA
// El COMMIT / ROLLBACK lo hace el endpoint que llama a esta función.
// ---------------------------------------------------------------
async function crearReserva(conn, { id_reserva, id_turista, id_horario, num_personas }) {
  if (!(await existe(conn, `SELECT COUNT(*) AS n FROM RESERVA WHERE id_reserva = :id`, { id: id_reserva }))) {
    throw new ReglaNegocio('La reserva natural indicada no existe.');
  }
  if (!(await existe(conn, `SELECT COUNT(*) AS n FROM TURISTA WHERE id_turista = :id`, { id: id_turista }))) {
    throw new ReglaNegocio('El turista indicado no existe.');
  }

  // Bloquea la fila del horario: serializa reservas concurrentes sobre ese horario (evita sobreventa)
  const hor = await conn.execute(
    `SELECT h.cupo_maximo, NVL(a.costo_soles, 0) AS costo,
            CASE WHEN ${VISITA_DT} > SYSDATE THEN 1 ELSE 0 END AS vigente
     FROM HORARIO_ACTIVIDAD h
     JOIN ACTIVIDAD a ON a.id_actividad = h.id_actividad
     WHERE h.id_horario = :id
     FOR UPDATE OF h.cupo_maximo`,
    { id: id_horario }, OBJ);
  if (hor.rows.length === 0) throw new ReglaNegocio('El horario indicado no existe.');
  const { CUPO_MAXIMO, COSTO, VIGENTE } = hor.rows[0];
  if (!VIGENTE) throw new ReglaNegocio('Ese horario ya pasó o no tiene fecha disponible.');

  if (await existe(conn,
    `SELECT COUNT(*) AS n FROM RESERVA_VISITA
     WHERE id_turista = :t AND id_horario = :h AND estado IN ${ESTADOS_ACTIVOS}`,
    { t: id_turista, h: id_horario })) {
    throw new ReglaNegocio('El turista ya tiene una reserva activa para ese horario.');
  }

  const oc = await conn.execute(
    `SELECT NVL(SUM(num_personas), 0) AS ocupados FROM RESERVA_VISITA
     WHERE id_horario = :h AND estado IN ${ESTADOS_ACTIVOS}`,
    { h: id_horario }, OBJ);
  const disponibles = CUPO_MAXIMO - oc.rows[0].OCUPADOS;
  if (num_personas > disponibles) {
    throw new ReglaNegocio(`Cupos insuficientes en ese horario. Disponibles: ${disponibles}`);
  }

  const ins = await conn.execute(
    `INSERT INTO RESERVA_VISITA (id_reserva, id_turista, id_horario, num_personas, monto_total, estado)
     VALUES (:id_reserva, :id_turista, :id_horario, :num_personas, :monto, 'PENDIENTE')
     RETURNING id_reserva_visita INTO :out_id`,
    {
      id_reserva, id_turista, id_horario, num_personas,
      monto: COSTO * num_personas,
      out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    });
  const idReservaVisita = ins.outBinds.out_id[0];

  // Registra o reactiva la participación del turista (fecha y hora de la visita)
  await conn.execute(
    `MERGE INTO TURISTA_ACTIVIDAD ta
     USING (SELECT :id_turista AS id_turista, a.id_actividad, ${VISITA_DT} AS fecha
            FROM HORARIO_ACTIVIDAD h JOIN ACTIVIDAD a ON a.id_actividad = h.id_actividad
            WHERE h.id_horario = :id_horario) s
     ON (ta.id_turista = s.id_turista AND ta.id_actividad = s.id_actividad AND ta.fecha_participacion = s.fecha)
     WHEN MATCHED THEN UPDATE SET ta.estado = 'pendiente'
     WHEN NOT MATCHED THEN INSERT (id_turista, id_actividad, fecha_participacion, estado)
          VALUES (s.id_turista, s.id_actividad, s.fecha, 'pendiente')`,
    { id_turista, id_horario });

  await auditar(conn, idReservaVisita, 'CREAR', null, 'PENDIENTE');
  return idReservaVisita;
}

// Cambia el estado de la reserva y de la participación del turista
async function cambiarEstado(conn, id, { desde, hacia, operacion, estadoParticipacion, motivo }) {
  const r = await conn.execute(
    `SELECT estado, id_turista, id_horario FROM RESERVA_VISITA
     WHERE id_reserva_visita = :id FOR UPDATE`,
    { id }, OBJ);
  if (r.rows.length === 0) throw new ReglaNegocio('La reserva de visita no existe.');
  const { ESTADO, ID_TURISTA, ID_HORARIO } = r.rows[0];

  if (!desde.includes(ESTADO)) {
    throw new ReglaNegocio(
      hacia === 'CONFIRMADA'
        ? `Solo se puede confirmar una reserva PENDIENTE (estado actual: ${ESTADO}).`
        : 'La reserva ya está cancelada.');
  }

  const col = hacia === 'CONFIRMADA' ? 'fecha_confirmacion' : 'fecha_cancelacion';
  await conn.execute(
    `UPDATE RESERVA_VISITA
     SET estado = :hacia, ${col} = SYSTIMESTAMP, motivo_cancelacion = NVL(:motivo, motivo_cancelacion)
     WHERE id_reserva_visita = :id`,
    { hacia, motivo: motivo || null, id });

  await conn.execute(
    `UPDATE TURISTA_ACTIVIDAD
     SET estado = :est
     WHERE id_turista = :t
       AND (id_actividad, fecha_participacion) IN
           (SELECT a.id_actividad, ${VISITA_DT}
            FROM HORARIO_ACTIVIDAD h JOIN ACTIVIDAD a ON a.id_actividad = h.id_actividad
            WHERE h.id_horario = :h)`,
    { est: estadoParticipacion, t: ID_TURISTA, h: ID_HORARIO });

  await auditar(conn, id, operacion, ESTADO, hacia);
}

// Ejecuta una transacción: COMMIT si todo sale bien, ROLLBACK si algo falla
async function transaccion(res, fallbackMsg, fn, onOk) {
  let conn;
  try {
    conn = await getConnection();
    const resultado = await fn(conn);
    await conn.commit();
    onOk(resultado);
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch (e) {}
    handleError(res, err, fallbackMsg);
  } finally {
    await closeConn(conn);
  }
}

// GET /api/reservas-visita/disponibilidad - horarios futuros con cupos (público)
router.get('/disponibilidad', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const sql = `SELECT h.id_horario, a.id_actividad, a.nombre, a.tipo, a.lugar, a.descripcion,
                        a.duracion_min, a.costo_soles,
                        TO_CHAR(a.fecha_realizacion, 'YYYY-MM-DD') AS fecha_actividad,
                        h.hora_inicio, h.cupo_maximo,
                        h.cupo_maximo - NVL((SELECT SUM(rv.num_personas) FROM RESERVA_VISITA rv
                                             WHERE rv.id_horario = h.id_horario
                                               AND rv.estado IN ${ESTADOS_ACTIVOS}), 0) AS cupos_disponibles
                 FROM HORARIO_ACTIVIDAD h
                 JOIN ACTIVIDAD a ON a.id_actividad = h.id_actividad
                 WHERE ${VISITA_DT} > SYSDATE
                 ORDER BY a.fecha_realizacion, a.nombre, h.hora_inicio`;
    const result = await conn.execute(sql, [], OBJ);
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
      `SELECT v.*,
              TO_CHAR(v.fecha_realizacion, 'DD/MM/YYYY') AS fecha_visita,
              TO_CHAR(v.fecha_creacion, 'DD/MM/YYYY HH24:MI') AS registrada
       FROM vw_reservas_visita v
       ORDER BY v.fecha_creacion DESC`, [], OBJ);
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    handleError(res, err, 'Error obteniendo reservas de visita');
  } finally {
    await closeConn(conn);
  }
});

// POST /api/reservas-visita - crear reserva (protegido)
router.post('/', verifyToken, (req, res) => {
  const datos = {
    id_reserva: parseInt(req.body.id_reserva, 10) || 1, // 1 = Reserva Nacional Pampa Galeras
    id_turista: parseInt(req.body.id_turista, 10),
    id_horario: parseInt(req.body.id_horario, 10),
    num_personas: parseInt(req.body.num_personas, 10)
  };
  if (!datos.id_turista || !datos.id_horario || !(datos.num_personas >= 1)) {
    return res.status(400).json({ error: 'Faltan campos: id_turista, id_horario, num_personas (mayor a 0)' });
  }
  transaccion(res, 'Error creando reserva de visita',
    conn => crearReserva(conn, datos),
    id => res.status(201).json({ ok: true, id_reserva_visita: id }));
});

// PUT /api/reservas-visita/:id/confirmar (protegido)
router.put('/:id/confirmar', verifyToken, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  transaccion(res, 'Error confirmando reserva',
    conn => cambiarEstado(conn, id, {
      desde: ['PENDIENTE'], hacia: 'CONFIRMADA', operacion: 'CONFIRMAR', estadoParticipacion: 'confirmado'
    }),
    () => res.json({ ok: true }));
});

// PUT /api/reservas-visita/:id/cancelar (protegido) - libera los cupos
router.put('/:id/cancelar', verifyToken, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const motivo = req.body.motivo ? String(req.body.motivo).trim().slice(0, 300) : null;
  transaccion(res, 'Error cancelando reserva',
    conn => cambiarEstado(conn, id, {
      desde: ['PENDIENTE', 'CONFIRMADA'], hacia: 'CANCELADA', operacion: 'CANCELAR',
      estadoParticipacion: 'cancelado', motivo
    }),
    () => res.json({ ok: true }));
});

module.exports = router;
