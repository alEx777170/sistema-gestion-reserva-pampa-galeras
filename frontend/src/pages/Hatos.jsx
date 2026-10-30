import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

const g = (o, k) => o?.[k.toUpperCase()] ?? o?.[k]
const errMsg = err => err?.response?.data?.error || err.message
const VACIO = { id_reserva: '', zona: '', cantidad_animales: '' }

export default function Hatos() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('rnpg_token') || '' : ''
  const [hatos, setHatos] = useState([])
  const [reservas, setReservas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [form, setForm] = useState(VACIO)
  const [editing, setEditing] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  async function cargar() {
    try {
      const [rHatos, rReservas] = await Promise.all([
        axios.get('/api/hatos'),
        axios.get('/api/reservas')
      ])
      setHatos(rHatos.data.rows || [])
      setReservas(rReservas.data.rows || [])
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

  function startEdit(h) {
    setEditing(g(h, 'id_hato'))
    setForm({
      id_reserva: g(h, 'id_reserva') || '',
      zona: g(h, 'zona') || '',
      cantidad_animales: g(h, 'cantidad_animales') ?? ''
    })
    setTimeout(() => document.querySelector('.actividades-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!token) return alert('Debes iniciar sesión. Ve a /admin y haz login.')
    try {
      if (editing) {
        await axios.put(`/api/hatos/${editing}`, form)
        flash('✓ Hato actualizado')
      } else {
        await axios.post('/api/hatos', form)
        flash('✓ Hato registrado')
      }
      resetForm()
      cargar()
    } catch (err) {
      alert((editing ? 'Error actualizando: ' : 'Error registrando: ') + errMsg(err))
    }
  }

  async function handleDelete(id) {
    if (!confirm(`¿Eliminar hato #${id}? Los animales asociados también se eliminarán.`)) return
    try {
      await axios.delete(`/api/hatos/${id}`)
      flash('✓ Hato eliminado')
      cargar()
    } catch (err) {
      alert('Error eliminando: ' + errMsg(err))
    }
  }

  const q = busqueda.trim().toLowerCase()
  const filtrados = !q ? hatos : hatos.filter(h =>
    `${g(h, 'reserva') || ''} ${g(h, 'zona') || ''}`.toLowerCase().includes(q))

  if (loading) return <div className="page"><p>Cargando hatos...</p></div>

  return (
    <div className="page actividades-page">
      <div className="page-header">
        <h1>🐑 Gestión de Hatos</h1>
        <p className="muted">Un hato es un grupo de animales que conviven en una zona de la reserva. Editar o eliminar requiere autenticación.</p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="crud-container">
        <div className="list-section">
          <h2>Hatos registrados ({hatos.length})</h2>

          <div className="form-group">
            <input placeholder="Buscar por reserva o zona..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>

          {filtrados.length === 0 ? (
            <div className="empty-state"><p>No hay hatos que mostrar.</p></div>
          ) : (
            <div className="items-list">
              {filtrados.map(h => {
                const id = g(h, 'id_hato')
                const animales = g(h, 'animales_registrados') || 0
                return (
                  <div className="item-card" key={id}>
                    <div className="item-header">
                      <div className="item-id">#{id}</div>
                      <div className="item-title">{g(h, 'zona') || 'Sin zona'}</div>
                      {animales > 0 && <div className="item-badge">{animales} animal{animales > 1 ? 'es' : ''}</div>}
                    </div>
                    <div className="item-body">
                      <div className="info-row"><span className="label">Reserva:</span><span className="value">{g(h, 'reserva') || '—'}</span></div>
                      <div className="info-row"><span className="label">Cant. esperada:</span><span className="value">{g(h, 'cantidad_animales') ?? '—'}</span></div>
                      <div className="info-row"><span className="label">Animales registrados:</span><span className="value">{animales}</span></div>
                    </div>
                    <div className="item-actions">
                      {token && (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => startEdit(h)}>✏️ Editar</button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(id)}>🗑️ Eliminar</button>
                        </>
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
            <h3>{editing ? '✏️ Editar hato' : '➕ Registrar hato'}</h3>
            {successMsg && <div className="success-msg">{successMsg}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Reserva *</label>
                <select value={form.id_reserva} onChange={e => setForm(f => ({ ...f, id_reserva: e.target.value }))} required>
                  <option value="">— Seleccionar reserva —</option>
                  {reservas.map(r => (
                    <option key={g(r, 'id_reserva')} value={g(r, 'id_reserva')}>{g(r, 'nombre')}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Zona</label>
                <input value={form.zona} onChange={e => setForm(f => ({ ...f, zona: e.target.value }))} placeholder="Ej. Pampas centrales" />
              </div>
              <div className="form-group">
                <label>Cantidad de animales (estimada)</label>
                <input type="number" min="0" value={form.cantidad_animales} onChange={e => setForm(f => ({ ...f, cantidad_animales: e.target.value }))} placeholder="Ej. 50" />
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={!token}>
                  {editing ? '💾 Guardar cambios' : '✅ Registrar hato'}
                </button>
                {editing && <button type="button" className="btn btn-secondary" onClick={resetForm}>❌ Cancelar</button>}
              </div>
              {!token && <p className="muted">Inicia sesión desde Admin para gestionar hatos.</p>}
            </form>
          </div>
        </aside>
      </div>
    </div>
  )
}
