require('./config/zod');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const healthRoutes = require('./routes/health.routes');
const { createRedService } = require('./modules/red/red.service');
const { createRedController } = require('./modules/red/red.controller');
const { createRedRoutes } = require('./modules/red/red.routes');
// TRANSITORIO: turnos (ADM-03) sigue con la base vieja hasta la Etapa 3.
const { createShiftsService } = require('./modules/shifts/shifts.service');
const { createShiftsRoutes } = require('./modules/shifts/shifts.routes');

const esV1 = (req) => req.originalUrl.startsWith('/api/v1');

/**
 * @param {object} [deps]
 * @param {ReturnType<import('./database/models').initModels>} [deps.models] modelos Sequelize
 * @param {import('node:sqlite').DatabaseSync} [deps.db] base vieja (solo para turnos, transitorio)
 * @param {boolean} [deps.registro] mostrar cada petición en la consola
 */
function createApp({ models, db, registro = false } = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  if (registro) app.use(morgan('dev'));

  app.use('/api/health', healthRoutes);
  if (models) app.use('/api/v1', createRedRoutes(createRedController(createRedService(models))));
  if (db) app.use('/api/admin', createShiftsRoutes(createShiftsService(db)));

  app.use((req, res) => {
    const mensaje = 'Recurso no encontrado';
    res.status(404).json(esV1(req) ? { error: { code: 'NO_ENCONTRADO', message: mensaje } } : { error: mensaje });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let { status, message, code, details } = err;
    if (err.type === 'entity.parse.failed') {
      status = 400;
      code = 'JSON_INVALIDO';
      message = 'El cuerpo de la petición no es un JSON válido';
    }
    if (!status || status >= 500) {
      console.error(err);
      status = 500;
      code = 'ERROR_INTERNO';
      message = 'Error interno del servidor';
      details = undefined;
    }
    // Formato nuevo en /api/v1; el viejo se mantiene mientras turnos no se migre.
    res.status(status).json(esV1(req) ? { error: { code, message, details } } : { error: message });
  });

  return app;
}

module.exports = { createApp };