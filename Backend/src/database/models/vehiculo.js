const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Vehiculo',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      identificador: { type: DataTypes.STRING, allowNull: false },
      patente: { type: DataTypes.STRING, allowNull: false },
      capacidad: { type: DataTypes.INTEGER, allowNull: false },
      estado_operativo: { type: DataTypes.STRING, allowNull: false, defaultValue: 'operativo' },
      habilitado: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    },
    { tableName: 'vehiculos', timestamps: false },
  );