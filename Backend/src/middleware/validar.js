const { HttpError } = require('../utils/httpErrors');

/**
 * Valida con Zod las partes de la petición que se indiquen.
 * Uso: validar({ params: esquemaParams, query: esquemaQuery, body: esquemaBody })
 * Si todo es válido, deja los datos ya limpios y convertidos en `req.datos`.
 * Si no, responde 400 con la lista de campos inválidos.
 */
function validar(esquemas) {
  return (req, res, next) => {
    const datos = {};
    const detalles = [];
    for (const parte of ['params', 'query', 'body']) {
      if (!esquemas[parte]) continue;
      const resultado = esquemas[parte].safeParse(req[parte] ?? {});
      if (resultado.success) {
        datos[parte] = resultado.data;
      } else {
        for (const problema of resultado.error.issues) {
          detalles.push({ campo: [parte, ...problema.path].join('.'), mensaje: problema.message });
        }
      }
    }
    if (detalles.length > 0) {
      return next(
        new HttpError(400, 'Los datos enviados no son válidos', {
          code: 'VALIDACION',
          details: detalles,
        }),
      );
    }
    req.datos = datos;
    next();
  };
}

module.exports = { validar };
