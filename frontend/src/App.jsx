import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import axios from 'axios'
import Header from './components/Header'
import Footer from './components/Footer'
import Home from './pages/Home'
import Animales from './pages/Animales'
import Especies from './pages/Especies'
import Reservas from './pages/Reservas'
import Actividades from './pages/Actividades'
import ReservarVisita from './pages/ReservarVisita'
import Turistas from './pages/Turistas'
import Admin from './pages/Admin'
import ProtectedRoute from './components/ProtectedRoute'
import './app.css'

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('rnpg_token') || '')

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }
  }, [token])

  function handleLogin(token) {
    setToken(token)
    localStorage.setItem('rnpg_token', token)
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
  }

  function handleLogout() {
    setToken('')
    localStorage.removeItem('rnpg_token')
    delete axios.defaults.headers.common['Authorization']
  }

  return (
    <BrowserRouter>
      <div className="app-container">
        <Header token={token} onLogout={handleLogout} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/animales" element={<Animales />} />
            <Route path="/especies" element={<Especies />} />
            <Route path="/reservas" element={<Reservas />} />
            <Route path="/actividades" element={<Actividades />} />
            <Route path="/turistas" element={<Turistas />} />
            <Route path="/reservar-visita" element={<ReservarVisita />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute token={token} onLogin={handleLogin}>
                  <Admin token={token} />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  )
}
