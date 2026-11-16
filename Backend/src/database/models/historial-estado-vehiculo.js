const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'HistorialEstadoVehiculo',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      vehiculo_id: { type: DataTypes.INTEGER, allowNull: false },
      responsable_id: { type: DataTypes.INTEGER, allowNull: false },
      estado_anterior: { type: DataTypes.STRING, allowNull: false },
      estado_nuevo: { type: DataTypes.STRING, allowNull: false },
      motivo: DataTypes.STRING,
      fecha: { type: DataTypes.STRING, allowNull: false },
    },
    { tableName: 'historial_estado_vehiculo', timestamps: false },
  );
