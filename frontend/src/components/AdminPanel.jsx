import React, { useState } from 'react'
import axios from 'axios'

export default function AdminPanel({ token, onLogin, onLogout }) {
  const [user, setUser] = useState('admin')
  const [pass, setPass] = useState('changeme')
  const [sql, setSql] = useState('')
  const [output, setOutput] = useState(null)
  const [running, setRunning] = useState(false)

  async function login(e) {
    e.preventDefault()
    setRunning(true)
    try {
      console.log('Sending login:', { user, pass })
      const r = await axios.post('/api/auth/login', { user, pass }, {
        headers: { 'Content-Type': 'application/json' }
      })
      console.log('Login response:', r.data)
      onLogin(r.data.token)
      setOutput({ ok: true, message: 'Login correcto ✓' })
      setPass('')
    } catch (err) {
      console.error('Login error:', err)
      const msg = err?.response?.data?.error || err?.response?.data?.details || err.message
      setOutput({ ok: false, message: `Error: ${msg}` })
    } finally {
      setRunning(false)
    }
  }

  async function runSql() {
    if (!sql.trim()) return setOutput({ ok: false, message: 'SQL vacío' })
    if (!token) return setOutput({ ok: false, message: 'Debes iniciar sesión' })
    if (!confirm('Ejecutar SQL en la base de datos? Asegúrate de tener permisos.')) return
    setRunning(true)
    try {
      const r = await axios.post('/api/exec/run', { sql })
      setOutput({ ok: true, data: r.data })
    } catch (err) {
      setOutput({ ok: false, message: err?.response?.data?.error || err.message, details: err?.response?.data })
    } finally {
      setRunning(false)
    }
  }

  async function runFullFile() {
    if (!token) return setOutput({ ok: false, message: 'Debes iniciar sesión' })
    if (!confirm('Ejecutar TODO el archivo proyect.sql en la BD? Esto puede alterar tu esquema.')) return
    setRunning(true)
    try {
      const r = await axios.post('/api/exec/run-file')
      setOutput({ ok: true, data: r.data })
    } catch (err) {
      setOutput({ ok: false, message: err?.response?.data?.error || err.message, details: err?.response?.data })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      {!token ? (
        <form onSubmit={login} style={{display:'grid',gap:8,maxWidth:420}}>
          <input placeholder="Usuario" value={user} onChange={e=>setUser(e.target.value)} />
          <input placeholder="Contraseña" value={pass} onChange={e=>setPass(e.target.value)} type="password" />
          <div style={{display:'flex',gap:8}}>
            <button type="submit" disabled={running}>Iniciar sesión</button>
          </div>
        </form>
      ) : (
        <div style={{display:'grid',gap:8}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <strong>✓ Conectado</strong>
            <button onClick={onLogout}>Cerrar sesión</button>
          </div>

          <textarea rows={8} placeholder="Pegar SQL aquí" value={sql} onChange={e=>setSql(e.target.value)} />
          <div style={{display:'flex',gap:8}}>
            <button onClick={runSql} disabled={running}>Ejecutar SQL</button>
            <button onClick={runFullFile} disabled={running}>Ejecutar archivo completo</button>
          </div>
        </div>
      )}

      {output && (
        <pre style={{marginTop:12,background:'#061124',padding:12,borderRadius:8,color: output.ok ? '#10b981' : '#ef4444'}}>{JSON.stringify(output, null, 2)}</pre>
      )}
    </div>
  )
}
