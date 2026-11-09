const { Router } = require('express');
const { requireRole } = require('../../middleware/auth');
const { badRequest } = require('../../utils/httpErrors');

function parseId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('El identificador debe ser un número entero positivo');
  return id;
}

function createShiftsRoutes(service) {
  const router = Router();
  const soloAdmin = requireRole('administrador');

  router.get('/turnos', soloAdmin, (req, res) => res.json(service.listar(req.query)));
  router.get('/turnos/:id', soloAdmin, (req, res) => res.json(service.obtener(parseId(req))));
  router.post('/turnos', soloAdmin, (req, res) => res.status(201).json(service.crear(req.body)));
  router.put('/turnos/:id', soloAdmin, (req, res) => res.json(service.modificar(parseId(req), req.body)));

  router.get('/configuracion', soloAdmin, (req, res) => res.json(service.obtenerConfiguracion()));
  router.put('/configuracion', soloAdmin, (req, res) =>
    res.json(service.actualizarMargen(req.body?.margen_tolerancia_min)),
  );

  return router;
}

module.exports = { createShiftsRoutes };