// Esquemas Zod de ADM-01: lo que envía el administrador para gestionar la red.
const { z } = require('zod');

const texto = (nombre, minimo, maximo) =>
  z
    .string({ error: `${nombre} es obligatorio` })
    .trim()
    .min(minimo, `${nombre} debe tener al menos ${minimo} caracteres`)
    .max(maximo, `${nombre} admite hasta ${maximo} caracteres`);

const codigo = (nombre) =>
  texto(nombre, 1, 12).regex(
    /^[A-Za-z0-9-]+$/,
    `${nombre} solo admite letras, números y guiones, sin espacios`,
  );

const ESTADOS_LINEA = ['activa', 'suspendida', 'desactivada'];

const lineaBody = z.object({
  codigo: codigo('El código de la línea'),
  nombre: texto('El nombre de la línea', 3, 60),
  color: z
    .string({ error: 'El color es obligatorio' })
    .regex(/^#[0-9A-Fa-f]{6}$/, 'El color debe tener el formato #RRGGBB, por ejemplo #1E5FC9'),
  estado_servicio: z
    .enum(ESTADOS_LINEA, { error: `El estado debe ser: ${ESTADOS_LINEA.join(', ')}` })
    .optional(),
});
const lineaCambios = lineaBody.partial().refine((d) => Object.keys(d).length > 0, {
  message: 'No hay cambios que guardar',
});

const listaParaderos = z
  .array(z.number().int().positive(), { error: 'Elige los paraderos del recorrido, en orden' })
  .min(2, 'Un recorrido necesita al menos dos paraderos: inicio y término')
  .max(60, 'Un recorrido admite hasta 60 paraderos')
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'Un paradero no puede repetirse en el mismo recorrido',
  });

const recorridoBody = z.object({
  sentido: z.enum(['ida', 'vuelta'], { error: 'El sentido debe ser ida o vuelta' }),
  dias_funcionamiento: texto('Los días de funcionamiento', 3, 60),
  horarios: texto('Los horarios', 3, 80),
  activo: z.boolean().optional(),
  paraderos: listaParaderos,
});
const recorridoCambios = recorridoBody
  .omit({ sentido: true })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay cambios que guardar' });

const coordenada = (nombre, minimo, maximo) =>
  z
    .number({ error: `La ${nombre} debe ser un número` })
    .min(minimo, `La ${nombre} debe estar entre ${minimo} y ${maximo}`)
    .max(maximo, `La ${nombre} debe estar entre ${minimo} y ${maximo}`);

const paraderoBody = z.object({
  codigo: codigo('El código del paradero'),
  nombre: texto('El nombre del paradero', 3, 60),
  latitud: coordenada('latitud', -90, 90),
  longitud: coordenada('longitud', -180, 180),
  activo: z.boolean().optional(),
});
const paraderoCambios = paraderoBody.partial().refine((d) => Object.keys(d).length > 0, {
  message: 'No hay cambios que guardar',
});

/** Generar la red de Antofagasta: `descargar` vuelve a bajar las calles aunque haya copia. */
const generarRedBody = z.object({ descargar: z.boolean().optional() }).optional();

module.exports = {
  generarRedBody,
  lineaBody,
  lineaCambios,
  recorridoBody,
  recorridoCambios,
  paraderoBody,
  paraderoCambios,
};
