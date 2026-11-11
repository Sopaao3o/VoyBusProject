// Viajes, ubicaciones de los vehículos y solicitudes de parada.
const { ejecutar } = require('../sql');

module.exports = {
  up: (qi) =>
    ejecutar(qi, [
      `CREATE TABLE viajes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turno_id INTEGER NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
        recorrido_id INTEGER NOT NULL REFERENCES recorridos(id),
        orden_en_turno INTEGER NOT NULL CHECK (orden_en_turno >= 1),
        inicio_planificado TEXT NOT NULL,
        termino_planificado TEXT NOT NULL,
        inicio_real TEXT,
        termino_real TEXT,
        ultimo_orden_superado INTEGER NOT NULL DEFAULT 0,
        justificacion_atraso TEXT,
        estado TEXT NOT NULL DEFAULT 'programado' CHECK (estado IN ('programado','en_curso','finalizado')),
        UNIQUE (turno_id, orden_en_turno)
      )`,
      `CREATE TABLE ubicaciones_vehiculo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        viaje_id INTEGER NOT NULL REFERENCES viajes(id) ON DELETE CASCADE,
        latitud REAL NOT NULL,
        longitud REAL NOT NULL,
        registrado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )`,
      'CREATE INDEX idx_ubicaciones_viaje ON ubicaciones_vehiculo(viaje_id, registrado_en)',
      `CREATE TABLE solicitudes_parada (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        viaje_id INTEGER NOT NULL REFERENCES viajes(id) ON DELETE CASCADE,
        pasajero_id INTEGER NOT NULL REFERENCES usuarios(id),
        paradero_id INTEGER NOT NULL REFERENCES paraderos(id),
        estado TEXT NOT NULL DEFAULT 'enviada' CHECK (estado IN ('enviada','proxima','cerrada')),
        motivo_cierre TEXT,
        creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        cerrada_en TEXT
      )`,
    ]),
  down: (qi) =>
    ejecutar(qi, [
      'DROP TABLE solicitudes_parada',
      'DROP TABLE ubicaciones_vehiculo',
      'DROP TABLE viajes',
    ]),
};
