import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

const g = (o, k) => o?.[k.toUpperCase()] ?? o?.[k]
const errMsg = err => err?.response?.data?.error || err.message
const VACIO = { nombre: '', apellido: '', cargo: '', especialidad: '' }

export default function Personal() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('rnpg_token') || '' : ''
  const [personal, setPersonal] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [form, setForm] = useState(VACIO)
  const [editing, setEditing] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  async function cargar() {
    if (!token) { setLoading(false); return }
    try {
      const r = await axios.get('/api/personal')
      setPersonal(r.data.rows || [])
      setError('')
    } catch (err) {
      setError('Error cargando personal: ' + errMsg(err))
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

  function startEdit(p) {
    setEditing(g(p, 'id_personal'))
    setForm({
      nombre: g(p, 'nombre') || '',
      apellido: g(p, 'apellido') || '',
      cargo: g(p, 'cargo') || '',
      especialidad: g(p, 'especialidad') || ''
    })
    setTimeout(() => document.querySelector('.actividades-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!token) return alert('Debes iniciar sesión. Ve a /admin y haz login.')
    try {
      if (editing) {
        await axios.put(`/api/personal/${editing}`, form)
        flash('✓ Personal actualizado')
      } else {
        await axios.post('/api/personal', form)
        flash('✓ Personal registrado')
      }
      resetForm()
      cargar()
    } catch (err) {
      alert((editing ? 'Error actualizando: ' : 'Error registrando: ') + errMsg(err))
    }
  }

  async function handleDelete(id) {
    if (!confirm(`¿Eliminar personal #${id}? Esta acción es irreversible.`)) return
    try {
      await axios.delete(`/api/personal/${id}`)
      flash('✓ Personal eliminado')
      cargar()
    } catch (err) {
      alert('Error eliminando: ' + errMsg(err))
    }
  }

  const q = busqueda.trim().toLowerCase()
  const filtrados = !q ? personal : personal.filter(p =>
    `${g(p, 'nombre') || ''} ${g(p, 'apellido') || ''} ${g(p, 'cargo') || ''} ${g(p, 'especialidad') || ''}`.toLowerCase().includes(q))

  if (loading) return <div className="page"><p>Cargando personal...</p></div>

  return (
    <div className="page actividades-page">
      <div className="page-header">
        <h1>👤 Gestión de Personal</h1>
        <p className="muted">Administra el personal de la reserva: guardaparques, guías, investigadores. Requiere autenticación.</p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="crud-container">
        <div className="list-section">
          <h2>Personal registrado ({personal.length})</h2>

          {!token ? (
            <div className="empty-state">
              <p>Inicia sesión desde <Link to="/admin">Admin</Link> para ver y gestionar personal.</p>
            </div>
          ) : (
            <>
              <div className="form-group">
                <input placeholder="Buscar por nombre, cargo o especialidad..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              </div>
              {filtrados.length === 0 ? (
                <div className="empty-state"><p>No hay personal que mostrar.</p></div>
              ) : (
                <div className="items-list">
                  {filtrados.map(p => {
                    const id = g(p, 'id_personal')
                    const asignadas = g(p, 'actividades_asignadas') || 0
                    return (
                      <div className="item-card" key={id}>
                        <div className="item-header">
                          <div className="item-id">#{id}</div>
                          <div className="item-title">{g(p, 'nombre')} {g(p, 'apellido') || ''}</div>
                          {asignadas > 0 && <div className="item-badge">{asignadas} actividad{asignadas > 1 ? 'es' : ''}</div>}
                        </div>
                        <div className="item-body">
                          <div className="info-row"><span className="label">Cargo:</span><span className="value">{g(p, 'cargo') || '—'}</span></div>
                          <div className="info-row"><span className="label">Especialidad:</span><span className="value">{g(p, 'especialidad') || '—'}</span></div>
                        </div>
                        <div className="item-actions">
                          <button className="btn btn-sm btn-primary" onClick={() => startEdit(p)}>✏️ Editar</button>
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
            <h3>{editing ? '✏️ Editar personal' : '➕ Registrar personal'}</h3>
            {successMsg && <div className="success-msg">{successMsg}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Nombre *</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Carlos" required />
              </div>
              <div className="form-group">
                <label>Apellido</label>
                <input value={form.apellido} onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))} placeholder="Ej. Huamán" />
              </div>
              <div className="form-group">
                <label>Cargo</label>
                <input value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} placeholder="Ej. Guardaparque" />
              </div>
              <div className="form-group">
                <label>Especialidad</label>
                <input value={form.especialidad} onChange={e => setForm(f => ({ ...f, especialidad: e.target.value }))} placeholder="Ej. Conservación de vicuñas" />
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={!token}>
                  {editing ? '💾 Guardar cambios' : '✅ Registrar personal'}
                </button>
                {editing && <button type="button" className="btn btn-secondary" onClick={resetForm}>❌ Cancelar</button>}
              </div>
              {!token && <p className="muted">Inicia sesión desde Admin para gestionar personal.</p>}
            </form>
          </div>
        </aside>
      </div>
    </div>
  )
}
