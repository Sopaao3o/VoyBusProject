const { usuarioActual } = require('../../middleware/auth');

function createUbicacionController(service) {
  return {
    registrar: async (req, res) => {
      const data = await service.registrar(usuarioActual(req), req.datos.params.id, req.datos.body);
      res.status(201).json({ data });
    },
  };
}

module.exports = { createUbicacionController };
