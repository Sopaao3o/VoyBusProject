const fs = require('node:fs');
const path = require('node:path');
// SQLite integrado en Node (no requiere instalar ni compilar nada).
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/**
 * Abre la base de datos y aplica el esquema (idempotente).
 * @param {string} [file] ruta del archivo o ':memory:'
 */
function openDatabase(file = process.env.DB_PATH || './data/voybus.db') {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  // node:sqlite no trae transacciones listas; esta función envuelve otra en BEGIN/COMMIT.
  // Si algo falla dentro, se deshace todo (ROLLBACK) y el error sigue su camino.
  db.transaction = (fn) => (...args) => {
    db.exec('BEGIN');
    try {
      const resultado = fn(...args);
      db.exec('COMMIT');
      return resultado;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  return db;
}

module.exports = { openDatabase };