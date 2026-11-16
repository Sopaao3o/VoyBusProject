const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Paradero',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      codigo: { type: DataTypes.STRING, allowNull: false },
      nombre: { type: DataTypes.STRING, allowNull: false },
      latitud: { type: DataTypes.FLOAT, allowNull: false },
      longitud: { type: DataTypes.FLOAT, allowNull: false },
      activo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    },
    { tableName: 'paraderos', timestamps: false },
  );
