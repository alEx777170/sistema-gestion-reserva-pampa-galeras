const express = require('express');
const router = express.Router();
const { generateToken } = require('../middleware/auth');
require('dotenv').config();

// POST /api/auth/login { user, pass }
// ADMIN_USER y ADMIN_PASS son obligatorios en .env (index.js no arranca sin ellos)
router.post('/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (!user || !pass) return res.status(400).json({ error: 'Faltan user/pass' });

  if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS) {
    return res.json({ ok: true, token: generateToken({ user }) });
  }
  console.warn('Intento de login fallido');
  return res.status(401).json({ error: 'Credenciales inválidas' });
});

module.exports = router;
