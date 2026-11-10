// Reglas de negocio garantizadas por la propia base (índices únicos parciales).
const { ejecutar } = require('../sql');

module.exports = {
  up: (qi) =>
    ejecutar(qi, [
      // Un pasajero solo puede tener una solicitud de parada abierta por viaje
      `CREATE UNIQUE INDEX uq_solicitud_abierta ON solicitudes_parada(viaje_id, pasajero_id) WHERE estado <> 'cerrada'`,
      // Un favorito no se repite
      'CREATE UNIQUE INDEX uq_fav_linea ON favoritos(usuario_id, linea_id) WHERE linea_id IS NOT NULL',
      'CREATE UNIQUE INDEX uq_fav_paradero ON favoritos(usuario_id, paradero_id) WHERE paradero_id IS NOT NULL',
      // Un conductor, un solo turno en curso
      `CREATE UNIQUE INDEX uq_turno_en_curso_por_conductor ON turnos(conductor_id) WHERE estado = 'en_curso'`,
      // Un turno, un solo viaje en curso
      `CREATE UNIQUE INDEX uq_viaje_en_curso_por_turno ON viajes(turno_id) WHERE estado = 'en_curso'`,
    ]),
  down: (qi) =>
    ejecutar(qi, [
      'DROP INDEX uq_viaje_en_curso_por_turno',
      'DROP INDEX uq_turno_en_curso_por_conductor',
      'DROP INDEX uq_fav_paradero',
      'DROP INDEX uq_fav_linea',
      'DROP INDEX uq_solicitud_abierta',
    ]),
};