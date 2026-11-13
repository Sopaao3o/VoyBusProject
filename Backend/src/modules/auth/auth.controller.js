// Los controllers de ACC-01, ACC-02 y ACC-03 reciben la petición ya validada y arman la respuesta.
function createAuthController(service, { exponerCodigoVerificacion = false } = {}) {
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

    verificarContacto: async (req, res) => {
      res.json({ data: await service.verificarContacto(req.datos.body) });
    },

    registrarInvitado: async (req, res) => {
      res.status(201).json({ data: await service.registrarInvitado() });
    },
  };
}

module.exports = { createAuthController };
