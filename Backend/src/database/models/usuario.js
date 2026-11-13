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
      dos_factores_secreto: DataTypes.STRING,
      dos_factores_confirmado_en: DataTypes.STRING,
      dos_factores_ultimo_paso: DataTypes.INTEGER,
      token_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      tipo_acceso: { type: DataTypes.STRING, defaultValue: 'registrado' },
      identificador: DataTypes.STRING,
      datos_contacto: DataTypes.STRING,
      correo_verificado: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      telefono_verificado: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      terminos_aceptados_en: DataTypes.STRING,
      codigo_verificacion: DataTypes.STRING,
      codigo_verificacion_expira: DataTypes.STRING,
      canal_verificacion: DataTypes.STRING,
      token_recuperacion: DataTypes.STRING,
      token_recuperacion_expira: DataTypes.STRING,
      fecha_registro: DataTypes.STRING,
    },
    { tableName: 'usuarios', timestamps: false },
  );
