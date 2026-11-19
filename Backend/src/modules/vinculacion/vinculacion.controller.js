const { usuarioActual } = require('../../middleware/auth');

function createVinculacionController(service) {
  const yo = usuarioActual;
  return {
    consultar: async (req, res) => {
      res.json({ data: await service.consultar(yo(req), req.datos.params.codigo) });
    },
    vincular: async (req, res) => {
      const { nueva, ...data } = await service.vincular(yo(req), req.datos.body.codigo);
      res.status(nueva ? 201 : 200).json({
        data,
        meta: { mensaje: `Vas en la micro ${data.vehiculo.identificador}` },
      });
    },
    actual: async (req, res) => {
      res.json({ data: await service.actual(yo(req)) });
    },
    desvincular: async (req, res) => {
      res.json({
        data: await service.desvincular(yo(req)),
        meta: { mensaje: 'Te desvinculaste del vehículo' },
      });
    },
  };
}

module.exports = { createVinculacionController };
