require('dotenv').config();

const { createApp } = require('./app');
const { createDatabase } = require('./config/database');
const { createMigrator } = require('./database/migrator');
const { initModels } = require('./database/models');
const { cargarDatosEjemplo } = require('./database/seeders/datos-ejemplo');

const PORT = Number(process.env.PORT) || 3000;

async function iniciar() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET es obligatorio cuando NODE_ENV=production');
  }
  const sequelize = createDatabase();
  await sequelize.query('PRAGMA journal_mode = WAL;');
  await createMigrator(sequelize).up(); // crea o actualiza las tablas al arrancar
  const models = initModels(sequelize);
  // Primera ejecución: carga los datos de ejemplo para poder probar de inmediato.
  // Los usuarios de demostración (contraseña conocida) solo existen fuera de producción.
  if ((await models.Linea.count()) === 0) {
    await cargarDatosEjemplo(models, { usuariosDemo: process.env.NODE_ENV !== 'production' });
  }

  // 0.0.0.0 permite que el celular (misma red Wi-Fi) llegue al servidor del PC.
  createApp({ models, registro: true, simulador: process.env.NODE_ENV !== 'production' }).listen(
    PORT,
    '0.0.0.0',
    () => {
      console.log(`VoyBus backend escuchando en http://localhost:${PORT}`);
    },
  );
}

iniciar().catch((err) => {
  console.error(err);
  process.exit(1);
});
