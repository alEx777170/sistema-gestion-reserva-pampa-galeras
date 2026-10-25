import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

// Oracle devuelve las columnas en MAYÚSCULAS; se acepta ambas formas
const g = (o, k) => o?.[k.toUpperCase()] ?? o?.[k]
const fmtFecha = v => (v ? new Date(v).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) : '—')
const fmtFechaHora = v => (v ? new Date(v).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '—')
const errMsg = err => err?.response?.data?.error || err.message

export default function ReservarVisita() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('rnpg_token') || '' : ''

  const [disponibilidad, setDisponibilidad] = useState([])
  const [turistas, setTuristas] = useState([])
  const [reservas, setReservas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({ id_turista: '', id_actividad: '', num_personas: 1 })
  const [turistaNuevo, setTuristaNuevo] = useState(false)
  const [nuevo, setNuevo] = useState({ dni: '', nombre: '', apellido: '' })

  const cargar = useCallback(async () => {
    setError('')
    try {
      const disp = await axios.get('/api/reservas-visita/disponibilidad')
      setDisponibilidad(disp.data.rows || [])
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

  const actividad = disponibilidad.find(a => String(g(a, 'id_actividad')) === String(form.id_actividad))
  const cupos = actividad ? g(actividad, 'cupos_disponibles') : null
  const costo = actividad ? Number(g(actividad, 'costo_soles') || 0) : 0
  const personas = parseInt(form.num_personas, 10) || 0
  const montoEstimado = costo * personas

  async function handleSubmit(e) {
    e.preventDefault()
    if (!token) return alert('Debes iniciar sesión para reservar. Ve a /admin y haz login.')
    if (personas < 1) return alert('El número de personas debe ser mayor a 0')
    if (cupos !== null && personas > cupos) return alert(`Solo quedan ${cupos} cupos disponibles`)

    setSubmitting(true)
    try {
      let idTurista = form.id_turista
      if (turistaNuevo) {
        const t = await axios.post('/api/turistas', nuevo)
        idTurista = t.data.id_turista
        // Se conserva el turista creado: si la reserva falla, el reintento no duplica el DNI
        setForm(f => ({ ...f, id_turista: idTurista }))
        setTuristaNuevo(false)
        setNuevo({ dni: '', nombre: '', apellido: '' })
      }
      if (!idTurista) return alert('Selecciona un turista')

      const r = await axios.post('/api/reservas-visita', {
        id_turista: idTurista,
        id_actividad: form.id_actividad,
        num_personas: personas
      })
      flash(`✓ Reserva #${r.data.id_reserva_visita} creada (PENDIENTE)`)
      setForm({ id_turista: '', id_actividad: '', num_personas: 1 })
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
        <p className="muted">Reserva una actividad en la Reserva Nacional Pampa Galeras. Requiere autenticación.</p>
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
                      <div className="info-row"><span className="label">Turista:</span><span className="value">{g(r, 'turista')} {g(r, 'dni') ? `(DNI ${g(r, 'dni')})` : ''}</span></div>
                      <div className="info-row"><span className="label">Fecha visita:</span><span className="value">{fmtFecha(g(r, 'fecha_realizacion'))}</span></div>
                      <div className="info-row"><span className="label">Personas:</span><span className="value">{g(r, 'num_personas')}</span></div>
                      <div className="info-row"><span className="label">Monto:</span><span className="value cost">S/ {Number(g(r, 'monto_total') || 0).toFixed(2)}</span></div>
                      <div className="info-row"><span className="label">Creada:</span><span className="value">{fmtFechaHora(g(r, 'fecha_creacion'))}</span></div>
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
                <select value={form.id_actividad} onChange={e => setForm(f => ({ ...f, id_actividad: e.target.value }))} required>
                  <option value="">Selecciona una actividad...</option>
                  {disponibilidad.map(a => {
                    const id = g(a, 'id_actividad')
                    const c = g(a, 'cupos_disponibles')
                    return (
                      <option key={id} value={id} disabled={c <= 0}>
                        {g(a, 'nombre')} — {fmtFecha(g(a, 'fecha_realizacion'))} — {c > 0 ? `${c} cupos` : 'agotado'}
                      </option>
                    )
                  })}
                </select>
                {disponibilidad.length === 0 && <p className="muted">No hay actividades con fecha futura.</p>}
              </div>

              <div className="form-group">
                <label>Turista *</label>
                {!turistaNuevo ? (
                  <>
                    <select value={form.id_turista} onChange={e => setForm(f => ({ ...f, id_turista: e.target.value }))} required>
                      <option value="">Selecciona un turista...</option>
                      {turistas.map(t => (
                        <option key={g(t, 'id_turista')} value={g(t, 'id_turista')}>
                          {g(t, 'nombre')} {g(t, 'apellido') || ''} {g(t, 'dni') ? `— ${g(t, 'dni')}` : ''}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setTuristaNuevo(true)}>+ Registrar turista nuevo</button>
                  </>
                ) : (
                  <>
                    <input placeholder="DNI (8 dígitos)" maxLength={8} value={nuevo.dni} onChange={e => setNuevo(n => ({ ...n, dni: e.target.value.replace(/\D/g, '') }))} />
                    <input placeholder="Nombre *" value={nuevo.nombre} onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))} required />
                    <input placeholder="Apellido" value={nuevo.apellido} onChange={e => setNuevo(n => ({ ...n, apellido: e.target.value }))} />
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setTuristaNuevo(false)}>← Elegir existente</button>
                  </>
                )}
              </div>

              <div className="form-group">
                <label>Número de personas *</label>
                <input type="number" min="1" max={cupos > 0 ? cupos : undefined} value={form.num_personas} onChange={e => setForm(f => ({ ...f, num_personas: e.target.value }))} required />
              </div>

              {actividad && (
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
