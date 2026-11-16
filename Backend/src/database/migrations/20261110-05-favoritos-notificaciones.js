// Favoritos y notificaciones del pasajero.
const { ejecutar } = require('../sql');

module.exports = {
  up: (qi) =>
    ejecutar(qi, [
      `CREATE TABLE favoritos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        linea_id INTEGER REFERENCES lineas(id) ON DELETE CASCADE,
        paradero_id INTEGER REFERENCES paraderos(id) ON DELETE CASCADE,
        CHECK ((linea_id IS NOT NULL) + (paradero_id IS NOT NULL) = 1)
      )`,
      `CREATE TABLE notificaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        tipo TEXT NOT NULL,
        mensaje TEXT NOT NULL,
        creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        leida INTEGER NOT NULL DEFAULT 0 CHECK (leida IN (0,1))
      )`,
    ]),
  down: (qi) => ejecutar(qi, ['DROP TABLE notificaciones', 'DROP TABLE favoritos']),
};
