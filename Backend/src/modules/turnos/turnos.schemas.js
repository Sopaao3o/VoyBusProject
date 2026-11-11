// Esquemas Zod de ADM-03: qué datos acepta la gestión de turnos.
const { z } = require('zod');

/** Fecha en formato ISO 8601; queda normalizada a "2026-12-10T08:00:00.000Z". */
const fecha = z
  .string({ error: 'Debe ser una fecha (ISO 8601)' })
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Debe ser una fecha válida (ISO 8601)')
  .transform((v) => new Date(v).toISOString());

const idPositivo = z
  .number({ error: 'Es obligatorio y debe ser un número' })
  .int('Debe ser un número entero')
  .positive('Debe ser mayor que cero');

const margen = z
  .number({ error: 'El margen debe ser un número' })
  .int('El margen debe ser un número entero de minutos')
  .min(0, 'El margen no puede ser negativo')
  .max(120, 'El margen no puede superar 120 minutos');

const viaje = z.object({
  recorrido_id: idPositivo,
  inicio_planificado: fecha,
  termino_planificado: fecha,
});

const turnoBody = z
  .object({
    conductor_id: idPositivo,
    vehiculo_id: idPositivo,
    inicio_planificado: fecha,
    termino_planificado: fecha,
    margen_tolerancia_min: margen.optional(),
    viajes: z
      .array(viaje, { error: 'Los viajes deben ser una lista' })
      .min(1, 'El turno debe incluir al menos un viaje'),
  })
  .superRefine((t, ctx) => {
    const problema = (message, path) => ctx.addIssue({ code: 'custom', message, path });
    if (t.termino_planificado <= t.inicio_planificado) {
      problema('El término del turno debe ser posterior al inicio', ['termino_planificado']);
    }
    t.viajes.forEach((v, i) => {
      if (v.termino_planificado <= v.inicio_planificado) {
        problema('El término del viaje debe ser posterior a su inicio', [
          'viajes',
          i,
          'termino_planificado',
        ]);
      }
      if (
        v.inicio_planificado < t.inicio_planificado ||
        v.termino_planificado > t.termino_planificado
      ) {
        problema('El viaje debe quedar dentro del horario del turno', [
          'viajes',
          i,
          'inicio_planificado',
        ]);
      }
    });
    const porHora = [...t.viajes].sort((a, b) =>
      a.inicio_planificado.localeCompare(b.inicio_planificado),
    );
    for (let i = 1; i < porHora.length; i++) {
      if (porHora[i].inicio_planificado < porHora[i - 1].termino_planificado) {
        problema('Los viajes de un turno no pueden superponerse', ['viajes']);
        break;
      }
    }
  })
  // El orden de los viajes sale del horario, no del orden en que se enviaron.
  .transform((t) => ({
    ...t,
    viajes: [...t.viajes].sort((a, b) => a.inicio_planificado.localeCompare(b.inicio_planificado)),
  }));

const listarQuery = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato AAAA-MM-DD')
    .optional(),
  conductor_id: z.coerce.number().int().positive().optional(),
});

const configuracionBody = z.object({ margen_tolerancia_min: margen });

module.exports = { turnoBody, listarQuery, configuracionBody };
