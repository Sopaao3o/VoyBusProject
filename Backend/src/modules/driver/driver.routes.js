const { Router } = require('express');
const { requireRole, usuarioActual } = require('../../middleware/auth');
const { badRequest } = require('../../utils/httpErrors');

function parseId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('El identificador debe ser un número entero positivo');
  return id;
}

/** Rutas del conductor: /api/conductor/... */
function createDriverRoutes(service) {
  const router = Router();
  const soloConductor = requireRole('conductor');
  const yo = usuarioActual;

  router.get('/turnos', soloConductor, (req, res) => res.json(service.listarTurnos(yo(req), req.query)));
  router.get('/turnos/:id', soloConductor, (req, res) => res.json(service.obtenerTurno(yo(req), parseId(req))));
  router.post('/turnos/:id/iniciar', soloConductor, (req, res) => res.json(service.iniciarTurno(yo(req), parseId(req), req.body)));
  router.post('/turnos/:id/finalizar', soloConductor, (req, res) => res.json(service.finalizarTurno(yo(req), parseId(req), req.body)));
  router.post('/turnos/:id/estado-vehiculo', soloConductor, (req, res) => res.json(service.cambiarEstado(yo(req), parseId(req), req.body)));
  router.post('/turnos/:id/incidencias', soloConductor, (req, res) =>
    res.status(201).json(service.registrarIncidencia(yo(req), parseId(req), req.body)));
  router.put('/turnos/:id/justificacion', soloConductor, (req, res) =>
    res.json(service.justificarTurno(yo(req), parseId(req), req.body)));

  router.post('/viajes/:id/iniciar', soloConductor, (req, res) => res.json(service.iniciarViaje(yo(req), parseId(req))));
  router.post('/viajes/:id/finalizar', soloConductor, (req, res) => res.json(service.finalizarViaje(yo(req), parseId(req))));
  router.put('/viajes/:id/justificacion', soloConductor, (req, res) =>
    res.json(service.justificarViaje(yo(req), parseId(req), req.body)));

  return router;
}

/** Consultas del administrador sobre lo que registran los conductores: /api/admin/... */
function createDriverAdminRoutes(service) {
  const router = Router();
  const soloAdmin = requireRole('administrador');

  router.get('/incidencias', soloAdmin, (req, res) => res.json(service.listarIncidencias(req.query)));
  router.get('/vehiculos/:id/historial', soloAdmin, (req, res) => res.json(service.historialVehiculo(parseId(req))));

  return router;
}

module.exports = { createDriverRoutes, createDriverAdminRoutes };