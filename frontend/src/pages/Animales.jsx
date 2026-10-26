import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { g, CLASES } from '../utils'

const SEXOS = { M: '♂ Macho', F: '♀ Hembra', U: 'Sin determinar' }
const nombreEspecie = e => g(e, 'nombre_comun') || g(e, 'nombre_cientifico') || '—'

export default function Animales() {
  const [animales, setAnimales] = useState([])
  const [especies, setEspecies] = useState([])
  const [hatos, setHatos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ id_hato: '', id_especie: '', sexo: 'U', edad_anios: '', observaciones: '' })
  const [editing, setEditing] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const token = typeof window !== 'undefined' ? localStorage.getItem('rnpg_token') || '' : ''

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }
    fetchAll()
  }, [token])

  async function fetchAll() {
    setLoading(true)
    try {
      const [resAnimales, resEspecies, resHatos] = await Promise.all([
        axios.get('/api/animales'),
        axios.get('/api/especies', { params: { reino: 'FAUNA' } }), // solo fauna: un animal no puede ser flora
        axios.get('/api/hatos')
      ])
      setAnimales(resAnimales.data.rows || [])
      setEspecies(resEspecies.data.rows || [])
      setHatos(resHatos.data.rows || [])
    } catch (err) {
      console.error(err)
      setError('Error cargando datos')
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setForm({ id_hato: '', id_especie: '', sexo: 'U', edad_anios: '', observaciones: '' })
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
      alert('Debes iniciar sesión como administrador para crear animales. Ve a /admin y haz login.')
      return
    }
    try {
      const payload = {
        id_hato: parseInt(form.id_hato, 10) || null,
        id_especie: parseInt(form.id_especie, 10) || null,
        sexo: form.sexo || null,
        edad_anios: form.edad_anios ? parseInt(form.edad_anios, 10) : null,
        observaciones: form.observaciones || null
      }
      const r = await axios.post('/api/animales', payload)
      if (r.data && r.data.ok) {
        const newId = r.data.id_animal
        
        // Si hay foto, subirla
        if (photoFile) {
          setUploadingPhoto(true)
          try {
            const formData = new FormData()
            formData.append('foto', photoFile)
            await axios.post(`/api/animales/${newId}/foto`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            })
          } catch (err) {
            console.error('Error subiendo foto:', err)
            alert('Animal creado pero error al subir foto: ' + (err?.response?.data?.error || err.message))
          } finally {
            setUploadingPhoto(false)
          }
        }
        
        // Recargar lista
        const res = await axios.get('/api/animales')
        setAnimales(res.data.rows || [])
        setSuccessMsg('✓ Animal creado exitosamente' + (photoFile ? ' con foto' : ''))
        resetForm()
        setTimeout(() => setSuccessMsg(''), 3000)
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err.message
      if (msg && msg.toLowerCase().includes('token')) {
        alert('Error de autenticación: token faltante o inválido. Inicia sesión en /admin.')
      } else {
        alert('Error creando animal: ' + msg)
      }
    }
  }

  function startEdit(a) {
    const id = a.ID_ANIMAL || a.id_animal
    setEditing(id)
    setForm({
      id_hato: a.ID_HATO || a.id_hato || '',
      id_especie: a.ID_ESPECIE || a.id_especie || '',
      sexo: a.SEXO || a.sexo || 'U',
      edad_anios: a.EDAD_ANIOS ?? a.edad_anios ?? '',
      observaciones: a.OBSERVACIONES || a.observaciones || ''
    })
    setPhotoFile(null)
    setPhotoPreview(a.FOTO_RUTA || a.foto_ruta || null)
    setSuccessMsg('')
    setTimeout(() => {
      document.querySelector('.animales-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  async function handleUpdate(e) {
    e.preventDefault()
    if (!token) {
      alert('Debes iniciar sesión como administrador para editar animales. Ve a /admin y haz login.')
      return
    }
    try {
      const payload = {
        id_hato: parseInt(form.id_hato, 10) || null,
        id_especie: parseInt(form.id_especie, 10) || null,
        sexo: form.sexo || null,
        edad_anios: form.edad_anios ? parseInt(form.edad_anios, 10) : null,
        observaciones: form.observaciones || null
      }
      const r = await axios.put(`/api/animales/${editing}`, payload)
      if (r.data && r.data.ok) {
        // Si hay nueva foto, subirla
        if (photoFile) {
          setUploadingPhoto(true)
          try {
            const formData = new FormData()
            formData.append('foto', photoFile)
            await axios.post(`/api/animales/${editing}/foto`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            })
          } catch (err) {
            console.error('Error subiendo foto:', err)
            alert('Animal actualizado pero error al subir foto: ' + (err?.response?.data?.error || err.message))
          } finally {
            setUploadingPhoto(false)
          }
        }
        
        // Recargar lista
        const res = await axios.get('/api/animales')
        setAnimales(res.data.rows || [])
        setSuccessMsg('✓ Animal actualizado exitosamente' + (photoFile ? ' con nueva foto' : ''))
        resetForm()
        setTimeout(() => setSuccessMsg(''), 3000)
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err.message
      if (msg && msg.toLowerCase().includes('token')) {
        alert('Error de autenticación: token faltante o inválido. Inicia sesión en /admin.')
      } else {
        alert('Error actualizando animal: ' + msg)
      }
    }
  }

  async function handleDelete(id, nombre) {
    if (!token) {
      alert('Debes iniciar sesión como administrador para eliminar animales. Ve a /admin y haz login.')
      return
    }
    if (!confirm(`¿Eliminar el registro #${id} (${nombre})? Esta acción es irreversible.`)) return
    try {
      const r = await axios.delete(`/api/animales/${id}`)
      if (r.data && r.data.ok) {
        setAnimales(prev => prev.filter(x => (x.ID_ANIMAL || x.id_animal) !== id))
        setSuccessMsg('✓ Animal eliminado exitosamente')
        setTimeout(() => setSuccessMsg(''), 3000)
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err.message
      if (msg && msg.toLowerCase().includes('token')) {
        alert('Error de autenticación: token faltante o inválido. Inicia sesión en /admin.')
      } else {
        alert('Error eliminando: ' + msg)
      }
    }
  }

  // Especies de fauna agrupadas por clase para el selector
  const especiesPorClase = {}
  especies.forEach(e => {
    const clase = CLASES[g(e, 'clase')] || g(e, 'clase') || 'Otras'
    ;(especiesPorClase[clase] = especiesPorClase[clase] || []).push(e)
  })

  const texto = busqueda.trim().toLowerCase()
  const animalesFiltrados = !texto ? animales : animales.filter(a =>
    [g(a, 'nombre_comun'), g(a, 'nombre_cientifico'), g(a, 'hato_zona'), g(a, 'observaciones')]
      .some(v => v && String(v).toLowerCase().includes(texto)))

  if (loading) return <div className="page"><p>Cargando datos...</p></div>
  if (error) return <div className="page"><p className="error">{error}</p></div>

  return (
    <div className="page animales-page">
      <div className="page-header">
        <h1>🦙 Gestión de Animales</h1>
        <p className="muted">Registra, edita y elimina animales de la reserva. Requiere autenticación.</p>
      </div>

      <div className="animales-container">
        <div className="animales-list-section">
          <h2>Animales registrados ({animales.length})</h2>
          {animales.length > 0 && (
            <div className="form-group filtro-busqueda">
              <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por especie, hato u observaciones..." aria-label="Buscar animales" />
            </div>
          )}
          {animales.length === 0 ? (
            <div className="empty-state">
              <p>No hay animales registrados. Crea uno usando el formulario.</p>
            </div>
          ) : (
            <div className="animales-list">
              {animalesFiltrados.length === 0 && <p className="muted">Ningún animal coincide con «{busqueda}».</p>}
              {animalesFiltrados.map(a => {
                const animalId = a.ID_ANIMAL || a.id_animal
                const fotoRuta = a.FOTO_RUTA || a.foto_ruta
                return (
                  <div className="animal-card" key={animalId}>
                    {fotoRuta && (
                      <div className="animal-photo">
                        <img src={fotoRuta} alt={nombreEspecie(a)} />
                      </div>
                    )}
                    <div className="animal-header">
                      <div>
                        <div className="animal-nombre">{nombreEspecie(a)}</div>
                        {g(a, 'nombre_comun') && <div className="nombre-cientifico">{g(a, 'nombre_cientifico')}</div>}
                      </div>
                      <div className="animal-title">#{animalId}</div>
                    </div>
                    <div className="animal-body">
                      <div className="animal-row">
                        <span className="label">Sexo:</span>
                        <span className="value">{SEXOS[g(a, 'sexo')] || SEXOS.U}</span>
                      </div>
                      <div className="animal-row">
                        <span className="label">Clase:</span>
                        <span className="value">{CLASES[g(a, 'clase')] || g(a, 'clase') || '—'}</span>
                      </div>
                      <div className="animal-row">
                        <span className="label">Edad:</span>
                        <span className="value">{g(a, 'edad_anios') == null ? '—' : `${g(a, 'edad_anios')} ${g(a, 'edad_anios') === 1 ? 'año' : 'años'}`}</span>
                      </div>
                      <div className="animal-row">
                        <span className="label">Hato:</span>
                        <span className="value">{g(a, 'hato_zona') || '—'}</span>
                      </div>
                      {(a.OBSERVACIONES || a.observaciones) && (
                        <div className="animal-row">
                          <span className="label">Notas:</span>
                          <span className="value obs">{a.OBSERVACIONES || a.observaciones}</span>
                        </div>
                      )}
                    </div>
                    <div className="animal-actions">
                      <button className="btn btn-sm btn-primary" onClick={() => startEdit(a)}>✏️ Editar</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(animalId, nombreEspecie(a))}>🗑️ Eliminar</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <aside className="animales-form-section">
          <div className="form-card">
            <h3>{editing ? '✏️ Editar animal' : '➕ Registrar animal'}</h3>
            {successMsg && <div className="success-msg">{successMsg}</div>}
            
            <form onSubmit={editing ? handleUpdate : handleCreate}>
              <div className="form-group">
                <label htmlFor="id_hato">Hato *</label>
                <select id="id_hato" value={form.id_hato} onChange={e => setForm(f => ({ ...f, id_hato: e.target.value }))} required>
                  <option value="">Selecciona un hato...</option>
                  {hatos.map(h => (
                    <option key={h.ID_HATO || h.id_hato} value={h.ID_HATO || h.id_hato}>
                      Hato {h.ID_HATO || h.id_hato} - {h.ZONA || h.zona} ({h.RESERVA || h.reserva})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="id_especie">Especie (fauna) *</label>
                <select id="id_especie" value={form.id_especie} onChange={e => setForm(f => ({ ...f, id_especie: e.target.value }))} required>
                  <option value="">Selecciona una especie...</option>
                  {Object.entries(especiesPorClase).map(([clase, lista]) => (
                    <optgroup key={clase} label={clase}>
                      {lista.map(e => (
                        <option key={g(e, 'id_especie')} value={g(e, 'id_especie')}>
                          {g(e, 'nombre_comun') ? `${g(e, 'nombre_comun')} — ${g(e, 'nombre_cientifico')}` : g(e, 'nombre_cientifico')}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="sexo">Sexo</label>
                  <select id="sexo" value={form.sexo} onChange={e => setForm(f => ({ ...f, sexo: e.target.value }))}>
                    <option value="U">Sin determinar</option>
                    <option value="M">♂ Macho</option>
                    <option value="F">♀ Hembra</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="edad_anios">Edad (años)</label>
                  <input id="edad_anios" type="number" min="0" max="100" value={form.edad_anios} onChange={e => setForm(f => ({ ...f, edad_anios: e.target.value }))} placeholder="0" />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="observaciones">Observaciones</label>
                <textarea id="observaciones" value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} placeholder="Notas adicionales..." rows={3} />
              </div>

              <div className="form-group">
                <label htmlFor="foto">Foto del animal (opcional)</label>
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
                  {uploadingPhoto ? '⏳ Subiendo foto...' : (editing ? '💾 Guardar cambios' : '✅ Crear animal')}
                </button>
                {editing && (
                  <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={uploadingPhoto}>
                    ❌ Cancelar
                  </button>
                )}
              </div>
            </form>

            <p className="form-note">* Campos requeridos. Las operaciones requieren autenticación.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
