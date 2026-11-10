// Red de transporte: líneas, recorridos, paraderos y el orden de paraderos de cada recorrido.
const { ejecutar } = require('../sql');

module.exports = {
  up: (qi) =>
    ejecutar(qi, [
      `CREATE TABLE lineas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL UNIQUE,
        nombre TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#1E5FC9',
        estado_servicio TEXT NOT NULL DEFAULT 'activa' CHECK (estado_servicio IN ('activa','suspendida','desactivada'))
      )`,
      `CREATE TABLE recorridos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        linea_id INTEGER NOT NULL REFERENCES lineas(id) ON DELETE CASCADE,
        sentido TEXT NOT NULL CHECK (sentido IN ('ida','vuelta')),
        dias_funcionamiento TEXT NOT NULL,
        horarios TEXT NOT NULL,
        activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
        UNIQUE (linea_id, sentido)
      )`,
      `CREATE TABLE paraderos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL UNIQUE,
        nombre TEXT NOT NULL,
        latitud REAL NOT NULL CHECK (latitud BETWEEN -90 AND 90),
        longitud REAL NOT NULL CHECK (longitud BETWEEN -180 AND 180),
        activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1))
      )`,
      `CREATE TABLE recorrido_paraderos (
        recorrido_id INTEGER NOT NULL REFERENCES recorridos(id) ON DELETE CASCADE,
        orden INTEGER NOT NULL CHECK (orden >= 1),
        paradero_id INTEGER NOT NULL REFERENCES paraderos(id),
        PRIMARY KEY (recorrido_id, orden),
        UNIQUE (recorrido_id, paradero_id)
      )`,
    ]),
  down: (qi) =>
    ejecutar(qi, ['DROP TABLE recorrido_paraderos', 'DROP TABLE paraderos', 'DROP TABLE recorridos', 'DROP TABLE lineas']),
};