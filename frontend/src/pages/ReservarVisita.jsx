import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

// Oracle devuelve las columnas en MAYÚSCULAS; se acepta ambas formas
const g = (o, k) => o?.[k.toUpperCase()] ?? o?.[k]
// Las fechas llegan como texto 'AAAA-MM-DD' (sin zona horaria) y se muestran como dd/mm/aaaa
const fmtFecha = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—')
const errMsg = err => err?.response?.data?.error || err.message

export default function ReservarVisita() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('rnpg_token') || '' : ''

  const [horarios, setHorarios] = useState([]) // una fila por horario (actividad + hora + cupos)
  const [turistas, setTuristas] = useState([])
  const [reservas, setReservas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ id_actividad: '', id_horario: '', id_turista: '', num_personas: 1 })

  const cargar = useCallback(async () => {
    setError('')
    try {
      const disp = await axios.get('/api/reservas-visita/disponibilidad')
      setHorarios(disp.data.rows || [])
      if (token) {
        const [t, r] = await Promise.all([
          axios.get('/api/turistas'),
          axios.get('/api/reservas-visita')
        ])
        setTuristas(t.data.rows || [])
        setReservas(r.data.rows || [])
      }
    } catch (err) {
      setError('Error cargando datos: ' + errMsg(err))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    cargar()
  }, [token, cargar])

  function flash(msg) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 4000)
  }

  // Actividades únicas (cada una con sus horarios)
  const actividades = []
  horarios.forEach(h => {
    const id = g(h, 'id_actividad')
    if (!actividades.find(a => g(a, 'id_actividad') === id)) actividades.push(h)
  })
  const horariosDeActividad = horarios.filter(h => String(g(h, 'id_actividad')) === String(form.id_actividad))
  const actividad = actividades.find(a => String(g(a, 'id_actividad')) === String(form.id_actividad))
  const horario = horariosDeActividad.find(h => String(g(h, 'id_horario')) === String(form.id_horario))

  const cupos = horario ? g(horario, 'cupos_disponibles') : null
  const costo = actividad ? Number(g(actividad, 'costo_soles') || 0) : 0
  const personas = parseInt(form.num_personas, 10) || 0
  const montoEstimado = costo * personas

  async function handleSubmit(e) {
    e.preventDefault()
    if (!token) return alert('Debes iniciar sesión para reservar. Ve a /admin y haz login.')
    if (personas < 1) return alert('El número de personas debe ser mayor a 0')
    if (cupos !== null && personas > cupos) return alert(`Solo quedan ${cupos} cupos en ese horario`)

    setSubmitting(true)
    try {
      const r = await axios.post('/api/reservas-visita', {
        id_turista: form.id_turista,
        id_horario: form.id_horario,
        num_personas: personas
      })
      flash(`✓ Reserva #${r.data.id_reserva_visita} creada (PENDIENTE)`)
      setForm({ id_actividad: '', id_horario: '', id_turista: '', num_personas: 1 })
    } catch (err) {
      alert('No se pudo reservar: ' + errMsg(err))
    } finally {
      setSubmitting(false)
      cargar()
    }
  }

  async function confirmar(id) {
    try {
      await axios.put(`/api/reservas-visita/${id}/confirmar`)
      flash(`✓ Reserva #${id} confirmada`)
    } catch (err) {
      alert('Error confirmando: ' + errMsg(err))
    } finally {
      cargar()
    }
  }

  async function cancelar(id) {
    const motivo = window.prompt(`Motivo de cancelación de la reserva #${id} (opcional):`)
    if (motivo === null) return
    try {
      await axios.put(`/api/reservas-visita/${id}/cancelar`, { motivo })
      flash(`✓ Reserva #${id} cancelada. Cupos liberados.`)
    } catch (err) {
      alert('Error cancelando: ' + errMsg(err))
    } finally {
      cargar()
    }
  }

  if (loading) return <div className="page"><p>Cargando...</p></div>

  return (
    <div className="page actividades-page">
      <div className="page-header">
        <h1>🎟️ Reservar visita</h1>
        <p className="muted">Reserva una actividad y un horario en la Reserva Nacional Pampa Galeras. Requiere autenticación.</p>
      </div>

      {error && <p className="error">{error}</p>}
      {successMsg && <div className="success-msg">{successMsg}</div>}

      <div className="crud-container">
        <div className="list-section">
          <h2>Reservas de visita ({reservas.length})</h2>

          {!token ? (
            <div className="empty-state">
              <p>Inicia sesión desde <Link to="/admin">Admin</Link> para ver y gestionar reservas.</p>
            </div>
          ) : reservas.length === 0 ? (
            <div className="empty-state"><p>Aún no hay reservas. Crea una con el formulario.</p></div>
          ) : (
            <div className="items-list">
              {reservas.map(r => {
                const id = g(r, 'id_reserva_visita')
                const estado = g(r, 'estado')
                return (
                  <div className="item-card" key={id}>
                    <div className="item-header">
                      <div className="item-id">#{id}</div>
                      <div className="item-title">{g(r, 'actividad')}</div>
                      <div className="item-badge">{estado}</div>
                    </div>
                    <div className="item-body">
                      <div className="info-row"><span className="label">Turista:</span><span className="value">{g(r, 'turista')} {g(r, 'dni') ? `(DNI ${String(g(r, 'dni')).trim()})` : ''}</span></div>
                      <div className="info-row"><span className="label">Visita:</span><span className="value">{g(r, 'fecha_visita')} a las {g(r, 'hora_inicio')}</span></div>
                      <div className="info-row"><span className="label">Personas:</span><span className="value">{g(r, 'num_personas')}</span></div>
                      <div className="info-row"><span className="label">Monto:</span><span className="value cost">S/ {Number(g(r, 'monto_total') || 0).toFixed(2)}</span></div>
                      <div className="info-row"><span className="label">Registrada:</span><span className="value">{g(r, 'registrada')}</span></div>
                    </div>
                    <div className="item-actions">
                      {estado === 'PENDIENTE' && (
                        <button className="btn btn-sm btn-primary" onClick={() => confirmar(id)}>✅ Confirmar</button>
                      )}
                      {estado !== 'CANCELADA' && (
                        <button className="btn btn-sm btn-danger" onClick={() => cancelar(id)}>❌ Cancelar</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <aside className="actividades-form-section">
          <div className="form-card">
            <h3>➕ Nueva reserva</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Actividad *</label>
                <select value={form.id_actividad} onChange={e => setForm(f => ({ ...f, id_actividad: e.target.value, id_horario: '' }))} required>
                  <option value="">Selecciona una actividad...</option>
                  {actividades.map(a => (
                    <option key={g(a, 'id_actividad')} value={g(a, 'id_actividad')}>
                      {g(a, 'nombre')} — {fmtFecha(g(a, 'fecha_actividad'))}
                    </option>
                  ))}
                </select>
                {actividades.length === 0 && <p className="muted">No hay actividades con horarios futuros.</p>}
              </div>

              {actividad && (
                <div className="form-group">
                  {g(actividad, 'descripcion') && (
                    <p className="muted" style={{ margin: '0 0 0.5rem', lineHeight: 1.5 }}>{g(actividad, 'descripcion')}</p>
                  )}
                  <p className="muted" style={{ margin: 0 }}>
                    {g(actividad, 'lugar') || '—'} · {g(actividad, 'duracion_min') || '—'} min · S/ {costo.toFixed(2)} por persona
                  </p>
                </div>
              )}

              <div className="form-group">
                <label>Horario *</label>
                <select value={form.id_horario} onChange={e => setForm(f => ({ ...f, id_horario: e.target.value }))} required disabled={!form.id_actividad}>
                  <option value="">{form.id_actividad ? 'Selecciona un horario...' : 'Primero elige una actividad'}</option>
                  {horariosDeActividad.map(h => {
                    const c = g(h, 'cupos_disponibles')
                    return (
                      <option key={g(h, 'id_horario')} value={g(h, 'id_horario')} disabled={c <= 0}>
                        {g(h, 'hora_inicio')} — {c > 0 ? `${c} cupos disponibles` : 'agotado'}
                      </option>
                    )
                  })}
                </select>
              </div>

              <div className="form-group">
                <label>Turista *</label>
                <select value={form.id_turista} onChange={e => setForm(f => ({ ...f, id_turista: e.target.value }))} required>
                  <option value="">Selecciona un turista...</option>
                  {turistas.map(t => (
                    <option key={g(t, 'id_turista')} value={g(t, 'id_turista')}>
                      {g(t, 'nombre')} {g(t, 'apellido') || ''} {g(t, 'dni') ? `— ${String(g(t, 'dni')).trim()}` : ''}
                    </option>
                  ))}
                </select>
                <Link to="/turistas" className="btn btn-sm btn-secondary">+ Registrar turista nuevo</Link>
              </div>

              <div className="form-group">
                <label>Número de personas *</label>
                <input type="number" min="1" max={cupos > 0 ? cupos : undefined} value={form.num_personas} onChange={e => setForm(f => ({ ...f, num_personas: e.target.value }))} required />
              </div>

              {horario && (
                <div className="info-row">
                  <span className="label">Cupos: {cupos}</span>
                  <span className="value cost">Total: S/ {montoEstimado.toFixed(2)}</span>
                </div>
              )}

              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={submitting || !token}>
                  {submitting ? '⏳ Reservando...' : '✅ Reservar'}
                </button>
              </div>
              {!token && <p className="muted">Inicia sesión desde Admin para reservar.</p>}
            </form>
          </div>
        </aside>
      </div>
    </div>
  )
}
