const { Router } = require('express');
const { requireRole } = require('../../middleware/auth');
const { validar } = require('../../middleware/validar');
const { idParams } = require('../red/red.schemas');
const { ubicacionBody, lineaQuery, cercanosQuery } = require('./ubicacion.schemas');

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

/** RED-03 (públicas, sin sesión): se montan en /api/v1, antes que las de la red. */
function createCirculacionRoutes(c) {
  const router = Router();
  router.get('/vehiculos', validar({ query: lineaQuery }), c.enCirculacion);
  router.get('/paraderos/cercanos', validar({ query: cercanosQuery }), c.cercanos);
  router.get('/paraderos/:id/proximas', validar({ params: idParams }), c.proximas);
  return router;
}

/** ADM-04 (administrador): se monta en /api/v1/admin. */
function createMonitoreoRoutes(c) {
  const router = Router();
  router.get('/monitoreo', requireRole('administrador'), c.monitoreo);
  return router;
}

/** Simulador de flota (solo desarrollo): se monta en /api/v1/simulador. */
function createSimuladorFlotaRoutes(c) {
  const router = Router();
  router.get('/flota', c.estadoFlota);
  router.post('/flota/iniciar', c.iniciarFlota);
  router.post('/flota/detener', c.detenerFlota);
  return router;
}

module.exports = {
  createUbicacionRoutes,
  createCirculacionRoutes,
  createMonitoreoRoutes,
  createSimuladorFlotaRoutes,
};
