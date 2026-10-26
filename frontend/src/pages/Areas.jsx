import React, { useEffect, useState } from 'react'
import axios from 'axios'

export default function Areas() {
  const [reservas, setReservas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ nombre: '', ubicacion: '', superficie_ha: '', categoria: '' })
  const [editing, setEditing] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const token = typeof window !== 'undefined' ? localStorage.getItem('rnpg_token') || '' : ''

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }
    fetchReservas()
  }, [token])

  async function fetchReservas() {
    setLoading(true)
    try {
      const res = await axios.get('/api/reservas')
      setReservas(res.data.rows || [])
    } catch (err) {
      console.error(err)
      setError('Error cargando áreas')
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setForm({ nombre: '', ubicacion: '', superficie_ha: '', categoria: '' })
    setEditing(null)
    setSuccessMsg('')
    setPhotoFile(null)
    setPhotoPreview(null)
  }

  function handlePhotoSelect(e) {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('La foto no puede superar 5MB')
        return
      }
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onload = () => setPhotoPreview(reader.result)
      reader.readAsDataURL(file)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!token) {
      alert('Debes iniciar sesión para crear áreas. Ve a /admin y haz login.')
      return
    }
    try {
      const r = await axios.post('/api/reservas', form)
      if (r.data && r.data.ok) {
        const newId = r.data.id_reserva
        
        if (photoFile) {
          setUploadingPhoto(true)
          try {
            const formData = new FormData()
            formData.append('foto', photoFile)
            await axios.post(`/api/reservas/${newId}/foto`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            })
          } catch (err) {
            console.error('Error subiendo foto:', err)
            alert('Área creada pero error al subir foto: ' + (err?.response?.data?.error || err.message))
          } finally {
            setUploadingPhoto(false)
          }
        }
        
        const res = await axios.get('/api/reservas')
        setReservas(res.data.rows || [])
        setSuccessMsg('✓ Área creada exitosamente' + (photoFile ? ' con foto' : ''))
        resetForm()
        setTimeout(() => setSuccessMsg(''), 3000)
      }
    } catch (err) {
      alert('Error creando área: ' + (err?.response?.data?.error || err.message))
    }
  }

  function startEdit(r) {
    const id = r.ID_RESERVA || r.id_reserva
    setEditing(id)
    setForm({
      nombre: r.NOMBRE || r.nombre || '',
      ubicacion: r.UBICACION || r.ubicacion || '',
      superficie_ha: r.SUPERFICIE_HA || r.superficie_ha || '',
      categoria: r.CATEGORIA || r.categoria || ''
    })
    setPhotoFile(null)
    setPhotoPreview(r.FOTO_RUTA || r.foto_ruta || null)
    setSuccessMsg('')
    setTimeout(() => {
      document.querySelector('.reservas-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  async function handleUpdate(e) {
    e.preventDefault()
    if (!token) {
      alert('Debes iniciar sesión para editar áreas. Ve a /admin y haz login.')
      return
    }
    try {
      const r = await axios.put(`/api/reservas/${editing}`, form)
      if (r.data && r.data.ok) {
        if (photoFile) {
          setUploadingPhoto(true)
          try {
            const formData = new FormData()
            formData.append('foto', photoFile)
            await axios.post(`/api/reservas/${editing}/foto`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            })
          } catch (err) {
            console.error('Error subiendo foto:', err)
            alert('Área actualizada pero error al subir foto: ' + (err?.response?.data?.error || err.message))
          } finally {
            setUploadingPhoto(false)
          }
        }
        
        const res = await axios.get('/api/reservas')
        setReservas(res.data.rows || [])
        setSuccessMsg('✓ Área actualizada exitosamente' + (photoFile ? ' con nueva foto' : ''))
        resetForm()
        setTimeout(() => setSuccessMsg(''), 3000)
      }
    } catch (err) {
      alert('Error actualizando área: ' + (err?.response?.data?.error || err.message))
    }
  }

  async function handleDelete(id) {
    if (!token) {
      alert('Debes iniciar sesión para eliminar áreas. Ve a /admin y haz login.')
      return
    }
    if (!confirm('Eliminar área #' + id + '? Esta acción es irreversible.')) return
    try {
      const r = await axios.delete(`/api/reservas/${id}`)
      if (r.data && r.data.ok) {
        setReservas(prev => prev.filter(x => (x.ID_RESERVA || x.id_reserva) !== id))
        setSuccessMsg('✓ Área eliminada exitosamente')
        setTimeout(() => setSuccessMsg(''), 3000)
      }
    } catch (err) {
      alert('Error eliminando: ' + (err?.response?.data?.error || err.message))
    }
  }

  if (loading) return <div className="page"><p>Cargando áreas...</p></div>
  if (error) return <div className="page"><p className="error">{error}</p></div>

  return (
    <div className="page reservas-page">
      <div className="page-header">
        <h1>🏔️ Áreas protegidas</h1>
        <p className="muted">Registra y gestiona áreas protegidas. Requiere autenticación.</p>
      </div>

      <div className="crud-container">
        <div className="list-section">
          <h2>Áreas registradas ({reservas.length})</h2>
          {reservas.length === 0 ? (
            <div className="empty-state">
              <p>No hay áreas registradas. Crea una usando el formulario.</p>
            </div>
          ) : (
            <div className="items-list">
              {reservas.map(r => {
                const reservaId = r.ID_RESERVA || r.id_reserva
                const fotoRuta = r.FOTO_RUTA || r.foto_ruta
                return (
                  <div className="item-card" key={reservaId}>
                    {fotoRuta && (
                      <div className="item-photo">
                        <img src={fotoRuta} alt={`Área ${reservaId}`} />
                      </div>
                    )}
                    <div className="item-header">
                      <div className="item-id">#{reservaId}</div>
                      <div className="item-title">{r.NOMBRE || r.nombre}</div>
                      <div className="item-badge">{r.CATEGORIA || r.categoria || 'Área'}</div>
                    </div>
                    <div className="item-body">
                      <div className="info-row">
                        <span className="label">Ubicación:</span>
                        <span className="value">{r.UBICACION || r.ubicacion || '—'}</span>
                      </div>
                      <div className="info-row">
                        <span className="label">Superficie:</span>
                        <span className="value">{r.SUPERFICIE_HA || r.superficie_ha ? (r.SUPERFICIE_HA || r.superficie_ha).toLocaleString() : '—'} ha</span>
                      </div>
                    </div>
                    <div className="item-actions">
                      <button className="btn btn-sm btn-primary" onClick={() => startEdit(r)}>✏️ Editar</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(reservaId)}>🗑️ Eliminar</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <aside className="reservas-form-section">
          <div className="form-card">
            <h3>{editing ? '✏️ Editar área' : '➕ Registrar área'}</h3>
            {successMsg && <div className="success-msg">{successMsg}</div>}
            
            <form onSubmit={editing ? handleUpdate : handleCreate}>
              <div className="form-group">
                <label>Nombre *</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Reserva Nacional..." required />
              </div>

              <div className="form-group">
                <label>Ubicación</label>
                <input value={form.ubicacion} onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))} placeholder="Ej. Lucanas, Ayacucho" />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Superficie (ha)</label>
                  <input type="number" min="0" step="0.01" value={form.superficie_ha} onChange={e => setForm(f => ({ ...f, superficie_ha: e.target.value }))} placeholder="0" />
                </div>
                <div className="form-group">
                  <label>Categoría</label>
                  <input value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} placeholder="Ej. Reserva Nacional" />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="foto">Foto del área</label>
                <input 
                  key={editing ? `edit-${editing}` : 'create'}
                  id="foto" 
                  type="file" 
                  accept="image/*" 
                  onChange={handlePhotoSelect}
                  disabled={uploadingPhoto}
                />
                {photoPreview && (
                  <div className="photo-preview">
                    <img src={photoPreview} alt="Preview" />
                  </div>
                )}
              </div>

              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={uploadingPhoto}>
                  {uploadingPhoto ? '⏳ Subiendo foto...' : (editing ? '💾 Guardar cambios' : '✅ Crear área')}
                </button>
                {editing && (
                  <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={uploadingPhoto}>
                    ❌ Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>
        </aside>
      </div>
    </div>
  )
}
