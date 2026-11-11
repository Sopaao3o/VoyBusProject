const { DataTypes } = require('sequelize');

// Una sola fila (id = 1) con los valores por defecto del sistema.
module.exports = (sequelize) =>
  sequelize.define(
    'Configuracion',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true },
      margen_tolerancia_min: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
      actualizado_en: DataTypes.STRING,
    },
    { tableName: 'configuracion_sistema', timestamps: false },
  );
