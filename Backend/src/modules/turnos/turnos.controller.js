function createTurnosController(service) {
  return {
    listar: async (req, res) => {
      const turnos = await service.listar(req.datos.query);
      res.json({ data: turnos, meta: { total: turnos.length } });
    },
    obtener: async (req, res) => {
      res.json({ data: await service.obtener(req.datos.params.id) });
    },
    crear: async (req, res) => {
      res.status(201).json({ data: await service.crear(req.datos.body) });
    },
    modificar: async (req, res) => {
      res.json({ data: await service.modificar(req.datos.params.id, req.datos.body) });
    },
    obtenerConfiguracion: async (req, res) => {
      res.json({ data: await service.obtenerConfiguracion() });
    },
    actualizarConfiguracion: async (req, res) => {
      res.json({ data: await service.actualizarMargen(req.datos.body.margen_tolerancia_min) });
    },
  };
}

module.exports = { createTurnosController };