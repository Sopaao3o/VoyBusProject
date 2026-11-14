const { Router } = require('express');
const { requireRole } = require('../../middleware/auth');
const { validar } = require('../../middleware/validar');
const { idParams } = require('../red/red.schemas');

/** RED-02 (pasajeros registrados): se monta en /api/v1/favoritos, después de autenticar. */
function createFavoritosRoutes(controller) {
  const router = Router();
  const soloPasajero = requireRole('pasajero');
  const params = validar({ params: idParams });

  router.get('/paraderos', soloPasajero, controller.listarParaderos);
  router.put('/paraderos/:id', soloPasajero, params, controller.agregarParadero);
  router.delete('/paraderos/:id', soloPasajero, params, controller.quitarParadero);

  return router;
}

module.exports = { createFavoritosRoutes };
