const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Viaje',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      turno_id: { type: DataTypes.INTEGER, allowNull: false },
      recorrido_id: { type: DataTypes.INTEGER, allowNull: false },
      orden_en_turno: { type: DataTypes.INTEGER, allowNull: false },
      inicio_planificado: { type: DataTypes.STRING, allowNull: false },
      termino_planificado: { type: DataTypes.STRING, allowNull: false },
      inicio_real: DataTypes.STRING,
      termino_real: DataTypes.STRING,
      ultimo_orden_superado: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      justificacion_atraso: DataTypes.STRING,
      estado: { type: DataTypes.STRING, allowNull: false, defaultValue: 'programado' },
    },
    { tableName: 'viajes', timestamps: false },
  );
