const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Usuario',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      rol: { type: DataTypes.STRING, allowNull: false },
      nombre_visible: { type: DataTypes.STRING, allowNull: false },
      alias: DataTypes.STRING,
      correo: DataTypes.STRING,
      telefono: DataTypes.STRING,
      password_hash: DataTypes.STRING,
      estado: { type: DataTypes.STRING, allowNull: false, defaultValue: 'habilitado' },
      dos_factores_activo: { type: DataTypes.INTEGER, defaultValue: 0 },
      tipo_acceso: { type: DataTypes.STRING, defaultValue: 'registrado' },
      identificador: DataTypes.STRING,
      datos_contacto: DataTypes.STRING,
      fecha_registro: DataTypes.STRING,
    },
    { tableName: 'usuarios', timestamps: false },
  );
