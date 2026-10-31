const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { generateToken } = require('../middleware/auth');
require('dotenv').config();

// Compara en tiempo constante (hash previo para igualar longitudes)
function iguales(a, b) {
  const h = s => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
}

// Límite de intentos fallidos por IP: 10 cada 15 min (frena fuerza bruta sobre la clave de admin).
// En memoria: suficiente para una sola instancia (Render free / docker compose).
const VENTANA_MS = 15 * 60 * 1000;
const MAX_FALLOS = 10;
const fallos = new Map(); // ip -> { n, desde }

setInterval(() => {
  const ahora = Date.now();
  for (const [ip, f] of fallos) if (ahora - f.desde > VENTANA_MS) fallos.delete(ip);
}, VENTANA_MS).unref();

// POST /api/auth/login { user, pass }
// ADMIN_USER y ADMIN_PASS son obligatorios en .env (index.js no arranca sin ellos)
router.post('/login', (req, res) => {
  const ip = req.ip;
  const f = fallos.get(ip);
  if (f && Date.now() - f.desde < VENTANA_MS && f.n >= MAX_FALLOS) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.' });
  }

  const { user, pass } = req.body || {};
  if (!user || !pass) return res.status(400).json({ error: 'Faltan user/pass' });

  // Se evalúan ambas comparaciones siempre (sin cortocircuito)
  const okUser = iguales(user, process.env.ADMIN_USER);
  const okPass = iguales(pass, process.env.ADMIN_PASS);
  if (okUser && okPass) {
    fallos.delete(ip);
    return res.json({ ok: true, token: generateToken({ user }) });
  }

  const actual = f && Date.now() - f.desde < VENTANA_MS ? f : { n: 0, desde: Date.now() };
  actual.n += 1;
  fallos.set(ip, actual);
  console.warn('Intento de login fallido');
  return res.status(401).json({ error: 'Credenciales inválidas' });
});

module.exports = router;
