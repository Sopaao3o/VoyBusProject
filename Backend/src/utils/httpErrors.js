// Errores con código HTTP. El manejador de errores de app.js los convierte en JSON.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const badRequest = (msg) => new HttpError(400, msg); // datos inválidos
const notFound = (msg) => new HttpError(404, msg); // no existe
const conflict = (msg) => new HttpError(409, msg); // choca con otra cosa (p. ej. horarios)

module.exports = { HttpError, badRequest, notFound, conflict };