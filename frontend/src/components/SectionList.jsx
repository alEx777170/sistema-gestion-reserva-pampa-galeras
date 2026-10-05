import React from 'react'

export default function SectionList({ sections }) {
  if (!sections || sections.length === 0) return <p>No se encontraron secciones.</p>

  return (
    <div className="sections">
      {sections.map((s, idx) => (
        <details key={idx} className="section">
          <summary><strong>{s.title || `Sección ${idx + 1}`}</strong></summary>
          <div className="section-body">
            <pre className="code">{s.content}</pre>
            <div className="actions">
              <button onClick={() => navigator.clipboard.writeText(s.content)}>Copiar</button>
              <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(s.content)}`} download={`seccion-${idx+1}.sql`} className="btn">Descargar</a>
            </div>
          </div>
        </details>
      ))}
    </div>
  )
}
