require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const sqlFileRouter = require('./routes/sqlfile');
const execRouter = require('./routes/execute');
const authRouter = require('./routes/auth');
const animalesRouter = require('./routes/animales');
const especiesRouter = require('./routes/especies');
const hatosRouter = require('./routes/hatos');
const reservasRouter = require('./routes/reservas');
const actividadesRouter = require('./routes/actividades');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Servir archivos estáticos desde la carpeta uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/sql', sqlFileRouter);
app.use('/api/exec', execRouter);
app.use('/api/auth', authRouter);
app.use('/api/animales', animalesRouter);
app.use('/api/especies', especiesRouter);
app.use('/api/hatos', hatosRouter);
app.use('/api/reservas', reservasRouter);
app.use('/api/actividades', actividadesRouter);

app.get('/', (req, res) => {
  res.send({ ok: true, message: 'Reserva backend up. Use /api/sql or /api/exec' });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

