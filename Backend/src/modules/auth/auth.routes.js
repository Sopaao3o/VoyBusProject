const { Router } = require('express');
const { validar } = require('../../middleware/validar');
const { registroBody, sesionBody, verificacionBody, cierreSesionBody } = require('./auth.schemas');

/** ACC-01, ACC-02 y ACC-03: registro, verificación, inicio y cierre de sesión. Se monta en /api/v1/auth. */
function createAuthRoutes(controller) {
  const router = Router();

  router.post('/registro', validar({ body: registroBody }), controller.registrar);
  router.post('/iniciar-sesion', validar({ body: sesionBody }), controller.iniciarSesion);
  router.post('/cerrar-sesion', validar({ body: cierreSesionBody }), controller.cerrarSesion);
  router.post(
    '/verificar-contacto',
    validar({ body: verificacionBody }),
    controller.verificarContacto,
  );
  router.post('/invitado', controller.registrarInvitado);

  return router;
}

module.exports = { createAuthRoutes };
