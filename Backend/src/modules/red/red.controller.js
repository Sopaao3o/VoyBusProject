// El controller recibe la petición ya validada, llama al service y arma la respuesta.
function createRedController(service) {
  return {
    listarLineas: async (req, res) => {
      const lineas = await service.listarLineas(req.datos.query.q);
      res.json({ data: lineas, meta: { total: lineas.length } });
    },
    obtenerLinea: async (req, res) => {
      res.json({ data: await service.obtenerLinea(req.datos.params.id) });
    },
    obtenerRecorrido: async (req, res) => {
      res.json({ data: await service.obtenerRecorrido(req.datos.params.id) });
    },
    listarParaderos: async (req, res) => {
      const paraderos = await service.listarParaderos(req.datos.query.q);
      res.json({ data: paraderos, meta: { total: paraderos.length } });
    },
    obtenerParadero: async (req, res) => {
      res.json({ data: await service.obtenerParadero(req.datos.params.id) });
    },
  };
}

module.exports = { createRedController };