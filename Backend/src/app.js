const express = require('express');
const cors = require('cors');

const healthRoutes = require('./routes/health.routes');

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/health', healthRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: 'Recurso no encontrado' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}

module.exports = { createApp };
