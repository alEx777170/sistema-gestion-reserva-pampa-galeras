import React from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function Header({ token, onLogout }) {
  const navigate = useNavigate()
  
  function handleLogout() {
    onLogout()
    navigate('/')
  }

  return (
    <header className="header">
      <div className="header-container">
        <Link to="/" className="logo-section">
          <img src="/images/LOGO.jpeg" alt="Reserva Logo" className="logo" />
          <h1>Reserva Natural</h1>
        </Link>

        <nav className="nav">
          <Link to="/">Inicio</Link>
          <Link to="/animales">Animales</Link>
          <Link to="/especies">Especies</Link>
          <Link to="/actividades">Actividades</Link>
          <Link to="/reservas">Reservas</Link>
          <Link to="/turistas">Turistas</Link>
          <Link to="/personal">Personal</Link>
          <Link to="/hatos">Hatos</Link>
          <Link to="/asignaciones">Asignaciones</Link>
          <Link to="/areas">Áreas</Link>
        </nav>

        <div className="header-actions">
          {token ? (
            <>
              <Link to="/admin" className="btn-admin">Admin</Link>
              <button onClick={handleLogout} className="btn-logout">Salir</button>
            </>
          ) : (
            <Link to="/admin" className="btn-login">Login</Link>
          )}
        </div>
      </div>
    </header>
  )
}
