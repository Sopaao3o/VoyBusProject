const { Router } = require('express');
const { validar } = require('../../middleware/validar');
const {
  registroBody,
  sesionBody,
  verificacionBody,
  reenvioBody,
  cierreSesionBody,
  recuperacionBody,
  restablecerPasswordBody,
  cambioPasswordBody,
  confirmar2faBody,
  verificar2faBody,
  desactivar2faBody,
} = require('./auth.schemas');

/** ACC-01 a ACC-04: registro, verificación, sesión y contraseña. Se monta en /api/v1/auth. */
function createAuthRoutes(controller, { autenticar } = {}) {
  const router = Router();

  router.post('/registro', validar({ body: registroBody }), controller.registrar);
  router.post('/iniciar-sesion', validar({ body: sesionBody }), controller.iniciarSesion);
  router.post(
    '/2fa/verificar',
    validar({ body: verificar2faBody }),
    controller.verificarDosFactores,
  );
  router.post('/2fa/iniciar', autenticar, controller.iniciarDosFactores);
  router.post(
    '/2fa/confirmar',
    autenticar,
    validar({ body: confirmar2faBody }),
    controller.confirmarDosFactores,
  );
  router.post(
    '/2fa/desactivar',
    autenticar,
    validar({ body: desactivar2faBody }),
    controller.desactivarDosFactores,
  );
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
  router.post('/reenviar-codigo', validar({ body: reenvioBody }), controller.reenviarCodigo);
  router.post('/invitado', controller.registrarInvitado);

  return router;
}

module.exports = { createAuthRoutes };
