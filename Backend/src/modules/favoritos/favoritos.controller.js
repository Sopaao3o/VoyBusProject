function createFavoritosController(service) {
  return {
    listarParaderos: async (req, res) => {
      const paraderos = await service.listarParaderos(req.auth);
      res.json({ data: paraderos, meta: { total: paraderos.length } });
    },
    agregarParadero: async (req, res) => {
      res.json({ data: await service.agregarParadero(req.auth, req.datos.params.id) });
    },
    quitarParadero: async (req, res) => {
      res.json({ data: await service.quitarParadero(req.auth, req.datos.params.id) });
    },
  };
}

module.exports = { createFavoritosController };
