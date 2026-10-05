let jwt;
try {
  jwt = require('jsonwebtoken');
} catch (err) {
  console.error('Error loading jsonwebtoken:', err);
  process.exit(1);
}
require('dotenv').config();

const secret = process.env.JWT_SECRET || 'changeme';

function generateToken(payload) {
  if (!jwt || !jwt.sign) throw new Error('JWT library not loaded');
  return jwt.sign(payload, secret, { expiresIn: '2h' });
}

function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Token missing' });
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token', details: err.message });
  }
}

module.exports = { generateToken, verifyToken };
