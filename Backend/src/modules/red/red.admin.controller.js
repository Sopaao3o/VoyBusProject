// ADM-01: el controlador solo traduce HTTP ↔ servicio.
function createRedAdminController(service) {
  return {
    listarLineas: async (req, res) => {
      const data = await service.listarLineas();
      res.json({ data, meta: { total: data.length } });
    },
    obtenerLinea: async (req, res) =>
      res.json({ data: await service.obtenerLinea(req.datos.params.id) }),
    crearLinea: async (req, res) =>
      res.status(201).json({ data: await service.crearLinea(req.datos.body) }),
    editarLinea: async (req, res) =>
      res.json({ data: await service.editarLinea(req.datos.params.id, req.datos.body) }),

    crearRecorrido: async (req, res) =>
      res
        .status(201)
        .json({ data: await service.crearRecorrido(req.datos.params.id, req.datos.body) }),
    obtenerRecorrido: async (req, res) =>
      res.json({ data: await service.obtenerRecorrido(req.datos.params.id) }),
    editarRecorrido: async (req, res) =>
      res.json({ data: await service.editarRecorrido(req.datos.params.id, req.datos.body) }),

    listarParaderos: async (req, res) => {
      const data = await service.listarParaderos();
      res.json({ data, meta: { total: data.length } });
    },
    obtenerParadero: async (req, res) =>
      res.json({ data: await service.obtenerParadero(req.datos.params.id) }),
    crearParadero: async (req, res) =>
      res.status(201).json({ data: await service.crearParadero(req.datos.body) }),
    editarParadero: async (req, res) =>
      res.json({ data: await service.editarParadero(req.datos.params.id, req.datos.body) }),
  };
}

module.exports = { createRedAdminController };
