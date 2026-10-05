import React, { useState } from 'react'
import axios from 'axios'

export default function LoginForm({ onLogin }) {
  const [user, setUser] = useState('admin')
  const [pass, setPass] = useState('changeme')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const r = await axios.post('/api/auth/login', { user, pass })
      onLogin(r.data.token)
    } catch (err) {
      setError(err?.response?.data?.error || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>Acceso Administrativo</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Usuario</label>
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="usuario"
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label>Contraseña</label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="contraseña"
              disabled={loading}
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Conectando...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  )
}
