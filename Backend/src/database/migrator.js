const path = require('node:path');
const { Umzug, SequelizeStorage } = require('umzug');

/** Prepara Umzug: ejecuta en orden los archivos de src/database/migrations. */
function createMigrator(sequelize) {
  return new Umzug({
    migrations: {
      glob: ['migrations/*.js', { cwd: __dirname }],
      resolve: ({ name, path: file, context }) => {
        const migration = require(path.resolve(file));
        return { name, up: () => migration.up(context), down: () => migration.down(context) };
      },
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: undefined,
  });
}

module.exports = { createMigrator };
