const jwt = require('jsonwebtoken');
require('dotenv').config();

// JWT_SECRET es obligatorio (index.js no arranca sin él): sin valor por defecto,
// nadie puede firmar tokens válidos con una clave conocida.
const secret = process.env.JWT_SECRET;

function generateToken(payload) {
  return jwt.sign(payload, secret, { expiresIn: '2h' });
}

function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Token missing' });
  const token = auth.slice(7);
  try {
    req.user = jwt.verify(token, secret);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token', details: err.message });
  }
}

module.exports = { generateToken, verifyToken };
