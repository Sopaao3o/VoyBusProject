// Autenticación de las rutas privadas con el JWT que emiten ACC-01, ACC-02 y ACC-03.
// Toda ruta protegida exige "Authorization: Bearer <token>"; ya no se acepta x-user-id.
const { HttpError } = require('../utils/httpErrors');
const { verificarToken, huellaToken, tokenDeAutorizacion } = require('../utils/jwt');

/**
 * Middleware para las rutas privadas.
 * - Sin `Authorization`: responde 401 NO_AUTENTICADO.
 * - Con un JWT válido: guarda la identidad en `req.auth`.
 * - Con un JWT inválido, expirado o cerrado: responde 401.
 */
function crearAutenticacion({ models }) {
  const { TokenRevocado } = models;

  return async (req, _res, next) => {
    const token = tokenDeAutorizacion(req.headers.authorization);
    if (!token) {
      const mensaje = req.headers.authorization
        ? 'El encabezado Authorization debe ser "Bearer <token>"'
        : 'Falta la sesión. Envía el encabezado Authorization: Bearer <token>';
      return next(new HttpError(401, mensaje, { code: 'NO_AUTENTICADO' }));
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
    if (!req.auth) {
      return next(new HttpError(401, 'Falta la sesión', { code: 'NO_AUTENTICADO' }));
    }
    if (!roles.includes(req.auth.rol)) {
      return next(
        new HttpError(403, 'No tienes permiso para esta acción', { code: 'SIN_PERMISO' }),
      );
    }
    next();
  };
}

/** Devuelve el id del usuario autenticado por el JWT. */
function usuarioActual(req) {
  if (!req.auth) {
    throw new HttpError(401, 'Falta la sesión', { code: 'NO_AUTENTICADO' });
  }
  return req.auth.usuarioId;
}

module.exports = { crearAutenticacion, requireRole, usuarioActual };
