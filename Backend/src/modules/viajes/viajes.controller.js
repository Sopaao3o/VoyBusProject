const { usuarioActual } = require('../../middleware/auth');

function createViajesController(service) {
  const yo = usuarioActual; // id del pasajero que hace la petición
  return {
    paraderosDisponibles: async (req, res) => {
      res.json({ data: await service.paraderosDisponibles(yo(req), req.datos.params.id) });
    },
    solicitarParada: async (req, res) => {
      const data = await service.solicitarParada(yo(req), req.datos.params.id, req.datos.body);
      res.status(201).json({ data, meta: { mensaje: 'Tu solicitud de parada fue enviada' } });
    },
    miSolicitud: async (req, res) => {
      res.json({ data: await service.miSolicitud(yo(req), req.datos.params.id) });
    },
    listarViajesEnCurso: async (req, res) => {
      const data = await service.viajesEnCurso();
      res.json({ data, meta: { total: data.length } });
    },
    simularAvance: async (req, res) => {
      res.json({ data: await service.simularAvance(req.datos.params.id) });
    },
  };
}

module.exports = { createViajesController };
