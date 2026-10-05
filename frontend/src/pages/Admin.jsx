import React, { useState } from 'react'
import axios from 'axios'

export default function Admin({ token }) {
  const [sql, setSql] = useState('')
  const [output, setOutput] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('sql')

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

  async function runFullFile() {
    if (!confirm('Ejecutar TODO el archivo proyect.sql? Esto puede alterar el esquema.')) return
    setLoading(true)
    try {
      const r = await axios.post('/api/exec/run-file')
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
      
      <div className="admin-tabs">
        <button
          className={`tab-btn ${activeTab === 'sql' ? 'active' : ''}`}
          onClick={() => setActiveTab('sql')}
        >
          Ejecutar SQL
        </button>
        <button
          className={`tab-btn ${activeTab === 'file' ? 'active' : ''}`}
          onClick={() => setActiveTab('file')}
        >
          Ejecutar Archivo
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'sql' && (
          <div>
            <h2>Ejecutar sentencia SQL</h2>
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
        )}

        {activeTab === 'file' && (
          <div>
            <h2>Ejecutar archivo completo</h2>
            <p>Esto ejecutará todo el archivo <code>proyect.sql</code> en la base de datos.</p>
            <div className="admin-buttons">
              <button onClick={runFullFile} disabled={loading} className="btn btn-danger">
                {loading ? 'Ejecutando...' : 'Ejecutar Archivo Completo'}
              </button>
            </div>
          </div>
        )}

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
