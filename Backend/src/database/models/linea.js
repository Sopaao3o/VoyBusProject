const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Linea',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      codigo: { type: DataTypes.STRING, allowNull: false },
      nombre: { type: DataTypes.STRING, allowNull: false },
      color: { type: DataTypes.STRING, allowNull: false, defaultValue: '#1E5FC9' },
      estado_servicio: { type: DataTypes.STRING, allowNull: false, defaultValue: 'activa' },
    },
    { tableName: 'lineas', timestamps: false },
  );