const { usuarioActual } = require('../../middleware/auth');

function createConductorController(service) {
  const yo = usuarioActual; // id del conductor que hace la petición
  return {
    listarTurnos: async (req, res) => {
      const turnos = await service.listarTurnos(yo(req), req.datos.query);
      res.json({ data: turnos, meta: { total: turnos.length } });
    },
    obtenerTurno: async (req, res) =>
      res.json({ data: await service.obtenerTurno(yo(req), req.datos.params.id) }),
    iniciarTurno: async (req, res) =>
      res.json({ data: await service.iniciarTurno(yo(req), req.datos.params.id, req.datos.body) }),
    finalizarTurno: async (req, res) =>
      res.json({
        data: await service.finalizarTurno(yo(req), req.datos.params.id, req.datos.body),
      }),
    cambiarEstado: async (req, res) =>
      res.json({ data: await service.cambiarEstado(yo(req), req.datos.params.id, req.datos.body) }),
    registrarIncidencia: async (req, res) =>
      res.status(201).json({
        data: await service.registrarIncidencia(yo(req), req.datos.params.id, req.datos.body),
      }),
    justificarTurno: async (req, res) =>
      res.json({
        data: await service.justificarTurno(yo(req), req.datos.params.id, req.datos.body),
      }),
    iniciarViaje: async (req, res) =>
      res.json({ data: await service.iniciarViaje(yo(req), req.datos.params.id) }),
    finalizarViaje: async (req, res) =>
      res.json({ data: await service.finalizarViaje(yo(req), req.datos.params.id) }),
    justificarViaje: async (req, res) =>
      res.json({
        data: await service.justificarViaje(yo(req), req.datos.params.id, req.datos.body),
      }),

    // administrador
    listarIncidencias: async (req, res) => {
      const incidencias = await service.listarIncidencias(req.datos.query);
      res.json({ data: incidencias, meta: { total: incidencias.length } });
    },
    historialVehiculo: async (req, res) => {
      const historial = await service.historialVehiculo(req.datos.params.id);
      res.json({ data: historial, meta: { total: historial.length } });
    },
    solicitudesDeParada: async (req, res) => {
      const grupos = await service.solicitudesDeParada(yo(req), req.datos.params.id);
      res.json({
        data: grupos,
        meta: {
          total_paraderos: grupos.length,
          total_solicitudes: grupos.reduce((n, g) => n + g.total, 0),
        },
      });
    },
  };
}

module.exports = { createConductorController };
