const { Router } = require('express');
const { requireRole } = require('../../middleware/auth');
const { validar } = require('../../middleware/validar');
const { idParams } = require('../red/red.schemas');
const { solicitudBody } = require('./viajes.schemas');

/** VIA-02 (pasajero, registrado o invitado): se monta en /api/v1/viajes. */
function createViajesRoutes(c) {
  const router = Router();
  const soloPasajero = requireRole('pasajero');
  const params = validar({ params: idParams });

  router.get('/:id/paraderos-disponibles', soloPasajero, params, c.paraderosDisponibles);
  router.post('/:id/solicitudes-parada', soloPasajero, validar({ params: idParams, body: solicitudBody }), c.solicitarParada);
  router.get('/:id/solicitudes-parada/mia', soloPasajero, params, c.miSolicitud);

  return router;
}

/** Herramienta de desarrollo: se monta en /api/v1/simulador solo si se activa. */
function createSimuladorRoutes(c) {
  const router = Router();
  router.post('/viajes/:id/avanzar', validar({ params: idParams }), c.simularAvance);
  return router;
}

module.exports = { createViajesRoutes, createSimuladorRoutes };