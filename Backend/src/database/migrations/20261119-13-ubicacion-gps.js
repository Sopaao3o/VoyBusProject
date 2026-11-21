// VEH-01: cada posición guarda de dónde viene (GPS del teléfono del conductor o el simulador
// de desarrollo) y su precisión, para no usar posiciones imprecisas al calcular el avance.
const { ejecutar } = require('../sql');

module.exports = {
  up: (qi) =>
    ejecutar(qi, [
      'ALTER TABLE ubicaciones_vehiculo ADD COLUMN precision_m REAL',
      `ALTER TABLE ubicaciones_vehiculo ADD COLUMN origen TEXT NOT NULL DEFAULT 'gps'
        CHECK (origen IN ('gps', 'simulador'))`,
    ]),
  down: (qi) =>
    ejecutar(qi, [
      'ALTER TABLE ubicaciones_vehiculo DROP COLUMN origen',
      'ALTER TABLE ubicaciones_vehiculo DROP COLUMN precision_m',
    ]),
};
