const { DataTypes } = require('sequelize');

// Guarda el orden de los paraderos dentro de cada recorrido.
module.exports = (sequelize) =>
  sequelize.define(
    'RecorridoParadero',
    {
      recorrido_id: { type: DataTypes.INTEGER, primaryKey: true },
      orden: { type: DataTypes.INTEGER, primaryKey: true },
      paradero_id: { type: DataTypes.INTEGER, allowNull: false },
    },
    { tableName: 'recorrido_paraderos', timestamps: false },
  );
