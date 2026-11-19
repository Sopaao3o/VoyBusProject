const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'UbicacionVehiculo',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      viaje_id: { type: DataTypes.INTEGER, allowNull: false },
      latitud: { type: DataTypes.FLOAT, allowNull: false },
      longitud: { type: DataTypes.FLOAT, allowNull: false },
      registrado_en: { type: DataTypes.STRING, allowNull: false },
      precision_m: DataTypes.FLOAT,
      origen: { type: DataTypes.STRING, allowNull: false, defaultValue: 'gps' },
    },
    { tableName: 'ubicaciones_vehiculo', timestamps: false },
  );
