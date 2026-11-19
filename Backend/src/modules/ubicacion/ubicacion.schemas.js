// Esquema Zod de VEH-01: la posición que envía el teléfono del conductor.
const { z } = require('zod');

const coordenada = (nombre, minimo, maximo) =>
  z
    .number({ error: `La ${nombre} debe ser un número` })
    .min(minimo, `La ${nombre} debe estar entre ${minimo} y ${maximo}`)
    .max(maximo, `La ${nombre} debe estar entre ${minimo} y ${maximo}`);

const ubicacionBody = z.object({
  latitud: coordenada('latitud', -90, 90),
  longitud: coordenada('longitud', -180, 180),
  precision_m: z
    .number({ error: 'La precisión debe ser un número de metros' })
    .nonnegative('La precisión no puede ser negativa')
    .optional(),
  origen: z.enum(['gps', 'simulador'], { error: 'El origen debe ser: gps o simulador' }).optional(),
});

const lineaQuery = z.object({
  linea_id: z.coerce
    .number({ error: 'La línea debe ser un número' })
    .int('La línea debe ser un número entero')
    .positive('La línea debe ser mayor que cero')
    .optional(),
});

const cercanosQuery = z.object({
  latitud: z.coerce.number({ error: 'Indica la latitud' }).min(-90).max(90),
  longitud: z.coerce.number({ error: 'Indica la longitud' }).min(-180).max(180),
  limite: z.coerce.number().int().min(1).max(10).optional(),
});

module.exports = { ubicacionBody, lineaQuery, cercanosQuery };
