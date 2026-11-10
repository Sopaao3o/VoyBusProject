// Declara los modelos y sus relaciones una sola vez.
const definirUsuario = require('./usuario');
const definirLinea = require('./linea');
const definirRecorrido = require('./recorrido');
const definirParadero = require('./paradero');
const definirRecorridoParadero = require('./recorrido-paradero');
const definirVehiculo = require('./vehiculo');
const definirTurno = require('./turno');
const definirViaje = require('./viaje');
const definirIncidencia = require('./incidencia');
const definirHistorialEstadoVehiculo = require('./historial-estado-vehiculo');
const definirConfiguracion = require('./configuracion');

/** @param {import('sequelize').Sequelize} sequelize */
function initModels(sequelize) {
  const Usuario = definirUsuario(sequelize);
  const Linea = definirLinea(sequelize);
  const Recorrido = definirRecorrido(sequelize);
  const Paradero = definirParadero(sequelize);
  const RecorridoParadero = definirRecorridoParadero(sequelize);
  const Vehiculo = definirVehiculo(sequelize);
  const Turno = definirTurno(sequelize);
  const Viaje = definirViaje(sequelize);
  const Incidencia = definirIncidencia(sequelize);
  const HistorialEstadoVehiculo = definirHistorialEstadoVehiculo(sequelize);
  const Configuracion = definirConfiguracion(sequelize);

  // Una línea tiene recorridos (ida y vuelta)
  Linea.hasMany(Recorrido, { foreignKey: 'linea_id', as: 'recorridos' });
  Recorrido.belongsTo(Linea, { foreignKey: 'linea_id', as: 'linea' });

  // Un recorrido pasa por paraderos en un orden
  Recorrido.hasMany(RecorridoParadero, { foreignKey: 'recorrido_id', as: 'paradas' });
  RecorridoParadero.belongsTo(Recorrido, { foreignKey: 'recorrido_id', as: 'recorrido' });
  Paradero.hasMany(RecorridoParadero, { foreignKey: 'paradero_id', as: 'paradas' });
  RecorridoParadero.belongsTo(Paradero, { foreignKey: 'paradero_id', as: 'paradero' });

  // Un turno es de un conductor, con un vehículo, y tiene viajes (cada viaje sigue un recorrido)
  Turno.belongsTo(Usuario, { foreignKey: 'conductor_id', as: 'conductor' });
  Turno.belongsTo(Vehiculo, { foreignKey: 'vehiculo_id', as: 'vehiculo' });
  Turno.hasMany(Viaje, { foreignKey: 'turno_id', as: 'viajes' });
  Viaje.belongsTo(Turno, { foreignKey: 'turno_id', as: 'turno' });
  Viaje.belongsTo(Recorrido, { foreignKey: 'recorrido_id', as: 'recorrido' });

  // Lo que informan los conductores
  Incidencia.belongsTo(Usuario, { foreignKey: 'conductor_id', as: 'conductor' });
  Incidencia.belongsTo(Vehiculo, { foreignKey: 'vehiculo_id', as: 'vehiculo' });
  HistorialEstadoVehiculo.belongsTo(Usuario, { foreignKey: 'responsable_id', as: 'responsable' });
  HistorialEstadoVehiculo.belongsTo(Vehiculo, { foreignKey: 'vehiculo_id', as: 'vehiculo' });

  return {
    sequelize,
    Usuario,
    Linea,
    Recorrido,
    Paradero,
    RecorridoParadero,
    Vehiculo,
    Turno,
    Viaje,
    Incidencia,
    HistorialEstadoVehiculo,
    Configuracion,
  };
}

module.exports = { initModels };