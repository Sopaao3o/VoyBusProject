// Declara los modelos y sus relaciones una sola vez.
const definirUsuario = require('./usuario');
const definirLinea = require('./linea');
const definirRecorrido = require('./recorrido');
const definirParadero = require('./paradero');
const definirRecorridoParadero = require('./recorrido-paradero');

/** @param {import('sequelize').Sequelize} sequelize */
function initModels(sequelize) {
  const Usuario = definirUsuario(sequelize);
  const Linea = definirLinea(sequelize);
  const Recorrido = definirRecorrido(sequelize);
  const Paradero = definirParadero(sequelize);
  const RecorridoParadero = definirRecorridoParadero(sequelize);

  // Una línea tiene recorridos (ida y vuelta)
  Linea.hasMany(Recorrido, { foreignKey: 'linea_id', as: 'recorridos' });
  Recorrido.belongsTo(Linea, { foreignKey: 'linea_id', as: 'linea' });

  // Un recorrido pasa por paraderos en un orden
  Recorrido.hasMany(RecorridoParadero, { foreignKey: 'recorrido_id', as: 'paradas' });
  RecorridoParadero.belongsTo(Recorrido, { foreignKey: 'recorrido_id', as: 'recorrido' });
  Paradero.hasMany(RecorridoParadero, { foreignKey: 'paradero_id', as: 'paradas' });
  RecorridoParadero.belongsTo(Paradero, { foreignKey: 'paradero_id', as: 'paradero' });

  return { sequelize, Usuario, Linea, Recorrido, Paradero, RecorridoParadero };
}

module.exports = { initModels };