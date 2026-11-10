const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Incidencia',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      conductor_id: { type: DataTypes.INTEGER, allowNull: false },
      vehiculo_id: { type: DataTypes.INTEGER, allowNull: false },
      turno_id: DataTypes.INTEGER,
      tipo: { type: DataTypes.STRING, allowNull: false },
      descripcion: { type: DataTypes.STRING, allowNull: false },
      fecha: { type: DataTypes.STRING, allowNull: false },
    },
    { tableName: 'incidencias', timestamps: false },
  );