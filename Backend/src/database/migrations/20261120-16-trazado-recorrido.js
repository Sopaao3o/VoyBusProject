// RED-01: trazado de cada recorrido por las calles (una lista de puntos [latitud, longitud] en
// JSON). Sin trazado, el recorrido se dibuja y se sigue con tramos rectos entre paraderos.
const { ejecutar } = require('../sql');

module.exports = {
  up: (qi) =>
    ejecutar(qi, [
      'ALTER TABLE recorridos ADD COLUMN trazado TEXT',
      'ALTER TABLE recorridos ADD COLUMN trazado_actualizado_en TEXT',
    ]),
  down: (qi) =>
    ejecutar(qi, [
      'ALTER TABLE recorridos DROP COLUMN trazado_actualizado_en',
      'ALTER TABLE recorridos DROP COLUMN trazado',
    ]),
};
