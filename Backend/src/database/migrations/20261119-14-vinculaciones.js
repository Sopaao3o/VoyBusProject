// VIA-01: el pasajero se vincula al vehículo en el que viaja (por QR o código). Mientras está
// vinculado puede elegir destino y pedir parada. Solo una vinculación activa por pasajero.
const { ejecutar } = require('../sql');

module.exports = {
  up: (qi) =>
    ejecutar(qi, [
      `CREATE TABLE vinculaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pasajero_id INTEGER NOT NULL REFERENCES usuarios(id),
        viaje_id INTEGER NOT NULL REFERENCES viajes(id) ON DELETE CASCADE,
        creada_en TEXT NOT NULL,
        terminada_en TEXT,
        motivo_termino TEXT CHECK (motivo_termino IN ('desvinculado', 'viaje_finalizado'))
      )`,
      // Una sola vinculación activa por pasajero, aunque lleguen dos peticiones a la vez.
      'CREATE UNIQUE INDEX uq_vinculacion_activa ON vinculaciones(pasajero_id) WHERE terminada_en IS NULL',
      'CREATE INDEX idx_vinculaciones_viaje ON vinculaciones(viaje_id)',
    ]),
  down: (qi) => ejecutar(qi, ['DROP TABLE vinculaciones']),
};
