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
      // Puntos [latitud, longitud] por las calles, guardados como JSON. Ver leerTrazado().
      trazado: { type: DataTypes.TEXT, allowNull: true },
      trazado_actualizado_en: { type: DataTypes.STRING, allowNull: true },
    },
    { tableName: 'recorridos', timestamps: false },
  );
