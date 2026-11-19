const { usuarioActual } = require('../../middleware/auth');

function createUbicacionController(service) {
  return {
    registrar: async (req, res) => {
      const data = await service.registrar(usuarioActual(req), req.datos.params.id, req.datos.body);
      res.status(201).json({ data });
    },
  };
}

function createCirculacionController(service) {
  return {
    enCirculacion: async (req, res) => {
      const data = await service.enCirculacion({ lineaId: req.datos.query.linea_id });
      res.json({ data, meta: { total: data.length } });
    },
    cercanos: async (req, res) => {
      const data = await service.cercanos(req.datos.query);
      res.json({ data, meta: { total: data.length } });
    },
    proximas: async (req, res) => {
      const data = await service.proximasAParadero(req.datos.params.id);
      res.json({ data, meta: { total: data.length } });
    },
    monitoreo: async (req, res) => {
      res.json({ data: await service.monitoreo() });
    },
  };
}

function createSimuladorFlotaController(flota) {
  return {
    estadoFlota: (req, res) => res.json({ data: flota.estado() }),
    iniciarFlota: async (req, res) => res.json({ data: await flota.iniciar() }),
    detenerFlota: async (req, res) => res.json({ data: await flota.detener() }),
  };
}

module.exports = {
  createUbicacionController,
  createCirculacionController,
  createSimuladorFlotaController,
};
