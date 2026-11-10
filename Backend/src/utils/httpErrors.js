// Errores con código HTTP. El manejador de errores de app.js los convierte en JSON.
const CODIGOS = {
  400: 'SOLICITUD_INVALIDA',
  401: 'NO_AUTENTICADO',
  403: 'SIN_PERMISO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO',
};

class HttpError extends Error {
  /**
   * @param {number} status código HTTP
   * @param {string} message mensaje para el usuario
   * @param {{ code?: string, details?: unknown }} [extra] código de error propio y detalles (p. ej. campos inválidos)
   */
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code ?? CODIGOS[status] ?? 'ERROR';
    this.details = details;
  }
}

const badRequest = (msg, extra) => new HttpError(400, msg, extra); // datos inválidos
const notFound = (msg) => new HttpError(404, msg); // no existe
const conflict = (msg) => new HttpError(409, msg); // choca con otra cosa (p. ej. horarios)

module.exports = { HttpError, badRequest, notFound, conflict };