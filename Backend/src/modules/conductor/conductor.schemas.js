// Esquemas Zod de VEH-03: lo que envía el conductor.
const { z } = require('zod');

const ESTADOS_CONDUCTOR = ['operativo', 'operativo_con_observaciones', 'fuera_de_servicio'];

const texto = (mensaje) => z.string({ error: mensaje }).trim().min(1, mensaje).max(500, 'Admite hasta 500 caracteres');

// El conductor no puede declarar "en mantenimiento": eso lo decide el administrador.
const estadoVehiculoBody = z
  .object({
    estado_vehiculo: z.enum(ESTADOS_CONDUCTOR, { error: `El estado debe ser uno de: ${ESTADOS_CONDUCTOR.join(', ')}` }),
    descripcion: z.string().trim().max(500, 'Admite hasta 500 caracteres').optional(),
  })
  .refine((d) => d.estado_vehiculo === 'operativo' || Boolean(d.descripcion), {
    message: 'Describe el problema del vehículo',
    path: ['descripcion'],
  });

const incidenciaBody = z.object({
  tipo: z.enum(['vehiculo', 'recorrido'], { error: 'tipo debe ser: vehiculo o recorrido' }),
  descripcion: texto('La descripción es obligatoria'),
});

const justificacionBody = z.object({ justificacion: texto('La justificación no puede estar vacía') });

const misTurnosQuery = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato AAAA-MM-DD').optional(),
});

const incidenciasQuery = z.object({
  turno_id: z.coerce.number().int().positive().optional(),
  vehiculo_id: z.coerce.number().int().positive().optional(),
});

module.exports = { estadoVehiculoBody, incidenciaBody, justificacionBody, misTurnosQuery, incidenciasQuery };