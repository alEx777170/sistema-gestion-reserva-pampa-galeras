import React, { useState } from 'react'
import axios from 'axios'

export default function Admin({ token }) {
  const [sql, setSql] = useState('')
  const [output, setOutput] = useState(null)
  const [loading, setLoading] = useState(false)

  async function runSql() {
    if (!sql.trim()) return setOutput({ error: 'SQL vacío' })
    if (!confirm('Ejecutar SQL? Asegúrate de tener permisos.')) return
    setLoading(true)
    try {
      const r = await axios.post('/api/exec/run', { sql })
      setOutput({ ok: true, data: r.data })
    } catch (err) {
      setOutput({ error: err?.response?.data?.error || err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page admin-page">
      <h1>Panel Administrativo</h1>

      <div className="admin-content">
        <div>
          <h2>Ejecutar sentencia SQL</h2>
          <p className="muted">Consola de desarrollo: solo funciona si el backend tiene ALLOW_EXECUTE=true.
            El script completo <code>proyecto_completo.sql</code> se ejecuta como SYS en SQL Developer.</p>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            placeholder="Escribe SQL aquí..."
            rows={10}
            className="sql-input"
          />
          <div className="admin-buttons">
            <button onClick={runSql} disabled={loading} className="btn btn-danger">
              {loading ? 'Ejecutando...' : 'Ejecutar'}
            </button>
          </div>
        </div>

        {output && (
          <div className={`output ${output.ok ? 'success' : 'error'}`}>
            <h3>{output.ok ? '✓ Éxito' : '✗ Error'}</h3>
            <pre>{JSON.stringify(output, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
