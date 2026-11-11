// Esquemas Zod de VIA-02: lo que envía el pasajero.
const { z } = require('zod');

const solicitudBody = z.object({
  paradero_id: z
    .number({ error: 'Debes elegir el paradero donde quieres bajarte' })
    .int('El paradero debe ser un número entero')
    .positive('El paradero debe ser mayor que cero'),
});

module.exports = { solicitudBody };