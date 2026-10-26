import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { g, errMsg, CLASES } from '../utils'

const VACIO = { reino: 'FAUNA', nombre_comun: '', nombre_cientifico: '', estado_conservacion: 'DD', clase: '', orden: '', familia: '' }
const ESTADOS = {
  LC: 'Preocupación menor', NT: 'Casi amenazada', VU: 'Vulnerable', EN: 'En peligro',
  CR: 'En peligro crítico', DD: 'Datos insuficientes', NE: 'No evaluada'
}
const nombreEspecie = s => g(s, 'nombre_comun') || g(s, 'nombre_cientifico') || '—'

export default function Especies() {
  const [especies, setEspecies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(VACIO)
  const [editing, setEditing] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [reino, setReino] = useState('FAUNA')
  const [busqueda, setBusqueda] = useState('')

  const token = typeof window !== 'undefined' ? localStorage.getItem('rnpg_token') || '' : ''

  useEffect(() => {
    if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    fetchEspecies()
  }, [token])

  async function fetchEspecies() {
    try {
      const res = await axios.get('/api/especies')
      setEspecies(res.data.rows || [])
      setError('')
    } catch (err) {
      setError('Error cargando especies: ' + errMsg(err))
    } finally {
      setLoading(false)
    }
  }

  function flash(msg) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  function resetForm() {
    setForm({ ...VACIO, reino })
    setEditing(null)
  }

  function requiereLogin(accion) {
    if (token) return false
    alert(`Debes iniciar sesión para ${accion} especies. Ve a /admin y haz login.`)
    return true
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (requiereLogin(editing ? 'editar' : 'crear')) return
    try {
      if (editing) await axios.put(`/api/especies/${editing}`, form)
      else await axios.post('/api/especies', form)
      await fetchEspecies()
      setReino(form.reino)
      flash(editing ? '✓ Especie actualizada' : '✓ Especie registrada')
      setForm({ ...VACIO, reino: form.reino })
      setEditing(null)
    } catch (err) {
      alert('No se pudo guardar la especie: ' + errMsg(err))
    }
  }

  function startEdit(s) {
    setEditing(g(s, 'id_especie'))
    setForm({
      reino: g(s, 'reino') || 'FAUNA',
      nombre_comun: g(s, 'nombre_comun') || '',
      nombre_cientifico: g(s, 'nombre_cientifico') || '',
      estado_conservacion: g(s, 'estado_conservacion') || 'DD',
      clase: g(s, 'clase') || '',
      orden: g(s, 'orden') || '',
      familia: g(s, 'familia') || ''
    })
    setTimeout(() => document.querySelector('.especies-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  async function handleDelete(s) {
    if (requiereLogin('eliminar')) return
    const id = g(s, 'id_especie')
    if (!confirm(`¿Eliminar la especie ${nombreEspecie(s)}? Esta acción es irreversible.`)) return
    try {
      await axios.delete(`/api/especies/${id}`)
      setEspecies(prev => prev.filter(x => g(x, 'id_especie') !== id))
      flash('✓ Especie eliminada')
    } catch (err) {
      alert('No se pudo eliminar: ' + errMsg(err))
    }
  }

  if (loading) return <div className="page"><p>Cargando especies...</p></div>
  if (error) return <div className="page"><p className="error">{error}</p></div>

  const totales = { FAUNA: 0, FLORA: 0 }
  especies.forEach(s => { totales[g(s, 'reino')] = (totales[g(s, 'reino')] || 0) + 1 })

  // Filtra por reino y búsqueda; luego agrupa: la fauna por clase y la flora por familia
  const texto = busqueda.trim().toLowerCase()
  const visibles = especies.filter(s => g(s, 'reino') === reino && (!texto ||
    [g(s, 'nombre_comun'), g(s, 'nombre_cientifico'), g(s, 'familia'), g(s, 'orden')]
      .some(v => v && String(v).toLowerCase().includes(texto))))
  const grupos = {}
  visibles.forEach(s => {
    const clave = reino === 'FAUNA'
      ? (CLASES[g(s, 'clase')] || g(s, 'clase') || 'Sin clase')
      : (g(s, 'familia') || 'Sin familia')
    ;(grupos[clave] = grupos[clave] || []).push(s)
  })
  const ordenGrupos = Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'es'))

  return (
    <div className="page especies-page">
      <div className="page-header">
        <h1>🦎 Especies de la reserva</h1>
        <p className="muted">Fauna y flora registradas en Pampa Galeras. Editar o eliminar requiere iniciar sesión.</p>
      </div>

      {successMsg && <div className="success-msg">{successMsg}</div>}

      <div className="crud-container">
        <div className="list-section">
          <div className="admin-tabs" role="tablist" aria-label="Reino">
            {['FAUNA', 'FLORA'].map(r => (
              <button key={r} role="tab" aria-selected={reino === r}
                className={`tab-btn ${reino === r ? 'active' : ''}`}
                onClick={() => { setReino(r); if (!editing) setForm(f => ({ ...f, reino: r })) }}>
                {r === 'FAUNA' ? '🦙 Fauna' : '🌿 Flora'} ({totales[r] || 0})
              </button>
            ))}
          </div>

          <div className="form-group filtro-busqueda">
            <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder={reino === 'FAUNA' ? 'Buscar por nombre común, científico o familia...' : 'Buscar por nombre científico o familia...'}
              aria-label="Buscar especies" />
          </div>

          {visibles.length === 0 ? (
            <div className="empty-state">
              <p>{texto ? `Ninguna especie coincide con «${busqueda}».` : 'No hay especies registradas. Registra una con el formulario.'}</p>
            </div>
          ) : ordenGrupos.map(grupo => (
            <section key={grupo} className="grupo-especies">
              <h3 className="grupo-titulo">{grupo} <span className="muted">({grupos[grupo].length})</span></h3>
              <div className="items-list">
                {grupos[grupo].map(s => {
                  const id = g(s, 'id_especie')
                  const estado = g(s, 'estado_conservacion')
                  const animales = g(s, 'total_animales') || 0
                  return (
                    <div className="item-card" key={id}>
                      <div className="item-header">
                        <div>
                          <div className="item-title">{nombreEspecie(s)}</div>
                          {g(s, 'nombre_comun') && <div className="nombre-cientifico">{g(s, 'nombre_cientifico')}</div>}
                        </div>
                        {estado && (
                          <div className={`item-badge estado-${estado.toLowerCase()}`} title={ESTADOS[estado]}>{estado}</div>
                        )}
                      </div>
                      <div className="item-body">
                        <div className="info-row"><span className="label">Orden:</span><span className="value">{g(s, 'orden') || '—'}</span></div>
                        <div className="info-row"><span className="label">Familia:</span><span className="value">{g(s, 'familia') || '—'}</span></div>
                        {reino === 'FAUNA' && (
                          <div className="info-row"><span className="label">Animales registrados:</span><span className="value">{animales}</span></div>
                        )}
                      </div>
                      <div className="item-actions">
                        <button className="btn btn-sm btn-primary" onClick={() => startEdit(s)}>✏️ Editar</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(s)}>🗑️ Eliminar</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        <aside className="especies-form-section">
          <div className="form-card">
            <h3>{editing ? '✏️ Editar especie' : '➕ Registrar especie'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="esp-reino">Reino *</label>
                <select id="esp-reino" value={form.reino} onChange={e => setForm(f => ({ ...f, reino: e.target.value }))}>
                  <option value="FAUNA">Fauna</option>
                  <option value="FLORA">Flora</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="esp-comun">Nombre común</label>
                <input id="esp-comun" value={form.nombre_comun} onChange={e => setForm(f => ({ ...f, nombre_comun: e.target.value }))}
                  placeholder={form.reino === 'FAUNA' ? 'Ej. Vicuña' : 'Ej. Ichu'} />
              </div>

              <div className="form-group">
                <label htmlFor="esp-cientifico">Nombre científico *</label>
                <input id="esp-cientifico" value={form.nombre_cientifico} onChange={e => setForm(f => ({ ...f, nombre_cientifico: e.target.value }))}
                  placeholder={form.reino === 'FAUNA' ? 'Ej. Vicugna vicugna' : 'Ej. Jarava ichu'} required />
              </div>

              <div className="form-group">
                <label htmlFor="esp-estado">Estado de conservación</label>
                <select id="esp-estado" value={form.estado_conservacion} onChange={e => setForm(f => ({ ...f, estado_conservacion: e.target.value }))}>
                  {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="esp-clase">Clase</label>
                  <input id="esp-clase" value={form.clase} onChange={e => setForm(f => ({ ...f, clase: e.target.value }))}
                    placeholder={form.reino === 'FAUNA' ? 'Ej. Mammalia' : 'Ej. Equisetopsida'} />
                </div>
                <div className="form-group">
                  <label htmlFor="esp-orden">Orden</label>
                  <input id="esp-orden" value={form.orden} onChange={e => setForm(f => ({ ...f, orden: e.target.value }))}
                    placeholder={form.reino === 'FAUNA' ? 'Ej. Cetartiodactyla' : 'Ej. Poales'} />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="esp-familia">Familia</label>
                <input id="esp-familia" value={form.familia} onChange={e => setForm(f => ({ ...f, familia: e.target.value }))}
                  placeholder={form.reino === 'FAUNA' ? 'Ej. Camelidae' : 'Ej. Poaceae'} />
              </div>

              <div className="form-actions">
                <button className="btn btn-primary" type="submit">{editing ? '💾 Guardar cambios' : '✅ Registrar especie'}</button>
                {editing && <button type="button" className="btn btn-secondary" onClick={resetForm}>❌ Cancelar</button>}
              </div>
            </form>
          </div>
        </aside>
      </div>
    </div>
  )
}
