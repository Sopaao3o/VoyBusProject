const { DataTypes } = require('sequelize');

// Un favorito apunta a un paradero o a una línea (la base exige exactamente uno de los dos).
module.exports = (sequelize) =>
  sequelize.define(
    'Favorito',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuario_id: { type: DataTypes.INTEGER, allowNull: false },
      linea_id: DataTypes.INTEGER,
      paradero_id: DataTypes.INTEGER,
    },
    { tableName: 'favoritos', timestamps: false },
  );
