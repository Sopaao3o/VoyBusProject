// Flota y operación: vehículos, turnos, incidencias, historial de estado y configuración.
const { ejecutar } = require('../sql');

module.exports = {
  up: (qi) =>
    ejecutar(qi, [
      `CREATE TABLE vehiculos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        identificador TEXT NOT NULL UNIQUE,
        patente TEXT NOT NULL UNIQUE,
        capacidad INTEGER NOT NULL CHECK (capacidad > 0),
        estado_operativo TEXT NOT NULL DEFAULT 'operativo'
          CHECK (estado_operativo IN ('operativo','operativo_con_observaciones','en_mantenimiento','fuera_de_servicio')),
        habilitado INTEGER NOT NULL DEFAULT 1 CHECK (habilitado IN (0,1))
      )`,
      `CREATE TABLE turnos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conductor_id INTEGER NOT NULL REFERENCES usuarios(id),
        vehiculo_id INTEGER NOT NULL REFERENCES vehiculos(id),
        inicio_planificado TEXT NOT NULL,
        termino_planificado TEXT NOT NULL,
        inicio_real TEXT,
        termino_real TEXT,
        estado_vehiculo_recibido TEXT,
        estado_vehiculo_entregado TEXT,
        justificacion_atraso TEXT,
        estado TEXT NOT NULL DEFAULT 'programado' CHECK (estado IN ('programado','en_curso','finalizado')),
        CHECK (termino_planificado > inicio_planificado)
      )`,
      'CREATE INDEX idx_turnos_conductor ON turnos(conductor_id, inicio_planificado)',
      'CREATE INDEX idx_turnos_vehiculo ON turnos(vehiculo_id, inicio_planificado)',
      `CREATE TABLE incidencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conductor_id INTEGER NOT NULL REFERENCES usuarios(id),
        vehiculo_id INTEGER NOT NULL REFERENCES vehiculos(id),
        turno_id INTEGER REFERENCES turnos(id),
        tipo TEXT NOT NULL,
        descripcion TEXT NOT NULL,
        fecha TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )`,
      `CREATE TABLE historial_estado_vehiculo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehiculo_id INTEGER NOT NULL REFERENCES vehiculos(id),
        responsable_id INTEGER NOT NULL REFERENCES usuarios(id),
        estado_anterior TEXT NOT NULL,
        estado_nuevo TEXT NOT NULL,
        motivo TEXT,
        fecha TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )`,
      `CREATE TABLE configuracion_sistema (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        margen_tolerancia_min INTEGER NOT NULL DEFAULT 5 CHECK (margen_tolerancia_min >= 0),
        actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )`,
      'INSERT INTO configuracion_sistema (id) VALUES (1)',
    ]),
  down: (qi) =>
    ejecutar(qi, [
      'DROP TABLE configuracion_sistema',
      'DROP TABLE historial_estado_vehiculo',
      'DROP TABLE incidencias',
      'DROP TABLE turnos',
      'DROP TABLE vehiculos',
    ]),
};