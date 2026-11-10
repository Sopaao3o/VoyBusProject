const { Router } = require('express');
const { requireRole } = require('../../middleware/auth');
const { validar } = require('../../middleware/validar');
const { idParams } = require('../red/red.schemas');
const { estadoVehiculoBody, incidenciaBody, justificacionBody, misTurnosQuery, incidenciasQuery } = require('./conductor.schemas');

/** Rutas del conductor: se montan en /api/v1/conductor. */
function createConductorRoutes(c) {
  const router = Router();
  const soloConductor = requireRole('conductor');
  const params = validar({ params: idParams });

  router.get('/turnos', soloConductor, validar({ query: misTurnosQuery }), c.listarTurnos);
  router.get('/turnos/:id', soloConductor, params, c.obtenerTurno);
  router.post('/turnos/:id/iniciar', soloConductor, validar({ params: idParams, body: estadoVehiculoBody }), c.iniciarTurno);
  router.post('/turnos/:id/finalizar', soloConductor, validar({ params: idParams, body: estadoVehiculoBody }), c.finalizarTurno);
  router.post('/turnos/:id/estado-vehiculo', soloConductor, validar({ params: idParams, body: estadoVehiculoBody }), c.cambiarEstado);
  router.post('/turnos/:id/incidencias', soloConductor, validar({ params: idParams, body: incidenciaBody }), c.registrarIncidencia);
  router.put('/turnos/:id/justificacion', soloConductor, validar({ params: idParams, body: justificacionBody }), c.justificarTurno);

  router.post('/viajes/:id/iniciar', soloConductor, params, c.iniciarViaje);
  router.post('/viajes/:id/finalizar', soloConductor, params, c.finalizarViaje);
  router.put('/viajes/:id/justificacion', soloConductor, validar({ params: idParams, body: justificacionBody }), c.justificarViaje);

  return router;
}

/** Lo que registran los conductores, visto por el administrador: se monta en /api/v1/admin. */
function createConductorAdminRoutes(c) {
  const router = Router();
  const soloAdmin = requireRole('administrador');

  router.get('/incidencias', soloAdmin, validar({ query: incidenciasQuery }), c.listarIncidencias);
  router.get('/vehiculos/:id/historial', soloAdmin, validar({ params: idParams }), c.historialVehiculo);

  return router;
}

module.exports = { createConductorRoutes, createConductorAdminRoutes };