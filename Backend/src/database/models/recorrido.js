const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Recorrido',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      linea_id: { type: DataTypes.INTEGER, allowNull: false },
      sentido: { type: DataTypes.STRING, allowNull: false },
      dias_funcionamiento: { type: DataTypes.STRING, allowNull: false },
      horarios: { type: DataTypes.STRING, allowNull: false },
      activo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    },
    { tableName: 'recorridos', timestamps: false },
  );