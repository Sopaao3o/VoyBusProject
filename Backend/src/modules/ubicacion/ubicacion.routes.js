const { Router } = require('express');
const { requireRole } = require('../../middleware/auth');
const { validar } = require('../../middleware/validar');
const { idParams } = require('../red/red.schemas');
const { ubicacionBody } = require('./ubicacion.schemas');

/** VEH-01 (conductor): se monta en /api/v1/conductor. */
function createUbicacionRoutes(c) {
  const router = Router();
  router.post(
    '/viajes/:id/ubicacion',
    requireRole('conductor'),
    validar({ params: idParams, body: ubicacionBody }),
    c.registrar,
  );
  return router;
}

module.exports = { createUbicacionRoutes };
