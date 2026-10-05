const express = require('express');
const router = express.Router();
const { getConnection } = require('../db');
const { verifyToken } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

// POST /api/exec/run { sql: "..." }  - protegido por JWT
router.post('/run', verifyToken, async (req, res) => {
  if ((process.env.ALLOW_EXECUTE || 'false').toLowerCase() !== 'true') {
    return res.status(403).json({ error: 'Ejecución deshabilitada. Cambia ALLOW_EXECUTE en .env si estás en entorno controlado.' });
  }

  const sql = req.body.sql;
  if (!sql || typeof sql !== 'string') return res.status(400).json({ error: 'Falta campo sql en body' });

  let conn;
  try {
    console.log('Ejecutando SQL:', sql.substring(0, 100) + '...');
    conn = await getConnection();
    const result = await conn.execute(sql, [], { autoCommit: true });
    console.log('SQL ejecutado correctamente');
    res.json({ ok: true, result: { rowsAffected: result.rowsAffected, outBinds: result.outBinds, rows: result.rows } });
  } catch (err) {
    console.error('Error ejecutando SQL:', err.message);
    if (conn) try { await conn.rollback(); } catch (e) {}
    res.status(500).json({ error: 'Error ejecutando SQL', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

// POST /api/exec/run-file  -> ejecuta el archivo SQL completo
router.post('/run-file', verifyToken, async (req, res) => {
  if ((process.env.ALLOW_EXECUTE || 'false').toLowerCase() !== 'true') {
    return res.status(403).json({ error: 'Ejecución deshabilitada. Cambia ALLOW_EXECUTE en .env si estás en entorno controlado.' });
  }
  if ((process.env.ALLOW_EXECUTE_FULL || 'false').toLowerCase() !== 'true') {
    return res.status(403).json({ error: 'Ejecución del archivo completo deshabilitada. Cambia ALLOW_EXECUTE_FULL en .env si estás en entorno controlado.' });
  }

  const filePath = process.env.SQL_FILE_PATH || path.resolve(__dirname, '../../proyect.sql');
  let sqlText;
  try {
    sqlText = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo leer el archivo', details: err.message });
  }

  // Dividir por líneas que contengan solo '/' y por ';'
  // También ignorar comentarios
  const chunks = [];
  const lines = sqlText.split(/\r?\n/);
  let cur = [];
  
  for (const ln of lines) {
    const trimmed = ln.trim();
    
    // Ignorar comentarios puros
    if (trimmed.startsWith('--') || trimmed === '') {
      if (cur.length > 0) cur.push(ln);
      continue;
    }
    
    // Si es una línea que contiene solo '/', es fin de bloque PL/SQL
    if (/^\s*\/\s*$/.test(ln)) {
      cur.push(ln);
      const block = cur.join('\n').trim();
      if (block && !block.match(/^--/) && block !== '/') {
        chunks.push(block);
      }
      cur = [];
    } else if (trimmed.endsWith(';')) {
      // Si termina con ; es una sentencia SQL normal
      cur.push(ln);
      const block = cur.join('\n').trim();
      if (block && !block.match(/^--/)) {
        chunks.push(block);
      }
      cur = [];
    } else {
      cur.push(ln);
    }
  }
  
  // Añadir último bloque si existe
  if (cur.join('\n').trim()) {
    const block = cur.join('\n').trim();
    if (block && !block.match(/^--/)) {
      chunks.push(block);
    }
  }

  let conn;
  try {
    conn = await getConnection();
    let successCount = 0;
    
    console.log(`\n=== INICIANDO EJECUCIÓN DE ARCHIVO ===`);
    console.log(`Total de bloques a ejecutar: ${chunks.length}\n`);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i].trim();
      if (!chunk) continue;
      
      try {
        console.log(`[${i + 1}/${chunks.length}] Ejecutando...`);
        console.log(`Preview: ${chunk.substring(0, 80).replace(/\n/g, ' ')}...`);
        
        await conn.execute(chunk, [], { autoCommit: false });
        successCount++;
        console.log(`[${i + 1}/${chunks.length}] ✓ OK\n`);
      } catch (err) {
        console.error(`\n[${i + 1}/${chunks.length}] ✗ ERROR: ${err.message}`);
        console.error(`Código SQL completo:\n${chunk}\n`);
        try {
          await conn.rollback();
        } catch (rbErr) {
          console.error('Error durante rollback:', rbErr.message);
        }
        return res.status(500).json({ 
          error: 'Error ejecutando bloque', 
          blockIndex: i + 1,
          totalBlocks: chunks.length,
          blockPreview: chunk.substring(0, 200), 
          sqlCode: chunk,
          details: err.message 
        });
      }
    }
    
    try {
      console.log('Confirmando transacción (commit)...');
      await conn.commit();
      console.log(`\n✓ ÉXITO: ${successCount} bloques ejecutados correctamente\n`);
      res.json({ ok: true, message: `Ejecutados ${successCount} bloques correctamente`, blocksExecuted: successCount });
    } catch (commitErr) {
      console.error('Error en commit:', commitErr.message);
      res.status(500).json({ error: 'Error en commit', details: commitErr.message });
    }
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch (e) {}
    console.error('Error durante ejecución:', err.message);
    res.status(500).json({ error: 'Error durante ejecución', details: err.message });
  } finally {
    if (conn) try { await conn.close(); } catch (e) {}
  }
});

module.exports = router;
