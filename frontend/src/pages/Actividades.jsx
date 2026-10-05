import React, { useEffect, useState } from 'react'
import axios from 'axios'

export default function Actividades() {
  const [actividades, setActividades] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ nombre: '', tipo: '', lugar: '', fecha_realizacion: '', duracion_min: '', costo_soles: '' })
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
    fetchActividades()
  }, [token])

  async function fetchActividades() {
    setLoading(true)
    try {
      const res = await axios.get('/api/actividades')
      setActividades(res.data.rows || [])
    } catch (err) {
      console.error(err)
      setError('Error cargando actividades')
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setForm({ nombre: '', tipo: '', lugar: '', fecha_realizacion: '', duracion_min: '', costo_soles: '' })
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
      alert('Debes iniciar sesión para crear actividades. Ve a /admin y haz login.')
      return
    }
    try {
      const r = await axios.post('/api/actividades', form)
      if (r.data && r.data.ok) {
        const newId = r.data.id_actividad
        
        if (photoFile) {
          setUploadingPhoto(true)
          try {
            const formData = new FormData()
            formData.append('foto', photoFile)
            await axios.post(`/api/actividades/${newId}/foto`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            })
          } catch (err) {
            console.error('Error subiendo foto:', err)
            alert('Actividad creada pero error al subir foto: ' + (err?.response?.data?.error || err.message))
          } finally {
            setUploadingPhoto(false)
          }
        }
        
        const res = await axios.get('/api/actividades')
        setActividades(res.data.rows || [])
        setSuccessMsg('✓ Actividad creada exitosamente' + (photoFile ? ' con foto' : ''))
        resetForm()
        setTimeout(() => setSuccessMsg(''), 3000)
      }
    } catch (err) {
      alert('Error creando actividad: ' + (err?.response?.data?.error || err.message))
    }
  }

  function startEdit(a) {
    const id = a.ID_ACTIVIDAD || a.id_actividad
    setEditing(id)
    setForm({
      nombre: a.NOMBRE || a.nombre || '',
      tipo: a.TIPO || a.tipo || '',
      lugar: a.LUGAR || a.lugar || '',
      fecha_realizacion: a.FECHA_REALIZACION || a.fecha_realizacion || '',
      duracion_min: a.DURACION_MIN || a.duracion_min || '',
      costo_soles: a.COSTO_SOLES || a.costo_soles || ''
    })
    setPhotoFile(null)
    setPhotoPreview(a.FOTO_RUTA || a.foto_ruta || null)
    setSuccessMsg('')
    setTimeout(() => {
      document.querySelector('.actividades-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  async function handleUpdate(e) {
    e.preventDefault()
    if (!token) {
      alert('Debes iniciar sesión para editar actividades. Ve a /admin y haz login.')
      return
    }
    try {
      const r = await axios.put(`/api/actividades/${editing}`, form)
      if (r.data && r.data.ok) {
        if (photoFile) {
          setUploadingPhoto(true)
          try {
            const formData = new FormData()
            formData.append('foto', photoFile)
            await axios.post(`/api/actividades/${editing}/foto`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            })
          } catch (err) {
            console.error('Error subiendo foto:', err)
            alert('Actividad actualizada pero error al subir foto: ' + (err?.response?.data?.error || err.message))
          } finally {
            setUploadingPhoto(false)
          }
        }
        
        const res = await axios.get('/api/actividades')
        setActividades(res.data.rows || [])
        setSuccessMsg('✓ Actividad actualizada exitosamente' + (photoFile ? ' con nueva foto' : ''))
        resetForm()
        setTimeout(() => setSuccessMsg(''), 3000)
      }
    } catch (err) {
      alert('Error actualizando actividad: ' + (err?.response?.data?.error || err.message))
    }
  }

  async function handleDelete(id) {
    if (!token) {
      alert('Debes iniciar sesión para eliminar actividades. Ve a /admin y haz login.')
      return
    }
    if (!confirm('Eliminar actividad #' + id + '? Esta acción es irreversible.')) return
    try {
      const r = await axios.delete(`/api/actividades/${id}`)
      if (r.data && r.data.ok) {
        setActividades(prev => prev.filter(x => (x.ID_ACTIVIDAD || x.id_actividad) !== id))
        setSuccessMsg('✓ Actividad eliminada exitosamente')
        setTimeout(() => setSuccessMsg(''), 3000)
      }
    } catch (err) {
      alert('Error eliminando: ' + (err?.response?.data?.error || err.message))
    }
  }

  if (loading) return <div className="page"><p>Cargando actividades...</p></div>
  if (error) return <div className="page"><p className="error">{error}</p></div>

  return (
    <div className="page actividades-page">
      <div className="page-header">
        <h1>🎯 Gestión de Actividades</h1>
        <p className="muted">Registra y gestiona actividades de la reserva. Requiere autenticación.</p>
      </div>

      <div className="crud-container">
        <div className="list-section">
          <h2>Actividades Registradas ({actividades.length})</h2>
          {actividades.length === 0 ? (
            <div className="empty-state">
              <p>No hay actividades registradas. Crea una usando el formulario.</p>
            </div>
          ) : (
            <div className="items-list">
              {actividades.map(a => {
                const activityId = a.ID_ACTIVIDAD || a.id_actividad
                const fotoRuta = a.FOTO_RUTA || a.foto_ruta
                return (
                  <div className="item-card" key={activityId}>
                    {fotoRuta && (
                      <div className="item-photo">
                        <img src={fotoRuta} alt={`Actividad ${activityId}`} />
                      </div>
                    )}
                    <div className="item-header">
                      <div className="item-id">#{activityId}</div>
                      <div className="item-title">{a.NOMBRE || a.nombre}</div>
                      <div className="item-badge">{a.TIPO || a.tipo || 'Actividad'}</div>
                    </div>
                    <div className="item-body">
                      <div className="info-row">
                        <span className="label">Lugar:</span>
                        <span className="value">{a.LUGAR || a.lugar || '—'}</span>
                      </div>
                      {(a.FECHA_REALIZACION || a.fecha_realizacion) && (
                        <div className="info-row">
                          <span className="label">Fecha:</span>
                          <span className="value">{a.FECHA_REALIZACION || a.fecha_realizacion}</span>
                        </div>
                      )}
                      <div className="info-row">
                        <span className="label">Duración:</span>
                        <span className="value">{a.DURACION_MIN || a.duracion_min || '—'} min</span>
                      </div>
                      <div className="info-row">
                        <span className="label">Costo:</span>
                        <span className="value cost">S/ {(a.COSTO_SOLES || a.costo_soles || 0).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="item-actions">
                      <button className="btn btn-sm btn-primary" onClick={() => startEdit(a)}>✏️ Editar</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(activityId)}>🗑️ Eliminar</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <aside className="actividades-form-section">
          <div className="form-card">
            <h3>{editing ? '✏️ Editar actividad' : '➕ Registrar actividad'}</h3>
            {successMsg && <div className="success-msg">{successMsg}</div>}
            
            <form onSubmit={editing ? handleUpdate : handleCreate}>
              <div className="form-group">
                <label>Nombre *</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Avistamiento de Vicuñas" required />
              </div>

              <div className="form-group">
                <label>Tipo</label>
                <input value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} placeholder="Ej. Ecoturismo" />
              </div>

              <div className="form-group">
                <label>Lugar</label>
                <input value={form.lugar} onChange={e => setForm(f => ({ ...f, lugar: e.target.value }))} placeholder="Ej. Zona Norte" />
              </div>

              <div className="form-group">
                <label>Fecha de realización</label>
                <input type="date" value={form.fecha_realizacion} onChange={e => setForm(f => ({ ...f, fecha_realizacion: e.target.value }))} />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Duración (min)</label>
                  <input type="number" min="0" value={form.duracion_min} onChange={e => setForm(f => ({ ...f, duracion_min: e.target.value }))} placeholder="120" />
                </div>
                <div className="form-group">
                  <label>Costo (S/.)</label>
                  <input type="number" min="0" step="0.01" value={form.costo_soles} onChange={e => setForm(f => ({ ...f, costo_soles: e.target.value }))} placeholder="50.00" />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="foto">Foto de la Actividad</label>
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
                  {uploadingPhoto ? '⏳ Subiendo foto...' : (editing ? '💾 Guardar cambios' : '✅ Crear actividad')}
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
