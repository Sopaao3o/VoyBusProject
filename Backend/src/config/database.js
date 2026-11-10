const { Sequelize, Transaction } = require('sequelize');

/**
 * Crea la conexión Sequelize a SQLite.
 * SQLite acepta un solo escritor a la vez, por eso: una sola conexión (pool max 1),
 * transacciones IMMEDIATE y reintento si la base está ocupada.
 * @param {string} [storage] ruta del archivo o ':memory:' (pruebas)
 */
function createDatabase(storage = process.env.DB_PATH || './data/voybus.db') {
  return new Sequelize({
    dialect: 'sqlite',
    storage,
    logging: false,
    transactionType: Transaction.TYPES.IMMEDIATE,
    retry: { match: [/SQLITE_BUSY/], max: 10 },
    pool: { max: 1, min: 0, idle: 10000 },
  });
}

module.exports = { createDatabase };