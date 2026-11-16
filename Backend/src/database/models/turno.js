const { DataTypes } = require('sequelize');

// Las fechas se guardan como texto ISO (ej. "2026-12-10T08:00:00.000Z"): así se comparan y ordenan como texto.
module.exports = (sequelize) =>
  sequelize.define(
    'Turno',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      conductor_id: { type: DataTypes.INTEGER, allowNull: false },
      vehiculo_id: { type: DataTypes.INTEGER, allowNull: false },
      inicio_planificado: { type: DataTypes.STRING, allowNull: false },
      termino_planificado: { type: DataTypes.STRING, allowNull: false },
      inicio_real: DataTypes.STRING,
      termino_real: DataTypes.STRING,
      estado_vehiculo_recibido: DataTypes.STRING,
      estado_vehiculo_entregado: DataTypes.STRING,
      justificacion_atraso: DataTypes.STRING,
      margen_tolerancia_min: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
      estado: { type: DataTypes.STRING, allowNull: false, defaultValue: 'programado' },
    },
    { tableName: 'turnos', timestamps: false },
  );
