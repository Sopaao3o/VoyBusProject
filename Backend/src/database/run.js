// Uso: node src/database/run.js            (aplica migraciones pendientes)
//      node src/database/run.js --reset    (borra la base y la recrea desde cero)
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { createDatabase } = require('../config/database');
const { createMigrator } = require('./migrator');

async function main() {
  const file = process.env.DB_PATH || './data/voybus.db';
  if (process.argv.includes('--reset')) {
    for (const sufijo of ['', '-wal', '-shm']) fs.rmSync(path.resolve(file + sufijo), { force: true });
  }
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sequelize = createDatabase(file);
  await sequelize.query('PRAGMA journal_mode = WAL;');
  const aplicadas = await createMigrator(sequelize).up();
  console.log(`Migraciones aplicadas: ${aplicadas.length}`);
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});