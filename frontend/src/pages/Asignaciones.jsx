import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { fmtFecha, fechaLocal } from '../utils'

const g = (o, k) => o?.[k.toUpperCase()] ?? o?.[k]
const errMsg = err => err?.response?.data?.error || err.message
const VACIO = { id_personal: '', id_actividad: '', rol: '', fecha_asignacion: '' }

export default function Asignaciones() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('rnpg_token') || '' : ''
  const [asignaciones, setAsignaciones] = useState([])
  const [personalList, setPersonalList] = useState([])
  const [actividadList, setActividadList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [form, setForm] = useState(VACIO)
  const [editing, setEditing] = useState(null) // { idPersonal, idActividad } o null
  const [busqueda, setBusqueda] = useState('')

  async function cargar() {
    if (!token) { setLoading(false); return }
    try {
      const [rAsign, rPers, rAct] = await Promise.all([
        axios.get('/api/asignaciones'),
        axios.get('/api/personal'),
        axios.get('/api/actividades')
      ])
      setAsignaciones(rAsign.data.rows || [])
      setPersonalList(rPers.data.rows || [])
      setActividadList(rAct.data.rows || [])
      setError('')
    } catch (err) {
      setError('Error cargando datos: ' + errMsg(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    cargar()
  }, [token])

  function flash(msg) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  function resetForm() {
    setForm(VACIO)
    setEditing(null)
  }

  function startEdit(a) {
    const idP = g(a, 'id_personal')
    const idA = g(a, 'id_actividad')
    setEditing({ idPersonal: idP, idActividad: idA })
    const fecha = g(a, 'fecha_asignacion')
    setForm({
      id_personal: idP,
      id_actividad: idA,
      rol: g(a, 'rol') || '',
      fecha_asignacion: fecha ? String(fecha).slice(0, 10) : ''
    })
    setTimeout(() => document.querySelector('.actividades-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!token) return alert('Debes iniciar sesión. Ve a /admin y haz login.')
    try {
      if (editing) {
        await axios.put(`/api/asignaciones/${editing.idPersonal}/${editing.idActividad}`, {
          rol: form.rol,
          fecha_asignacion: form.fecha_asignacion || null
        })
        flash('✓ Asignación actualizada')
      } else {
        await axios.post('/api/asignaciones', form)
        flash('✓ Asignación registrada')
      }
      resetForm()
      cargar()
    } catch (err) {
      alert((editing ? 'Error actualizando: ' : 'Error registrando: ') + errMsg(err))
    }
  }

  async function handleDelete(idP, idA) {
    if (!confirm('¿Eliminar esta asignación? Esta acción es irreversible.')) return
    try {
      await axios.delete(`/api/asignaciones/${idP}/${idA}`)
      flash('✓ Asignación eliminada')
      cargar()
    } catch (err) {
      alert('Error eliminando: ' + errMsg(err))
    }
  }

  const q = busqueda.trim().toLowerCase()
  const filtrados = !q ? asignaciones : asignaciones.filter(a =>
    `${g(a, 'nombre_personal') || ''} ${g(a, 'nombre_actividad') || ''} ${g(a, 'rol') || ''}`.toLowerCase().includes(q))

  if (loading) return <div className="page"><p>Cargando asignaciones...</p></div>

  return (
    <div className="page actividades-page">
      <div className="page-header">
        <h1>🔗 Asignaciones Personal–Actividad</h1>
        <p className="muted">Asigna personal a las actividades de la reserva. Especifica el rol y la fecha de asignación. Requiere autenticación.</p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="crud-container">
        <div className="list-section">
          <h2>Asignaciones registradas ({asignaciones.length})</h2>

          {!token ? (
            <div className="empty-state">
              <p>Inicia sesión desde <Link to="/admin">Admin</Link> para ver y gestionar asignaciones.</p>
            </div>
          ) : (
            <>
              <div className="form-group">
                <input placeholder="Buscar por persona, actividad o rol..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              </div>
              {filtrados.length === 0 ? (
                <div className="empty-state"><p>No hay asignaciones que mostrar.</p></div>
              ) : (
                <div className="items-list">
                  {filtrados.map(a => {
                    const idP = g(a, 'id_personal')
                    const idA = g(a, 'id_actividad')
                    return (
                      <div className="item-card" key={`${idP}-${idA}`}>
                        <div className="item-header">
                          <div className="item-title">{(g(a, 'nombre_personal') || '').trim()}</div>
                          {g(a, 'rol') && <div className="item-badge">{g(a, 'rol')}</div>}
                        </div>
                        <div className="item-body">
                          <div className="info-row"><span className="label">Actividad:</span><span className="value">{g(a, 'nombre_actividad') || '—'}</span></div>
                          <div className="info-row"><span className="label">Lugar:</span><span className="value">{g(a, 'lugar_actividad') || '—'}</span></div>
                          <div className="info-row"><span className="label">Cargo:</span><span className="value">{g(a, 'cargo') || '—'}</span></div>
                          <div className="info-row"><span className="label">Fecha asignación:</span><span className="value">{fmtFecha(g(a, 'fecha_asignacion'))}</span></div>
                        </div>
                        <div className="item-actions">
                          <button className="btn btn-sm btn-primary" onClick={() => startEdit(a)}>✏️ Editar</button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(idP, idA)}>🗑️ Eliminar</button>
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
            <h3>{editing ? '✏️ Editar asignación' : '➕ Nueva asignación'}</h3>
            {successMsg && <div className="success-msg">{successMsg}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Personal *</label>
                <select value={form.id_personal} onChange={e => setForm(f => ({ ...f, id_personal: e.target.value }))} required disabled={!!editing}>
                  <option value="">— Seleccionar personal —</option>
                  {personalList.map(p => (
                    <option key={g(p, 'id_personal')} value={g(p, 'id_personal')}>
                      {g(p, 'nombre')} {g(p, 'apellido') || ''} {g(p, 'cargo') ? `(${g(p, 'cargo')})` : ''}
                    </option>
                  ))}
                </select>
                {editing && <small className="muted">No se puede cambiar el personal (es parte de la clave)</small>}
              </div>
              <div className="form-group">
                <label>Actividad *</label>
                <select value={form.id_actividad} onChange={e => setForm(f => ({ ...f, id_actividad: e.target.value }))} required disabled={!!editing}>
                  <option value="">— Seleccionar actividad —</option>
                  {actividadList.map(a => (
                    <option key={g(a, 'id_actividad')} value={g(a, 'id_actividad')}>
                      {g(a, 'nombre')} {g(a, 'lugar') ? `— ${g(a, 'lugar')}` : ''}
                    </option>
                  ))}
                </select>
                {editing && <small className="muted">No se puede cambiar la actividad (es parte de la clave)</small>}
              </div>
              <div className="form-group">
                <label>Rol</label>
                <input value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))} placeholder="Ej. Guía Especializado" />
              </div>
              <div className="form-group">
                <label>Fecha de asignación</label>
                <input type="date" value={form.fecha_asignacion} onChange={e => setForm(f => ({ ...f, fecha_asignacion: e.target.value }))} />
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={!token}>
                  {editing ? '💾 Guardar cambios' : '✅ Asignar personal'}
                </button>
                {editing && <button type="button" className="btn btn-secondary" onClick={resetForm}>❌ Cancelar</button>}
              </div>
              {!token && <p className="muted">Inicia sesión desde Admin para gestionar asignaciones.</p>}
            </form>
          </div>
        </aside>
      </div>
    </div>
  )
}
