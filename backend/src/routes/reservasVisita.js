const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { getConnection, AHORA_LIMA, HOY_LIMA } = require('../db');
const { verifyToken } = require('../middleware/auth');

const OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const ESTADOS_ACTIVOS = `('PENDIENTE','CONFIRMADA')`;
const ESTADOS = ['PENDIENTE', 'CONFIRMADA', 'CANCELADA'];
const DIAS_MAXIMOS = 60; // se puede reservar desde hoy hasta 60 días después

// Fecha + hora exacta de la visita. fecha = expresión DATE, h = alias de HORARIO_ACTIVIDAD
const visitaDt = fecha => `TO_DATE(TO_CHAR(${fecha}, 'YYYY-MM-DD') || ' ' || h.hora_inicio, 'YYYY-MM-DD HH24:MI')`;

// Error de regla de negocio -> HTTP 400 con mensaje claro
class ReglaNegocio extends Error {}

// 'AAAA-MM-DD' y además una fecha real (descarta 2026-02-31)
function esFecha(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function handleError(res, err, fallbackMsg) {
  if (err instanceof ReglaNegocio) return res.status(400).json({ error: err.message });
  if (err.errorNum === 1) {
    return res.status(400).json({ error: 'El turista ya tiene una reserva activa en ese horario y fecha.' });
  }
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
// Transacción: crear reserva para un horario en una fecha
// Tablas: RESERVA, TURISTA, HORARIO_ACTIVIDAD (bloqueo) + ACTIVIDAD,
//         RESERVA_VISITA, TURISTA_ACTIVIDAD, AUDITORIA_RESERVA
// El COMMIT / ROLLBACK lo hace transaccion().
// ---------------------------------------------------------------
async function crearReserva(conn, { id_reserva, id_turista, id_horario, fecha_visita, num_personas }) {
  if (!(await existe(conn, `SELECT COUNT(*) AS n FROM RESERVA WHERE id_reserva = :id`, { id: id_reserva }))) {
    throw new ReglaNegocio('La reserva natural indicada no existe.');
  }
  if (!(await existe(conn, `SELECT COUNT(*) AS n FROM TURISTA WHERE id_turista = :id`, { id: id_turista }))) {
    throw new ReglaNegocio('El turista indicado no existe.');
  }

  // Bloquea la fila del horario: serializa reservas concurrentes sobre ese horario (evita sobreventa)
  const hor = await conn.execute(
    `SELECT h.cupo_maximo, NVL(a.costo_soles, 0) AS costo,
            CASE WHEN ${visitaDt(`TO_DATE(:fecha, 'YYYY-MM-DD')`)} <= ${AHORA_LIMA} THEN 1 ELSE 0 END AS pasado,
            CASE WHEN TO_DATE(:fecha, 'YYYY-MM-DD') > ${HOY_LIMA} + ${DIAS_MAXIMOS} THEN 1 ELSE 0 END AS muy_lejos
     FROM HORARIO_ACTIVIDAD h
     JOIN ACTIVIDAD a ON a.id_actividad = h.id_actividad
     WHERE h.id_horario = :id
     FOR UPDATE OF h.cupo_maximo`,
    { id: id_horario, fecha: fecha_visita }, OBJ);
  if (hor.rows.length === 0) throw new ReglaNegocio('El horario indicado no existe.');
  const { CUPO_MAXIMO, COSTO, PASADO, MUY_LEJOS } = hor.rows[0];
  if (PASADO) throw new ReglaNegocio('Ese horario ya pasó. Elige otra fecha u horario.');
  if (MUY_LEJOS) throw new ReglaNegocio(`Solo se puede reservar hasta ${DIAS_MAXIMOS} días antes.`);

  if (await existe(conn,
    `SELECT COUNT(*) AS n FROM RESERVA_VISITA
     WHERE id_turista = :t AND id_horario = :h AND fecha_visita = TO_DATE(:f, 'YYYY-MM-DD')
       AND estado IN ${ESTADOS_ACTIVOS}`,
    { t: id_turista, h: id_horario, f: fecha_visita })) {
    throw new ReglaNegocio('El turista ya tiene una reserva activa en ese horario y fecha.');
  }

  const oc = await conn.execute(
    `SELECT NVL(SUM(num_personas), 0) AS ocupados FROM RESERVA_VISITA
     WHERE id_horario = :h AND fecha_visita = TO_DATE(:f, 'YYYY-MM-DD') AND estado IN ${ESTADOS_ACTIVOS}`,
    { h: id_horario, f: fecha_visita }, OBJ);
  const disponibles = CUPO_MAXIMO - oc.rows[0].OCUPADOS;
  if (num_personas > disponibles) {
    throw new ReglaNegocio(disponibles > 0
      ? `Cupos insuficientes en ese horario. Disponibles: ${disponibles}`
      : 'Ese horario ya no tiene cupos para la fecha elegida.');
  }

  const ins = await conn.execute(
    `INSERT INTO RESERVA_VISITA (id_reserva, id_turista, id_horario, fecha_visita, num_personas, monto_total, estado)
     VALUES (:id_reserva, :id_turista, :id_horario, TO_DATE(:fecha, 'YYYY-MM-DD'), :num_personas, :monto, 'PENDIENTE')
     RETURNING id_reserva_visita INTO :out_id`,
    {
      id_reserva, id_turista, id_horario, fecha: fecha_visita, num_personas,
      monto: COSTO * num_personas,
      out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    });
  const idReservaVisita = ins.outBinds.out_id[0];

  // Registra o reactiva la participación del turista (fecha y hora de la visita)
  await conn.execute(
    `MERGE INTO TURISTA_ACTIVIDAD ta
     USING (SELECT :id_turista AS id_turista, h.id_actividad,
                   ${visitaDt(`TO_DATE(:fecha, 'YYYY-MM-DD')`)} AS fecha
            FROM HORARIO_ACTIVIDAD h
            WHERE h.id_horario = :id_horario) s
     ON (ta.id_turista = s.id_turista AND ta.id_actividad = s.id_actividad AND ta.fecha_participacion = s.fecha)
     WHEN MATCHED THEN UPDATE SET ta.estado = 'pendiente'
     WHEN NOT MATCHED THEN INSERT (id_turista, id_actividad, fecha_participacion, estado)
          VALUES (s.id_turista, s.id_actividad, s.fecha, 'pendiente')`,
    { id_turista, id_horario, fecha: fecha_visita });

  await auditar(conn, idReservaVisita, 'CREAR', null, 'PENDIENTE');
  return idReservaVisita;
}

// Cambia el estado de la reserva y de la participación del turista
async function cambiarEstado(conn, id, { desde, hacia, operacion, estadoParticipacion, motivo }) {
  const r = await conn.execute(
    `SELECT rv.estado, rv.id_turista, rv.id_horario, TO_CHAR(rv.fecha_visita, 'YYYY-MM-DD') AS fecha,
            CASE WHEN ${visitaDt('rv.fecha_visita')} <= ${AHORA_LIMA} THEN 1 ELSE 0 END AS pasada
     FROM RESERVA_VISITA rv
     JOIN HORARIO_ACTIVIDAD h ON h.id_horario = rv.id_horario
     WHERE rv.id_reserva_visita = :id
     FOR UPDATE OF rv.estado`,
    { id }, OBJ);
  if (r.rows.length === 0) throw new ReglaNegocio('La reserva de visita no existe.');
  const { ESTADO, ID_TURISTA, ID_HORARIO, FECHA, PASADA } = r.rows[0];

  if (!desde.includes(ESTADO)) {
    throw new ReglaNegocio(
      hacia === 'CONFIRMADA'
        ? `Solo se puede confirmar una reserva PENDIENTE (estado actual: ${ESTADO}).`
        : 'La reserva ya está cancelada.');
  }
  if (PASADA) throw new ReglaNegocio('La fecha y hora de esta visita ya pasaron; la reserva no se puede modificar.');

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
           (SELECT h.id_actividad, ${visitaDt(`TO_DATE(:f, 'YYYY-MM-DD')`)}
            FROM HORARIO_ACTIVIDAD h
            WHERE h.id_horario = :h)`,
    { est: estadoParticipacion, t: ID_TURISTA, h: ID_HORARIO, f: FECHA });

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

// GET /api/reservas-visita/disponibilidad?fecha=AAAA-MM-DD (público)
// Horarios de todas las actividades para ese día, con sus cupos libres.
// Sin fecha se usa la de hoy.
router.get('/disponibilidad', async (req, res) => {
  const fecha = req.query.fecha;
  if (fecha !== undefined && !esFecha(fecha)) {
    return res.status(400).json({ error: 'La fecha debe tener el formato AAAA-MM-DD' });
  }
  let conn;
  try {
    conn = await getConnection();
    const dia = fecha ? `TO_DATE(:fecha, 'YYYY-MM-DD')` : HOY_LIMA;
    const binds = fecha ? { fecha } : {};
    const rango = await conn.execute(
      `SELECT TO_CHAR(${HOY_LIMA}, 'YYYY-MM-DD') AS hoy,
              TO_CHAR(${HOY_LIMA} + ${DIAS_MAXIMOS}, 'YYYY-MM-DD') AS maximo,
              TO_CHAR(${dia}, 'YYYY-MM-DD') AS fecha,
              CASE WHEN ${dia} < ${HOY_LIMA} OR ${dia} > ${HOY_LIMA} + ${DIAS_MAXIMOS} THEN 0 ELSE 1 END AS en_rango
       FROM dual`, binds, OBJ);
    const info = rango.rows[0];
    if (!info.EN_RANGO) {
      return res.json({ ok: true, fecha: info.FECHA, hoy: info.HOY, maximo: info.MAXIMO, rows: [] });
    }
    const result = await conn.execute(
      `SELECT h.id_horario, a.id_actividad, a.nombre, a.tipo, a.lugar, a.descripcion,
              a.duracion_min, a.costo_soles, h.hora_inicio, h.cupo_maximo,
              h.cupo_maximo - NVL(o.personas_reservadas, 0) AS cupos_disponibles,
              CASE WHEN ${visitaDt(dia)} > ${AHORA_LIMA} THEN 1 ELSE 0 END AS vigente
       FROM HORARIO_ACTIVIDAD h
       JOIN ACTIVIDAD a ON a.id_actividad = h.id_actividad
       LEFT JOIN vw_ocupacion_horario o ON o.id_horario = h.id_horario AND o.fecha_visita = ${dia}
       ORDER BY a.nombre, h.hora_inicio`, binds, OBJ);
    res.json({ ok: true, fecha: info.FECHA, hoy: info.HOY, maximo: info.MAXIMO, rows: result.rows });
  } catch (err) {
    handleError(res, err, 'Error obteniendo disponibilidad');
  } finally {
    await closeConn(conn);
  }
});

// GET /api/reservas-visita?estado=PENDIENTE&fecha=AAAA-MM-DD (protegido)
router.get('/', verifyToken, async (req, res) => {
  const { estado, fecha } = req.query;
  if (estado && !ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  if (fecha && !esFecha(fecha)) return res.status(400).json({ error: 'La fecha debe tener el formato AAAA-MM-DD' });
  const filtros = [];
  const binds = {};
  if (estado) { filtros.push('v.estado = :estado'); binds.estado = estado; }
  if (fecha) { filtros.push(`v.fecha_visita = TO_DATE(:fecha, 'YYYY-MM-DD')`); binds.fecha = fecha; }
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `SELECT v.id_reserva_visita, v.turista, v.dni, v.actividad, v.lugar, v.hora_inicio,
              v.num_personas, v.monto_total, v.estado, v.motivo_cancelacion,
              TO_CHAR(v.fecha_visita, 'YYYY-MM-DD') AS fecha_visita,
              TO_CHAR(v.fecha_creacion, 'DD/MM/YYYY HH24:MI') AS registrada,
              CASE WHEN TO_DATE(TO_CHAR(v.fecha_visita, 'YYYY-MM-DD') || ' ' || v.hora_inicio, 'YYYY-MM-DD HH24:MI')
                        <= ${AHORA_LIMA} THEN 1 ELSE 0 END AS pasada
       FROM vw_reservas_visita v
       ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''}
       ORDER BY v.fecha_visita DESC, v.hora_inicio, v.id_reserva_visita DESC`, binds, OBJ);
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
    fecha_visita: req.body.fecha_visita,
    num_personas: parseInt(req.body.num_personas, 10)
  };
  if (!datos.id_turista || !datos.id_horario || !(datos.num_personas >= 1) || !esFecha(datos.fecha_visita)) {
    return res.status(400).json({ error: 'Faltan campos: id_turista, id_horario, fecha_visita (AAAA-MM-DD), num_personas (mayor a 0)' });
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
