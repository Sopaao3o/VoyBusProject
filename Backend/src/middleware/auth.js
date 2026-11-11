// PLACEHOLDER de autenticación.
// Daslav implementa las sesiones (token opaco en "Authorization: Bearer"). Cuando estén listas,
// solo hay que reemplazar el cuerpo de estas dos funciones; las rutas ya las usan y no se tocan.
const { HttpError } = require('../utils/httpErrors');

function requireRole(..._roles) {
  return (req, res, next) => {
    // TODO(auth): validar la sesión y que el rol del usuario esté en `roles`.
    next();
  };
}

/**
 * Devuelve el id del usuario que hace la petición.
 * TEMPORAL: se lee del encabezado "x-user-id" (solo para desarrollo y pruebas).
 * TODO(auth): reemplazar por `return req.auth.userId;` cuando existan las sesiones.
 */
function usuarioActual(req) {
  const id = Number(req.headers['x-user-id']);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(401, 'No se pudo identificar al usuario (falta el encabezado x-user-id)');
  }
  return id;
}

module.exports = { requireRole, usuarioActual };
