const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'TokenRevocado',
    {
      token_hash: { type: DataTypes.STRING, primaryKey: true },
      usuario_id: { type: DataTypes.INTEGER, allowNull: false },
      expira_en: { type: DataTypes.STRING, allowNull: false },
      revocado_en: { type: DataTypes.STRING, allowNull: false },
    },
    { tableName: 'sesiones_revocadas', timestamps: false },
  );
