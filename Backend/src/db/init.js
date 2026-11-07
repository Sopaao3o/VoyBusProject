// Uso: node src/db/init.js [--reset]
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { openDatabase } = require('./connection');
const { seed } = require('./seed');

const file = process.env.DB_PATH || './data/voybus.db';
if (process.argv.includes('--reset')) {
  for (const suf of ['', '-wal', '-shm']) fs.rmSync(path.resolve(file + suf), { force: true });
}
const db = openDatabase(file);
const hayDatos = db.prepare('SELECT COUNT(*) n FROM lineas').get().n > 0;
if (!hayDatos) {
  seed(db);
  console.log('Base de datos creada con datos de ejemplo:', file);
} else {
  console.log('La base de datos ya tiene datos (usa --reset para recrearla):', file);
}
db.close();
