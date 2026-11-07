const { Router } = require('express');

/** Convierte un parámetro de ruta en entero positivo o responde 400. */
function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'El identificador debe ser un número entero positivo' });
    return null;
  }
  return id;
}

function createNetworkRoutes(service) {
  const router = Router();

  // Consultas públicas: no requieren sesión (RED-01 / RED-02)
  router.get('/lineas', (req, res) => res.json(service.listarLineas(req.query.q)));

  router.get('/lineas/:id', (req, res) => {
    const id = parseId(req, res);
    if (id !== null) res.json(service.obtenerLinea(id));
  });

  router.get('/recorridos/:id', (req, res) => {
    const id = parseId(req, res);
    if (id !== null) res.json(service.obtenerRecorrido(id));
  });

  router.get('/paraderos', (req, res) => res.json(service.listarParaderos(req.query.q)));

  router.get('/paraderos/:id', (req, res) => {
    const id = parseId(req, res);
    if (id !== null) res.json(service.obtenerParadero(id));
  });

  return router;
}

module.exports = { createNetworkRoutes };
