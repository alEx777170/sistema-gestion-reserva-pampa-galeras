const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Ruta: GET /api/sql/raw -> devuelve el archivo proyect.sql sin procesar
router.get('/raw', (req, res) => {
  const filePath = process.env.SQL_FILE_PATH || path.resolve(__dirname, '../../proyect.sql');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'No se pudo leer el archivo', details: err.message });
    res.json({ ok: true, path: filePath, content: data });
  });
});

// Ruta: GET /api/sql/sections -> devuelve secciones detectadas en el SQL por comentarios "-- SECCIÓN"
router.get('/sections', (req, res) => {
  const filePath = process.env.SQL_FILE_PATH || path.resolve(__dirname, '../../proyect.sql');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'No se pudo leer el archivo', details: err.message });

    const lines = data.split(/\r?\n/);
    const sections = [];
    let cur = { title: 'Inicio', content: [] };

    lines.forEach((ln) => {
      const m = ln.match(/^\s*--\s*SECCI\u00d3N\s*\d+\s*:\s*(.*)$/i) || ln.match(/^\s*--\s*SECCIÓN\s*:\s*(.*)$/i) || ln.match(/^\s*--\s*SECCIÓN\s*(.*)$/i);
      if (m) {
        // push current
        if (cur.content.length) sections.push({ title: cur.title, content: cur.content.join('\n') });
        cur = { title: (m[1] || ln).trim(), content: [] };
      } else {
        cur.content.push(ln);
      }
    });

    if (cur.content.length) sections.push({ title: cur.title, content: cur.content.join('\n') });

    res.json({ ok: true, sections });
  });
});

module.exports = router;
