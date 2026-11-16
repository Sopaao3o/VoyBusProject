const test = require('node:test');
const assert = require('node:assert/strict');

const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');

let sequelize, m;

test.before(async () => {
  sequelize = createDatabase(':memory:');
  await createMigrator(sequelize).up();
  m = initModels(sequelize);
});

test.after(() => sequelize.close());

const consulta = async (sql) => (await sequelize.query(sql))[0];

test('Las migraciones crean las 16 tablas y la configuración inicial', async () => {
  const tablas = await consulta(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'SequelizeMeta'`,
  );
  assert.equal(tablas.length, 16);
  const [cfg] = await consulta('SELECT margen_tolerancia_min AS m FROM configuracion_sistema');
  assert.equal(cfg.m, 5);
});

test('Los modelos leen la red con sus relaciones y el orden de paraderos', async () => {
  const linea = await m.Linea.create({ codigo: '999', nombre: 'Prueba' });
  const rec = await m.Recorrido.create({
    linea_id: linea.id,
    sentido: 'ida',
    dias_funcionamiento: 'L-D',
    horarios: '06-23',
  });
  const a = await m.Paradero.create({
    codigo: 'T-1',
    nombre: 'A',
    latitud: -23.6,
    longitud: -70.4,
  });
  const b = await m.Paradero.create({
    codigo: 'T-2',
    nombre: 'B',
    latitud: -23.7,
    longitud: -70.4,
  });
  await m.RecorridoParadero.bulkCreate([
    { recorrido_id: rec.id, orden: 2, paradero_id: b.id },
    { recorrido_id: rec.id, orden: 1, paradero_id: a.id },
  ]);
  const leida = await m.Linea.findByPk(linea.id, {
    include: [
      {
        model: m.Recorrido,
        as: 'recorridos',
        include: [
          {
            model: m.RecorridoParadero,
            as: 'paradas',
            include: [{ model: m.Paradero, as: 'paradero' }],
          },
        ],
      },
    ],
    order: [
      [
        { model: m.Recorrido, as: 'recorridos' },
        { model: m.RecorridoParadero, as: 'paradas' },
        'orden',
        'ASC',
      ],
    ],
  });
  assert.deepEqual(
    leida.recorridos[0].paradas.map((p) => p.paradero.codigo),
    ['T-1', 'T-2'],
  );
});

test('La base sigue rechazando datos inválidos (restricciones CHECK)', async () => {
  await assert.rejects(m.Linea.create({ codigo: 'X', nombre: 'X', estado_servicio: 'rota' }));
  await assert.rejects(m.Paradero.create({ codigo: 'Y', nombre: 'Y', latitud: 200, longitud: 0 }));
});

test('Índices únicos parciales: un conductor solo puede tener un turno en curso', async () => {
  const conductor = await m.Usuario.create({ rol: 'conductor', nombre_visible: 'C', alias: 'c1' });
  await sequelize.query(
    `INSERT INTO vehiculos (identificador, patente, capacidad) VALUES ('B1','P1',40)`,
  );
  const turno = (estado) =>
    sequelize.query(
      `INSERT INTO turnos (conductor_id, vehiculo_id, inicio_planificado, termino_planificado, estado)
       VALUES (${conductor.id}, 1, '2026-12-01T08:00:00Z', '2026-12-01T16:00:00Z', '${estado}')`,
    );
  await turno('en_curso');
  await assert.rejects(turno('en_curso'));
  await turno('finalizado'); // los finalizados no cuentan
});

test('Umzug se puede revertir y volver a aplicar', async () => {
  const migrador = createMigrator(sequelize);
  await migrador.down({ to: 0 });
  const tablas = await consulta(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'`,
  );
  assert.equal(tablas.length, 0);
  await migrador.up();
});
