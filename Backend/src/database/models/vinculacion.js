const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Vinculacion',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      pasajero_id: { type: DataTypes.INTEGER, allowNull: false },
      viaje_id: { type: DataTypes.INTEGER, allowNull: false },
      creada_en: { type: DataTypes.STRING, allowNull: false },
      terminada_en: DataTypes.STRING,
      motivo_termino: DataTypes.STRING,
    },
    { tableName: 'vinculaciones', timestamps: false },
  );
