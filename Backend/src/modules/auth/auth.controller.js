// El controller de ACC-01 recibe la petición ya validada y arma la respuesta pública.
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

    verificarContacto: async (req, res) => {
      res.json({ data: await service.verificarContacto(req.datos.body) });
    },

    registrarInvitado: async (req, res) => {
      res.status(201).json({ data: await service.registrarInvitado() });
    },
  };
}

module.exports = { createAuthController };
