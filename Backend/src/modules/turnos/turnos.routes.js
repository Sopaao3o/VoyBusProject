const { Router } = require('express');
const { requireRole } = require('../../middleware/auth');
const { validar } = require('../../middleware/validar');
const { idParams } = require('../red/red.schemas');
const { turnoBody, listarQuery, configuracionBody } = require('./turnos.schemas');

/** ADM-03 (solo administrador): se monta en /api/v1/admin. */
function createTurnosRoutes(controller) {
  const router = Router();
  const soloAdmin = requireRole('administrador');

  router.get('/turnos', soloAdmin, validar({ query: listarQuery }), controller.listar);
  router.get('/turnos/:id', soloAdmin, validar({ params: idParams }), controller.obtener);
  router.post('/turnos', soloAdmin, validar({ body: turnoBody }), controller.crear);
  router.put('/turnos/:id', soloAdmin, validar({ params: idParams, body: turnoBody }), controller.modificar);

  router.get('/configuracion', soloAdmin, controller.obtenerConfiguracion);
  router.put('/configuracion', soloAdmin, validar({ body: configuracionBody }), controller.actualizarConfiguracion);

  return router;
}

module.exports = { createTurnosRoutes };