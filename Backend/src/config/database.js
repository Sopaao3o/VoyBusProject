const fs = require('node:fs');
const path = require('node:path');
const { Sequelize, Transaction } = require('sequelize');

/**
 * Crea la conexión Sequelize a SQLite.
 * SQLite acepta un solo escritor a la vez, por eso: una sola conexión (pool max 1),
 * transacciones IMMEDIATE y reintento si la base está ocupada.
 * OJO: con una sola conexión, dentro de una transacción todas las consultas deben recibir
 * `{ transaction }`; si no, esperan para siempre una conexión que ya está ocupada.
 * @param {string} [storage] ruta del archivo o ':memory:' (pruebas)
 */
function createDatabase(storage = process.env.DB_PATH || './data/voybus.db') {
  if (storage !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(storage)), { recursive: true });
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