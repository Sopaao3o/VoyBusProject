// Esquemas Zod de VIA-01: el código del vehículo (escaneado del QR o escrito a mano).
const { z } = require('zod');

const codigo = z
  .string({ error: 'Escribe el código del vehículo' })
  .trim()
  .min(1, 'Escribe el código del vehículo')
  .max(80, 'El código es demasiado largo');

const vinculacionBody = z.object({ codigo });
const codigoParams = z.object({ codigo });

module.exports = { vinculacionBody, codigoParams };
