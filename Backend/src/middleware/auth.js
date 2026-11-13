// Autenticación de las rutas privadas con el JWT que emiten ACC-01, ACC-02 y ACC-03.
// Las pruebas y el frontend antiguo todavía pueden usar "x-user-id"; cuando el encabezado
// Authorization viene, el token manda y un token cerrado ya no da acceso.
const { HttpError } = require('../utils/httpErrors');
const { verificarToken, huellaToken, tokenDeAutorizacion } = require('../utils/jwt');

/**
 * Middleware para las rutas privadas.
 * - Sin `Authorization`: deja pasar (compatibilidad provisional con `x-user-id`).
 * - Con un JWT válido: guarda la identidad en `req.auth`.
 * - Con un JWT inválido, expirado o cerrado: responde 401.
 */
function crearAutenticacion({ models }) {
  const { TokenRevocado } = models;

  return async (req, _res, next) => {
    if (!req.headers.authorization) return next();

    const token = tokenDeAutorizacion(req.headers.authorization);
    if (!token) {
      return next(
        new HttpError(401, 'El encabezado Authorization debe ser "Bearer <token>"', {
          code: 'TOKEN_INVALIDO',
        }),
      );
    }

    let payload;
    try {
      payload = verificarToken(token);
    } catch {
      return next(
        new HttpError(401, 'La sesión no es válida o expiró', { code: 'TOKEN_INVALIDO' }),
      );
    }

    const usuarioId = Number(payload.sub);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0 || !Number.isFinite(payload.exp)) {
      return next(new HttpError(401, 'La sesión no es válida', { code: 'TOKEN_INVALIDO' }));
    }

    const tokenHash = huellaToken(token);
    if (await TokenRevocado.findByPk(tokenHash)) {
      return next(new HttpError(401, 'La sesión ya fue cerrada', { code: 'SESION_CERRADA' }));
    }

    req.auth = {
      usuarioId,
      rol: payload.rol,
      tipoAcceso: payload.tipo_acceso,
      tokenHash,
      expiraEn: new Date(payload.exp * 1000).toISOString(),
    };
    next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    // Sin token se mantiene el comportamiento provisional (las pruebas usan x-user-id).
    if (!req.auth) return next();
    if (!roles.includes(req.auth.rol)) {
      return next(
        new HttpError(403, 'No tienes permiso para esta acción', { code: 'SIN_PERMISO' }),
      );
    }
    next();
  };
}

/**
 * Devuelve el id del usuario que hace la petición: primero el JWT y, si no vino,
 * el encabezado "x-user-id" (solo para desarrollo y pruebas).
 */
function usuarioActual(req) {
  if (req.auth) return req.auth.usuarioId;

  const id = Number(req.headers['x-user-id']);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(401, 'No se pudo identificar al usuario (falta el encabezado x-user-id)');
  }
  return id;
}

module.exports = { crearAutenticacion, requireRole, usuarioActual };
