const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'SolicitudParada',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      viaje_id: { type: DataTypes.INTEGER, allowNull: false },
      pasajero_id: { type: DataTypes.INTEGER, allowNull: false },
      paradero_id: { type: DataTypes.INTEGER, allowNull: false },
      estado: { type: DataTypes.STRING, allowNull: false, defaultValue: 'enviada' },
      motivo_cierre: DataTypes.STRING,
      creada_en: { type: DataTypes.STRING, allowNull: false },
      cerrada_en: DataTypes.STRING,
    },
    { tableName: 'solicitudes_parada', timestamps: false },
  );