// Esquemas Zod: qué datos aceptan las rutas de la red de transporte.
const { z } = require('zod');

const idParams = z.object({
  id: z.coerce
    .number({ error: 'El identificador debe ser un número' })
    .int('El identificador debe ser un número entero')
    .positive('El identificador debe ser mayor que cero'),
});

const busquedaQuery = z.object({
  q: z
    .string({ error: 'La búsqueda debe ser un texto' })
    .trim()
    .max(60, 'La búsqueda admite hasta 60 caracteres')
    .optional(),
});

module.exports = { idParams, busquedaQuery };
