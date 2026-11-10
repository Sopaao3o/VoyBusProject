const express = require('express');
const cors = require('cors');

const healthRoutes = require('./routes/health.routes');
const { createNetworkService } = require('./modules/network/network.service');
const { createNetworkRoutes } = require('./modules/network/network.routes');
const { createShiftsService } = require('./modules/shifts/shifts.service');
const { createShiftsRoutes } = require('./modules/shifts/shifts.routes');

/** @param {{ db?: import('node:sqlite').DatabaseSync }} [deps] */
function createApp({ db } = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/health', healthRoutes);
  if (db) {
    app.use('/api', createNetworkRoutes(createNetworkService(db)));
    app.use('/api/admin', createShiftsRoutes(createShiftsService(db)));
  }

  app.use((req, res) => {
    res.status(404).json({ error: 'Recurso no encontrado' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido' });
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}

module.exports = { createApp };