const express = require('express');
const router = express.Router();
const { generateToken } = require('../middleware/auth');
require('dotenv').config();

// Debug: GET /api/auth/config (solo para ver que está funcionando)
router.get('/config', (req, res) => {
  res.json({ ok: true, ADMIN_USER: process.env.ADMIN_USER || 'admin' });
});

// POST /api/auth/login { user, pass }
router.post('/login', (req, res) => {
  try {
    const { user, pass } = req.body;
    if (!user || !pass) return res.status(400).json({ error: 'Faltan user/pass' });

    const ADMIN_USER = process.env.ADMIN_USER || 'admin';
    const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';

    console.log('Login attempt:', { user, ADMIN_USER, pass_len: pass.length });

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      const token = generateToken({ user });
      console.log('Login success:', user);
      return res.json({ ok: true, token });
    }

    console.log('Login failed: bad credentials');
    return res.status(401).json({ error: 'Credenciales inválidas' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error en servidor', details: err.message });
  }
});

module.exports = router;
