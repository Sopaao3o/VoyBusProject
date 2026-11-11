const { Router } = require('express');
const { validar } = require('../../middleware/validar');
const { idParams, busquedaQuery } = require('./red.schemas');

/** Consultas públicas (no requieren sesión): RED-01 y RED-02. */
function createRedRoutes(controller) {
  const router = Router();

  router.get('/lineas', validar({ query: busquedaQuery }), controller.listarLineas);
  router.get('/lineas/:id', validar({ params: idParams }), controller.obtenerLinea);
  router.get('/recorridos/:id', validar({ params: idParams }), controller.obtenerRecorrido);
  router.get('/paraderos', validar({ query: busquedaQuery }), controller.listarParaderos);
  router.get('/paraderos/:id', validar({ params: idParams }), controller.obtenerParadero);

  return router;
}

module.exports = { createRedRoutes };
