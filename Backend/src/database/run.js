// Uso: node src/database/run.js            (aplica las migraciones pendientes)
//      node src/database/run.js --reset    (borra la base, la recrea y carga datos de ejemplo)
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { createDatabase } = require('../config/database');
const { createMigrator } = require('./migrator');
const { initModels } = require('./models');
const { cargarDatosEjemplo } = require('./seeders/datos-ejemplo');

async function main() {
  const file = process.env.DB_PATH || './data/voybus.db';
  const reset = process.argv.includes('--reset');
  if (reset) {
    for (const sufijo of ['', '-wal', '-shm'])
      fs.rmSync(path.resolve(file + sufijo), { force: true });
  }
  const sequelize = createDatabase(file);
  await sequelize.query('PRAGMA journal_mode = WAL;');
  const aplicadas = await createMigrator(sequelize).up();
  console.log(`Migraciones aplicadas: ${aplicadas.length}`);
  if (reset) {
    await cargarDatosEjemplo(initModels(sequelize));
    console.log('Datos de ejemplo cargados');
  }
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
