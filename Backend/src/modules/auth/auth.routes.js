const { Router } = require('express');
const { validar } = require('../../middleware/validar');
const { registroBody, sesionBody, verificacionBody } = require('./auth.schemas');

/** ACC-01 y ACC-02: registro público, inicio de sesión y verificación de pasajeros. Se monta en /api/v1/auth. */
function createAuthRoutes(controller) {
  const router = Router();

  router.post('/registro', validar({ body: registroBody }), controller.registrar);
  router.post('/iniciar-sesion', validar({ body: sesionBody }), controller.iniciarSesion);
  router.post(
    '/verificar-contacto',
    validar({ body: verificacionBody }),
    controller.verificarContacto,
  );
  router.post('/invitado', controller.registrarInvitado);

  return router;
}

module.exports = { createAuthRoutes };
