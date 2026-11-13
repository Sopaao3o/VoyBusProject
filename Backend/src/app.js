require('./config/zod');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const healthRoutes = require('./routes/health.routes');
const { crearAutenticacion } = require('./middleware/auth');
const { createAuthService } = require('./modules/auth/auth.service');
const { createAuthController } = require('./modules/auth/auth.controller');
const { createAuthRoutes } = require('./modules/auth/auth.routes');
const { createRedService } = require('./modules/red/red.service');
const { createRedController } = require('./modules/red/red.controller');
const { createRedRoutes } = require('./modules/red/red.routes');
const { createTurnosService } = require('./modules/turnos/turnos.service');
const { createTurnosController } = require('./modules/turnos/turnos.controller');
const { createTurnosRoutes } = require('./modules/turnos/turnos.routes');
const { createConductorService } = require('./modules/conductor/conductor.service');
const { createConductorController } = require('./modules/conductor/conductor.controller');
const {
  createConductorRoutes,
  createConductorAdminRoutes,
} = require('./modules/conductor/conductor.routes');
const { createViajesService } = require('./modules/viajes/viajes.service');
const { createViajesController } = require('./modules/viajes/viajes.controller');
const { createViajesRoutes, createSimuladorRoutes } = require('./modules/viajes/viajes.routes');

/**
 * @param {object} deps
 * @param {ReturnType<import('./database/models').initModels>} deps.models modelos Sequelize
 * @param {boolean} [deps.registro] mostrar cada petición en la consola
 * @param {() => Date} [deps.ahora] reloj (las pruebas lo reemplazan para controlar la hora)
 * @param {boolean} [deps.simulador] activa las rutas del simulador de posiciones (solo desarrollo)
 * @param {boolean} [deps.exponerCodigoVerificacion] devuelve el código de ACC-01 en la respuesta (solo desarrollo)
 * @param {boolean} [deps.exponerTokenRecuperacion] devuelve el enlace de ACC-04 en la respuesta (solo desarrollo)
 */
function createApp({
  models,
  registro = false,
  ahora,
  simulador = false,
  exponerCodigoVerificacion = process.env.NODE_ENV !== 'production',
  exponerTokenRecuperacion = exponerCodigoVerificacion,
}) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  if (registro) app.use(morgan('dev'));

  app.use('/api/health', healthRoutes);

  const conductor = createConductorController(createConductorService(models, { ahora }));
  const auth = createAuthController(createAuthService(models, { ahora }), {
    exponerCodigoVerificacion,
    exponerTokenRecuperacion,
  });
  const v1 = express.Router();
  const autenticar = crearAutenticacion({ models });
  v1.use('/auth', createAuthRoutes(auth, { autenticar }));
  v1.use(createRedRoutes(createRedController(createRedService(models))));
  v1.use(
    '/admin',
    autenticar,
    createTurnosRoutes(createTurnosController(createTurnosService(models))),
  );
  v1.use('/admin', autenticar, createConductorAdminRoutes(conductor));
  v1.use('/conductor', autenticar, createConductorRoutes(conductor));
  const viajes = createViajesController(createViajesService(models, { ahora }));
  v1.use('/viajes', autenticar, createViajesRoutes(viajes));
  if (simulador) v1.use('/simulador', createSimuladorRoutes(viajes));
  app.use('/api/v1', v1);

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NO_ENCONTRADO', message: 'Recurso no encontrado' } });
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
    res.status(status).json({ error: { code, message, details } });
  });

  return app;
}

module.exports = { createApp };
