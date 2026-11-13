const { Router } = require('express');
const { validar } = require('../../middleware/validar');
const {
  registroBody,
  sesionBody,
  verificacionBody,
  cierreSesionBody,
  recuperacionBody,
  restablecerPasswordBody,
  cambioPasswordBody,
} = require('./auth.schemas');

/** ACC-01 a ACC-04: registro, verificación, sesión y contraseña. Se monta en /api/v1/auth. */
function createAuthRoutes(controller, { autenticar } = {}) {
  const router = Router();

  router.post('/registro', validar({ body: registroBody }), controller.registrar);
  router.post('/iniciar-sesion', validar({ body: sesionBody }), controller.iniciarSesion);
  router.post('/cerrar-sesion', validar({ body: cierreSesionBody }), controller.cerrarSesion);
  router.post(
    '/recuperar-password',
    validar({ body: recuperacionBody }),
    controller.recuperarPassword,
  );
  router.post(
    '/restablecer-password',
    validar({ body: restablecerPasswordBody }),
    controller.restablecerPassword,
  );
  router.post(
    '/cambiar-password',
    autenticar,
    validar({ body: cambioPasswordBody }),
    controller.cambiarPassword,
  );
  router.post(
    '/verificar-contacto',
    validar({ body: verificacionBody }),
    controller.verificarContacto,
  );
  router.post('/invitado', controller.registrarInvitado);

  return router;
}

module.exports = { createAuthRoutes };
