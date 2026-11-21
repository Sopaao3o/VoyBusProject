const { Router } = require('express');
const { requireRole } = require('../../middleware/auth');
const { validar } = require('../../middleware/validar');
const { idParams } = require('./red.schemas');
const {
  lineaBody,
  lineaCambios,
  recorridoBody,
  recorridoCambios,
  paraderoBody,
  paraderoCambios,
  generarRedBody,
} = require('./red.admin.schemas');

/** ADM-01 (administrador): se monta en /api/v1/admin/red. */
function createRedAdminRoutes(c) {
  const router = Router();
  router.use(requireRole('administrador'));
  const id = validar({ params: idParams });

  router.get('/lineas', c.listarLineas);
  router.post('/lineas', validar({ body: lineaBody }), c.crearLinea);
  router.get('/lineas/:id', id, c.obtenerLinea);
  router.put('/lineas/:id', validar({ params: idParams, body: lineaCambios }), c.editarLinea);
  router.post(
    '/lineas/:id/recorridos',
    validar({ params: idParams, body: recorridoBody }),
    c.crearRecorrido,
  );

  router.get('/recorridos/:id', id, c.obtenerRecorrido);
  router.put(
    '/recorridos/:id',
    validar({ params: idParams, body: recorridoCambios }),
    c.editarRecorrido,
  );
  router.post('/recorridos/:id/trazado', id, c.trazarRecorrido);
  router.delete('/recorridos/:id/trazado', id, c.quitarTrazado);

  router.get('/paraderos', c.listarParaderos);
  router.post('/paraderos', validar({ body: paraderoBody }), c.crearParadero);
  router.get('/paraderos/:id', id, c.obtenerParadero);
  router.put(
    '/paraderos/:id',
    validar({ params: idParams, body: paraderoCambios }),
    c.editarParadero,
  );

  // Cambiar toda la red: generar la de Antofagasta real, cargarla o volver a la de prueba.
  router.get('/importacion', c.estadoImportacion);
  router.post('/importacion/generar', validar({ body: generarRedBody }), c.generarRed);
  router.post('/importacion/archivo', c.cargarRedArchivo);
  router.post('/importacion/prueba', c.volverRedPrueba);

  return router;
}

module.exports = { createRedAdminRoutes };
