import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

const g = (o, k) => o?.[k.toUpperCase()] ?? o?.[k]
const errMsg = err => err?.response?.data?.error || err.message
const VACIO = { dni: '', nombre: '', apellido: '', edad: '', nacionalidad: '' }

export default function Turistas() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('rnpg_token') || '' : ''
  const [turistas, setTuristas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [form, setForm] = useState(VACIO)
  const [editing, setEditing] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  async function cargar() {
    if (!token) { setLoading(false); return }
    try {
      const r = await axios.get('/api/turistas')
      setTuristas(r.data.rows || [])
      setError('')
    } catch (err) {
      setError('Error cargando turistas: ' + errMsg(err))
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

  function startEdit(t) {
    setEditing(g(t, 'id_turista'))
    setForm({
      dni: (g(t, 'dni') || '').trim(),
      nombre: g(t, 'nombre') || '',
      apellido: g(t, 'apellido') || '',
      edad: g(t, 'edad') ?? '',
      nacionalidad: g(t, 'nacionalidad') || ''
    })
    setTimeout(() => document.querySelector('.actividades-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!token) return alert('Debes iniciar sesión. Ve a /admin y haz login.')
    try {
      if (editing) {
        await axios.put(`/api/turistas/${editing}`, form)
        flash('✓ Turista actualizado')
      } else {
        await axios.post('/api/turistas', form)
        flash('✓ Turista registrado')
      }
      resetForm()
      cargar()
    } catch (err) {
      alert((editing ? 'Error actualizando: ' : 'Error registrando: ') + errMsg(err))
    }
  }

  async function handleDelete(id) {
    if (!confirm(`¿Eliminar turista #${id}? Esta acción es irreversible.`)) return
    try {
      await axios.delete(`/api/turistas/${id}`)
      flash('✓ Turista eliminado')
      cargar()
    } catch (err) {
      alert('Error eliminando: ' + errMsg(err))
    }
  }

  const q = busqueda.trim().toLowerCase()
  const filtrados = !q ? turistas : turistas.filter(t =>
    `${g(t, 'nombre') || ''} ${g(t, 'apellido') || ''} ${g(t, 'dni') || ''}`.toLowerCase().includes(q))

  if (loading) return <div className="page"><p>Cargando turistas...</p></div>

  return (
    <div className="page actividades-page">
      <div className="page-header">
        <h1>🧳 Gestión de Turistas</h1>
        <p className="muted">Registra a los visitantes que podrán reservar actividades. Requiere autenticación.</p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="crud-container">
        <div className="list-section">
          <h2>Turistas registrados ({turistas.length})</h2>

          {!token ? (
            <div className="empty-state">
              <p>Inicia sesión desde <Link to="/admin">Admin</Link> para ver y registrar turistas.</p>
            </div>
          ) : (
            <>
              <div className="form-group">
                <input placeholder="Buscar por nombre, apellido o DNI..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              </div>
              {filtrados.length === 0 ? (
                <div className="empty-state"><p>No hay turistas que mostrar.</p></div>
              ) : (
                <div className="items-list">
                  {filtrados.map(t => {
                    const id = g(t, 'id_turista')
                    const activas = g(t, 'reservas_activas') || 0
                    return (
                      <div className="item-card" key={id}>
                        <div className="item-header">
                          <div className="item-id">#{id}</div>
                          <div className="item-title">{g(t, 'nombre')} {g(t, 'apellido') || ''}</div>
                          {activas > 0 && <div className="item-badge">{activas} reserva{activas > 1 ? 's' : ''} activa{activas > 1 ? 's' : ''}</div>}
                        </div>
                        <div className="item-body">
                          <div className="info-row"><span className="label">DNI:</span><span className="value">{(g(t, 'dni') || '').trim() || '—'}</span></div>
                          <div className="info-row"><span className="label">Edad:</span><span className="value">{g(t, 'edad') ?? '—'}</span></div>
                          <div className="info-row"><span className="label">Nacionalidad:</span><span className="value">{g(t, 'nacionalidad') || '—'}</span></div>
                        </div>
                        <div className="item-actions">
                          <button className="btn btn-sm btn-primary" onClick={() => startEdit(t)}>✏️ Editar</button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(id)}>🗑️ Eliminar</button>
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
            <h3>{editing ? '✏️ Editar turista' : '➕ Registrar turista'}</h3>
            {successMsg && <div className="success-msg">{successMsg}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Nombre *</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. María" required />
              </div>
              <div className="form-group">
                <label>Apellido</label>
                <input value={form.apellido} onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))} placeholder="Ej. Gonzales" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>DNI</label>
                  <input value={form.dni} maxLength={8} inputMode="numeric" onChange={e => setForm(f => ({ ...f, dni: e.target.value.replace(/\D/g, '') }))} placeholder="8 dígitos" />
                </div>
                <div className="form-group">
                  <label>Edad</label>
                  <input type="number" min="0" max="130" value={form.edad} onChange={e => setForm(f => ({ ...f, edad: e.target.value }))} placeholder="28" />
                </div>
              </div>
              <div className="form-group">
                <label>Nacionalidad</label>
                <input value={form.nacionalidad} onChange={e => setForm(f => ({ ...f, nacionalidad: e.target.value }))} placeholder="Ej. Peruana" />
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={!token}>
                  {editing ? '💾 Guardar cambios' : '✅ Registrar turista'}
                </button>
                {editing && <button type="button" className="btn btn-secondary" onClick={resetForm}>❌ Cancelar</button>}
              </div>
              {!token && <p className="muted">Inicia sesión desde Admin para registrar turistas.</p>}
            </form>
          </div>
        </aside>
      </div>
    </div>
  )
}
