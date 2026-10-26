import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { g, errMsg, fmtFechaLarga, HORARIOS } from '../utils'

const FORM_VACIO = { id_actividad: '', id_horario: '', id_turista: '', num_personas: 1 }
const FILTROS = [
  { id: 'proximas', label: 'Próximas' },
  { id: 'PENDIENTE', label: 'Pendientes' },
  { id: 'CONFIRMADA', label: 'Confirmadas' },
  { id: 'CANCELADA', label: 'Canceladas' },
  { id: 'todas', label: 'Todas' }
]

function pasaFiltro(r, filtro, fecha) {
  if (fecha && g(r, 'fecha_visita') !== fecha) return false
  if (filtro === 'todas') return true
  if (filtro === 'proximas') return !g(r, 'pasada') && g(r, 'estado') !== 'CANCELADA'
  return g(r, 'estado') === filtro
}

export default function ReservasVisita() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('rnpg_token') || '' : ''

  const [actividades, setActividades] = useState([])
  const [turistas, setTuristas] = useState([])
  const [reservas, setReservas] = useState([])
  const [rango, setRango] = useState({ hoy: '', maximo: '' })   // fechas permitidas (hora de Perú)
  const [fecha, setFecha] = useState('')                       // fecha de la visita en el formulario
  const [horarios, setHorarios] = useState([])                 // disponibilidad de esa fecha
  const [form, setForm] = useState(FORM_VACIO)
  const [filtro, setFiltro] = useState('proximas')
  const [filtroFecha, setFiltroFecha] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const cargarDisponibilidad = useCallback(async f => {
    const r = await axios.get('/api/reservas-visita/disponibilidad', { params: f ? { fecha: f } : {} })
    setRango({ hoy: r.data.hoy, maximo: r.data.maximo })
    setHorarios(r.data.rows || [])
    return r.data
  }, [])

  const cargarReservas = useCallback(async () => {
    if (!token) return
    const [t, r] = await Promise.all([axios.get('/api/turistas'), axios.get('/api/reservas-visita')])
    setTuristas(t.data.rows || [])
    setReservas(r.data.rows || [])
  }, [token])

  useEffect(() => {
    if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    ;(async () => {
      try {
        const [act, disp] = await Promise.all([axios.get('/api/actividades'), cargarDisponibilidad()])
        setActividades(act.data.rows || [])
        setFecha(disp.fecha)
        await cargarReservas()
      } catch (err) {
        setError('Error cargando datos: ' + errMsg(err))
      } finally {
        setLoading(false)
      }
    })()
  }, [token, cargarDisponibilidad, cargarReservas])

  function flash(msg) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 4000)
  }

  async function cambiarFecha(f) {
    setFecha(f)
    setForm(prev => ({ ...prev, id_horario: '' }))
    if (!f) { setHorarios([]); return }
    try {
      await cargarDisponibilidad(f)
    } catch (err) {
      alert('No se pudo consultar la disponibilidad: ' + errMsg(err))
    }
  }

  async function recargar() {
    try {
      await Promise.all([cargarReservas(), fecha ? cargarDisponibilidad(fecha) : null])
    } catch (err) {
      setError('Error actualizando datos: ' + errMsg(err))
    }
  }

  const actividad = actividades.find(a => String(g(a, 'id_actividad')) === String(form.id_actividad))
  const horariosActividad = horarios.filter(h => String(g(h, 'id_actividad')) === String(form.id_actividad))
  const horario = horariosActividad.find(h => String(g(h, 'id_horario')) === String(form.id_horario))
  const cupos = horario ? g(horario, 'cupos_disponibles') : null
  const costo = actividad ? Number(g(actividad, 'costo_soles') || 0) : 0
  const personas = parseInt(form.num_personas, 10) || 0
  const fueraDeRango = fecha && rango.hoy && (fecha < rango.hoy || fecha > rango.maximo)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!token) return alert('Debes iniciar sesión para reservar. Ve a /admin y haz login.')
    if (!form.id_horario) return alert('Elige un horario disponible')
    if (personas < 1) return alert('El número de personas debe ser mayor a 0')
    if (cupos !== null && personas > cupos) return alert(`Solo quedan ${cupos} cupos en ese horario`)

    setSubmitting(true)
    try {
      const r = await axios.post('/api/reservas-visita', {
        id_turista: form.id_turista,
        id_horario: form.id_horario,
        fecha_visita: fecha,
        num_personas: personas
      })
      flash(`✓ Reserva #${r.data.id_reserva_visita} registrada como pendiente`)
      setForm(FORM_VACIO)
      setFiltro('proximas')
    } catch (err) {
      alert('No se pudo reservar: ' + errMsg(err))
    } finally {
      setSubmitting(false)
      recargar()
    }
  }

  async function confirmar(id) {
    try {
      await axios.put(`/api/reservas-visita/${id}/confirmar`)
      flash(`✓ Reserva #${id} confirmada`)
    } catch (err) {
      alert('No se pudo confirmar: ' + errMsg(err))
    } finally {
      recargar()
    }
  }

  async function cancelar(id) {
    const motivo = window.prompt(`Motivo de cancelación de la reserva #${id} (opcional):`)
    if (motivo === null) return
    try {
      await axios.put(`/api/reservas-visita/${id}/cancelar`, { motivo })
      flash(`✓ Reserva #${id} cancelada; sus cupos quedaron libres`)
    } catch (err) {
      alert('No se pudo cancelar: ' + errMsg(err))
    } finally {
      recargar()
    }
  }

  if (loading) return <div className="page"><p>Cargando...</p></div>

  const visibles = reservas.filter(r => pasaFiltro(r, filtro, filtroFecha))
  const conteo = id => reservas.filter(r => pasaFiltro(r, id, filtroFecha)).length

  return (
    <div className="page actividades-page">
      <div className="page-header">
        <h1>🎟️ Reservas de visita</h1>
        <p className="muted">
          Las actividades se realizan todos los días a las {HORARIOS.join(', ')}, con cupo limitado por horario.
          Se puede reservar desde hoy hasta 60 días después.
        </p>
      </div>

      {error && <p className="error">{error}</p>}
      {successMsg && <div className="success-msg">{successMsg}</div>}

      <div className="crud-container">
        <div className="list-section">
          {!token ? (
            <div className="empty-state">
              <p>Inicia sesión desde <Link to="/admin">Admin</Link> para registrar y gestionar reservas.</p>
            </div>
          ) : (
            <>
              <div className="admin-tabs" role="tablist" aria-label="Filtrar reservas">
                {FILTROS.map(f => (
                  <button key={f.id} role="tab" aria-selected={filtro === f.id}
                    className={`tab-btn ${filtro === f.id ? 'active' : ''}`} onClick={() => setFiltro(f.id)}>
                    {f.label} ({conteo(f.id)})
                  </button>
                ))}
              </div>

              <div className="form-group filtro-fecha">
                <label htmlFor="filtro-fecha">Fecha de visita</label>
                <div className="filtro-fecha-controles">
                  <input id="filtro-fecha" type="date" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} />
                  {filtroFecha && <button type="button" className="btn btn-sm btn-secondary" onClick={() => setFiltroFecha('')}>Ver todas las fechas</button>}
                </div>
              </div>

              {visibles.length === 0 ? (
                <div className="empty-state">
                  <p>{reservas.length === 0 ? 'Aún no hay reservas. Registra la primera con el formulario.' : 'No hay reservas con este filtro.'}</p>
                </div>
              ) : (
                <div className="items-list">
                  {visibles.map(r => {
                    const id = g(r, 'id_reserva_visita')
                    const estado = g(r, 'estado')
                    const pasada = !!g(r, 'pasada')
                    return (
                      <div className={`item-card ${pasada ? 'reserva-pasada' : ''}`} key={id}>
                        <div className="item-header">
                          <div className="item-id">#{id}</div>
                          <div className="item-title">{g(r, 'actividad')}</div>
                          <div className={`item-badge reserva-${estado.toLowerCase()}`}>{estado}</div>
                        </div>
                        <div className="item-body">
                          <div className="info-row"><span className="label">Visita:</span>
                            <span className="value">{fmtFechaLarga(g(r, 'fecha_visita'))}, {g(r, 'hora_inicio')}</span></div>
                          <div className="info-row"><span className="label">Turista:</span>
                            <span className="value">{g(r, 'turista')}{g(r, 'dni') ? ` (DNI ${String(g(r, 'dni')).trim()})` : ''}</span></div>
                          <div className="info-row"><span className="label">Personas:</span><span className="value">{g(r, 'num_personas')}</span></div>
                          <div className="info-row"><span className="label">Monto:</span>
                            <span className="value cost">S/ {Number(g(r, 'monto_total') || 0).toFixed(2)}</span></div>
                          {estado === 'CANCELADA' && g(r, 'motivo_cancelacion') && (
                            <div className="info-row"><span className="label">Motivo:</span><span className="value">{g(r, 'motivo_cancelacion')}</span></div>
                          )}
                          <div className="info-row"><span className="label">Registrada:</span><span className="value">{g(r, 'registrada')}</span></div>
                        </div>
                        <div className="item-actions">
                          {pasada ? (
                            <span className="muted">Visita pasada: ya no se puede modificar</span>
                          ) : (
                            <>
                              {estado === 'PENDIENTE' && (
                                <button className="btn btn-sm btn-primary" onClick={() => confirmar(id)}>✅ Confirmar</button>
                              )}
                              {estado !== 'CANCELADA' && (
                                <button className="btn btn-sm btn-danger" onClick={() => cancelar(id)}>❌ Cancelar</button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <aside className="actividades-form-section">
          <div className="form-card">
            <h3>➕ Nueva reserva</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="rv-actividad">Actividad *</label>
                <select id="rv-actividad" value={form.id_actividad}
                  onChange={e => setForm(f => ({ ...f, id_actividad: e.target.value, id_horario: '' }))} required>
                  <option value="">Selecciona una actividad...</option>
                  {actividades.map(a => (
                    <option key={g(a, 'id_actividad')} value={g(a, 'id_actividad')}>
                      {g(a, 'nombre')} — S/ {Number(g(a, 'costo_soles') || 0).toFixed(2)}
                    </option>
                  ))}
                </select>
                {actividad && (
                  <p className="form-note">
                    {g(actividad, 'lugar') || 'Lugar por definir'}
                    {g(actividad, 'duracion_min') ? `, ${g(actividad, 'duracion_min')} min` : ''}, S/ {costo.toFixed(2)} por persona
                  </p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="rv-fecha">Fecha de la visita *</label>
                <input id="rv-fecha" type="date" value={fecha} min={rango.hoy} max={rango.maximo}
                  onChange={e => cambiarFecha(e.target.value)} required />
                {fecha && !fueraDeRango && <p className="form-note">{fmtFechaLarga(fecha)}</p>}
                {fueraDeRango && <p className="error">Elige una fecha entre hoy y los próximos 60 días.</p>}
              </div>

              <fieldset className="form-group horarios-opciones" disabled={!form.id_actividad || !fecha || fueraDeRango}>
                <legend>Horario *</legend>
                {!form.id_actividad ? (
                  <p className="form-note">Primero elige una actividad.</p>
                ) : horariosActividad.length === 0 ? (
                  <p className="form-note">Esta actividad no tiene horarios para la fecha elegida.</p>
                ) : horariosActividad.map(h => {
                  const id = g(h, 'id_horario')
                  const libres = g(h, 'cupos_disponibles')
                  const vigente = !!g(h, 'vigente')
                  const habilitado = vigente && libres > 0
                  return (
                    <label key={id} className={`horario-opcion ${String(form.id_horario) === String(id) ? 'seleccionado' : ''} ${habilitado ? '' : 'no-disponible'}`}>
                      <input type="radio" name="horario" value={id} disabled={!habilitado}
                        checked={String(form.id_horario) === String(id)}
                        onChange={() => setForm(f => ({ ...f, id_horario: id }))} />
                      <span className="horario-hora">{g(h, 'hora_inicio')}</span>
                      <span className="horario-cupos">
                        {!vigente ? 'Ya pasó' : libres > 0 ? `${libres} de ${g(h, 'cupo_maximo')} cupos` : 'Agotado'}
                      </span>
                    </label>
                  )
                })}
              </fieldset>

              <div className="form-group">
                <label htmlFor="rv-turista">Turista *</label>
                <select id="rv-turista" value={form.id_turista} onChange={e => setForm(f => ({ ...f, id_turista: e.target.value }))} required disabled={!token}>
                  <option value="">Selecciona un turista...</option>
                  {turistas.map(t => (
                    <option key={g(t, 'id_turista')} value={g(t, 'id_turista')}>
                      {g(t, 'nombre')} {g(t, 'apellido') || ''}{g(t, 'dni') ? ` — DNI ${String(g(t, 'dni')).trim()}` : ''}
                    </option>
                  ))}
                </select>
                <Link to="/turistas" className="btn btn-sm btn-secondary">+ Registrar turista nuevo</Link>
              </div>

              <div className="form-group">
                <label htmlFor="rv-personas">Número de personas *</label>
                <input id="rv-personas" type="number" min="1" max={cupos > 0 ? cupos : undefined} value={form.num_personas}
                  onChange={e => setForm(f => ({ ...f, num_personas: e.target.value }))} required />
              </div>

              {horario && (
                <div className="info-row">
                  <span className="label">Total a pagar</span>
                  <span className="value cost">S/ {(costo * personas).toFixed(2)}</span>
                </div>
              )}

              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={submitting || !token || !form.id_horario}>
                  {submitting ? '⏳ Reservando...' : '✅ Reservar'}
                </button>
              </div>
              {!token && <p className="form-note">Inicia sesión desde Admin para reservar.</p>}
            </form>
          </div>
        </aside>
      </div>
    </div>
  )
}
