const { Router } = require('express');
const { requireRole } = require('../../middleware/auth');
const { validar } = require('../../middleware/validar');
const { vinculacionBody, codigoParams } = require('./vinculacion.schemas');

/** VIA-01 (pasajero, registrado o invitado): se monta en /api/v1/vinculacion. */
function createVinculacionRoutes(c) {
  const router = Router();
  const soloPasajero = requireRole('pasajero');
  router.get('/', soloPasajero, c.actual);
  router.post('/', soloPasajero, validar({ body: vinculacionBody }), c.vincular);
  router.delete('/', soloPasajero, c.desvincular);
  router.get('/vehiculos/:codigo', soloPasajero, validar({ params: codigoParams }), c.consultar);
  return router;
}

module.exports = { createVinculacionRoutes };
