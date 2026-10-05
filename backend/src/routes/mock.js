const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');

// Mock data para pruebas sin Oracle
const mockData = {
  RESERVA: [
    { ID_RESERVA: 1, NOMBRE: 'Reserva Nacional Pampa Galeras Bárbara D\'Achille', UBICACION: 'Lucanas, Ayacucho', SUPERFICIE_HA: 6500, CATEGORIA: 'Reserva Nacional' },
    { ID_RESERVA: 2, NOMBRE: 'Zona de Amortiguamiento Norte', UBICACION: 'Lucanas, Ayacucho', SUPERFICIE_HA: 2500, CATEGORIA: 'Zona Amortiguamiento' }
  ],
  ESPECIE: [
    { ID_ESPECIE: 1, NOMBRE_COMUN: 'Vicuña', NOMBRE_CIENTIFICO: 'Vicugna vicugna', CLASE: 'Mammalia', ESTADO_CONSERVACION: 'VU' },
    { ID_ESPECIE: 2, NOMBRE_COMUN: 'Guanaco', NOMBRE_CIENTIFICO: 'Lama guanicoe', CLASE: 'Mammalia', ESTADO_CONSERVACION: 'LC' }
  ],
  TURISTA: [
    { ID_TURISTA: 1, NOMBRE: 'María', APELLIDO: 'Gonzales', NACIONALIDAD: 'Peruana', EDAD: 28 },
    { ID_TURISTA: 2, NOMBRE: 'John', APELLIDO: 'Smith', NACIONALIDAD: 'Estadounidense', EDAD: 35 }
  ]
};

// POST /api/exec/run-mock { sql: "..." }  - versión mock sin Oracle
router.post('/run-mock', verifyToken, (req, res) => {
  const sql = req.body.sql;
  if (!sql || typeof sql !== 'string') return res.status(400).json({ error: 'Falta campo sql en body' });

  try {
    // Parse simple SELECT
    const upper = sql.toUpperCase().trim();
    if (upper.startsWith('SELECT * FROM RESERVA')) {
      return res.json({ ok: true, rows: mockData.RESERVA, rowsAffected: mockData.RESERVA.length });
    }
    if (upper.startsWith('SELECT * FROM ESPECIE')) {
      return res.json({ ok: true, rows: mockData.ESPECIE, rowsAffected: mockData.ESPECIE.length });
    }
    if (upper.startsWith('SELECT * FROM TURISTA')) {
      return res.json({ ok: true, rows: mockData.TURISTA, rowsAffected: mockData.TURISTA.length });
    }
    if (upper.includes('INSERT') || upper.includes('UPDATE') || upper.includes('DELETE')) {
      return res.json({ ok: true, message: 'Mock: operación simulada correctamente', rowsAffected: 1 });
    }
    
    res.json({ ok: true, message: 'Mock query ejecutada', rows: [] });
  } catch (err) {
    res.status(500).json({ error: 'Error en mock query', details: err.message });
  }
});

module.exports = router;
