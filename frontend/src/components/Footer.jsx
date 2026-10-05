import React from 'react'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-section">
          <h4>Reserva Natural Pampa Galeras</h4>
          <p>Conservando la biodiversidad del Perú</p>
        </div>
        <div className="footer-section">
          <h4>Enlaces</h4>
          <ul>
            <li><a href="/">Inicio</a></li>
            <li><a href="/animales">Animales</a></li>
            <li><a href="/especies">Especies</a></li>
          </ul>
        </div>
        <div className="footer-section">
          <h4>Contacto</h4>
          <p>Email: info@reserva.pe</p>
          <p>Teléfono: +51 (1) 1234567</p>
        </div>
      </div>
      <div className="footer-bottom">
        <p>&copy; 2025 Reserva Natural. Todos los derechos reservados.</p>
      </div>
    </footer>
  )
}
