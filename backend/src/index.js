require('dotenv').config();

// Variables obligatorias: sin ellas el servidor no arranca (evita claves por defecto conocidas)
const faltantes = ['JWT_SECRET', 'ADMIN_USER', 'ADMIN_PASS', 'ORACLE_USER', 'ORACLE_PASSWORD', 'ORACLE_CONNECT_STRING']
  .filter(k => !process.env[k]);
if (faltantes.length) {
  console.error(`Faltan variables en backend/.env: ${faltantes.join(', ')}. Revisa .env.example.`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET debe tener al menos 16 caracteres.');
  process.exit(1);
}

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const execRouter = require('./routes/execute');
const authRouter = require('./routes/auth');
const animalesRouter = require('./routes/animales');
const especiesRouter = require('./routes/especies');
const hatosRouter = require('./routes/hatos');
const reservasRouter = require('./routes/reservas');
const actividadesRouter = require('./routes/actividades');
const reservasVisitaRouter = require('./routes/reservasVisita');
const turistasRouter = require('./routes/turistas');
const personalRouter = require('./routes/personal');
const actividadPersonalRouter = require('./routes/actividadPersonal');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Servir archivos estáticos desde la carpeta uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/exec', execRouter);
app.use('/api/auth', authRouter);
app.use('/api/animales', animalesRouter);
app.use('/api/especies', especiesRouter);
app.use('/api/hatos', hatosRouter);
app.use('/api/reservas', reservasRouter);
app.use('/api/actividades', actividadesRouter);
app.use('/api/reservas-visita', reservasVisitaRouter);
app.use('/api/turistas', turistasRouter);
app.use('/api/personal', personalRouter);
app.use('/api/asignaciones', actividadPersonalRouter);

app.get('/', (req, res) => {
  res.send({ ok: true, message: 'API de la Reserva Nacional Pampa Galeras' });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

