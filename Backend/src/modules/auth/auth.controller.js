// Los controllers de ACC-01 a ACC-04 reciben la petición ya validada y arman la respuesta.
function createAuthController(
  service,
  { exponerCodigoVerificacion = false, exponerTokenRecuperacion = exponerCodigoVerificacion } = {},
) {
  return {
    registrar: async (req, res) => {
      const { usuario, verificacion, codigo } = await service.registrar(req.datos.body);
      const data = { usuario, verificacion };
      // Sin un servicio de correo/SMS, en desarrollo se devuelve el código para poder probar.
      // En producción se enviaría al contacto y nunca se incluiría en la respuesta.
      if (exponerCodigoVerificacion) data.verificacion.codigo_desarrollo = codigo;
      res.status(201).json({ data });
    },

    iniciarSesion: async (req, res) => {
      try {
        res.json({ data: await service.iniciarSesion(req.datos.body) });
      } catch (error) {
        // 429: indica cuántos segundos debe esperar el cliente antes de reintentar.
        if (error.retryAfterSegundos) res.set('Retry-After', String(error.retryAfterSegundos));
        throw error;
      }
    },

    cerrarSesion: async (req, res) => {
      res.json({ data: await service.cerrarSesion({ autorizacion: req.headers.authorization }) });
    },

    recuperarPassword: async (req, res) => {
      const { mensaje, token, expira_en } = await service.recuperarPassword(req.datos.body);
      const data = { mensaje };
      // Sin servicio de correo, en desarrollo se devuelve el enlace para poder probar.
      // En producción el token solo se enviaría al correo verificado.
      if (exponerTokenRecuperacion && token) {
        data.token_desarrollo = token;
        data.expira_en = expira_en;
      }
      res.json({ data });
    },

    restablecerPassword: async (req, res) => {
      res.json({ data: await service.restablecerPassword(req.datos.body) });
    },

    cambiarPassword: async (req, res) => {
      try {
        res.json({
          data: await service.cambiarPassword({ sesion: req.auth, ...req.datos.body }),
        });
      } catch (error) {
        if (error.retryAfterSegundos) res.set('Retry-After', String(error.retryAfterSegundos));
        throw error;
      }
    },

    verificarContacto: async (req, res) => {
      res.json({ data: await service.verificarContacto(req.datos.body) });
    },

    iniciarDosFactores: async (req, res) => {
      res.json({ data: await service.iniciarConfiguracion2fa({ sesion: req.auth }) });
    },

    confirmarDosFactores: async (req, res) => {
      try {
        res.json({
          data: await service.confirmarConfiguracion2fa({
            sesion: req.auth,
            ...req.datos.body,
          }),
        });
      } catch (error) {
        if (error.retryAfterSegundos) res.set('Retry-After', String(error.retryAfterSegundos));
        throw error;
      }
    },

    desactivarDosFactores: async (req, res) => {
      try {
        res.json({
          data: await service.desactivar2fa({ sesion: req.auth, ...req.datos.body }),
        });
      } catch (error) {
        if (error.retryAfterSegundos) res.set('Retry-After', String(error.retryAfterSegundos));
        throw error;
      }
    },

    verificarDosFactores: async (req, res) => {
      try {
        res.json({ data: await service.verificarSegundoFactor(req.datos.body) });
      } catch (error) {
        if (error.retryAfterSegundos) res.set('Retry-After', String(error.retryAfterSegundos));
        throw error;
      }
    },

    registrarInvitado: async (req, res) => {
      res.status(201).json({ data: await service.registrarInvitado() });
    },
  };
}

module.exports = { createAuthController };
