const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_SECRET = 'secreto-de-pruebas';

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');
const { cargarDatosEjemplo } = require('../src/database/seeders/datos-ejemplo');
const { tokenPara } = require('./auth-helpers');

let server, base, sequelize, models;

test.before(async () => {
  sequelize = createDatabase(':memory:');
  await createMigrator(sequelize).up();
  models = initModels(sequelize);
  await cargarDatosEjemplo(models);
  server = createApp({ models }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1/favoritos`;
});

test.after(async () => {
  server.close();
  await sequelize.close();
});

// 5 = Ana (pasajera registrada), 2 = Carlos (conductor)
const call = async (method, path, token = tokenPara(5)) => {
  const res = await fetch(base + path, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: await res.json() };
};

test('RED-02: un pasajero registrado guarda y quita paraderos favoritos', async () => {
  assert.deepEqual((await call('GET', '/paraderos')).body.data, []);

  const agregado = await call('PUT', '/paraderos/2');
  assert.equal(agregado.status, 200);
  assert.deepEqual(agregado.body.data, { paradero_id: 2, favorito: true });
  await call('PUT', '/paraderos/1');

  const lista = await call('GET', '/paraderos');
  assert.equal(lista.body.meta.total, 2);
  assert.deepEqual(
    lista.body.data.map((p) => p.codigo),
    ['PA-002', 'PA-001'], // por nombre: Plaza Colón, Terminal Rodoviario
  );
  assert.ok(typeof lista.body.data[0].latitud === 'number');

  const quitado = await call('DELETE', '/paraderos/2');
  assert.deepEqual(quitado.body.data, { paradero_id: 2, favorito: false });
  assert.deepEqual(
    (await call('GET', '/paraderos')).body.data.map((p) => p.codigo),
    ['PA-001'],
  );
  await call('DELETE', '/paraderos/1');
});

test('RED-02: agregar o quitar dos veces no falla ni duplica', async () => {
  assert.equal((await call('PUT', '/paraderos/3')).status, 200);
  assert.equal((await call('PUT', '/paraderos/3')).status, 200);
  assert.equal((await call('GET', '/paraderos')).body.meta.total, 1);
  assert.equal(await models.Favorito.count({ where: { usuario_id: 5 } }), 1);

  assert.equal((await call('DELETE', '/paraderos/3')).status, 200);
  assert.equal((await call('DELETE', '/paraderos/3')).status, 200);
  assert.equal((await call('GET', '/paraderos')).body.meta.total, 0);
});

test('RED-02: los favoritos se conservan entre sesiones y son de cada pasajero', async () => {
  await call('PUT', '/paraderos/4');
  // Otra sesión de la misma cuenta (otro token) ve el mismo favorito.
  const otraSesion = tokenPara(5);
  assert.deepEqual(
    (await call('GET', '/paraderos', otraSesion)).body.data.map((p) => p.id),
    [4],
  );

  const otra = await models.Usuario.create({
    rol: 'pasajero',
    nombre_visible: 'Otro Pasajero',
    estado: 'habilitado',
    tipo_acceso: 'registrado',
  });
  assert.deepEqual((await call('GET', '/paraderos', tokenPara(otra))).body.data, []);
  await call('DELETE', '/paraderos/4');
});

test('RED-02: solo pasajeros registrados; paraderos inexistentes o inactivos dan 404', async () => {
  assert.equal((await call('GET', '/paraderos', null)).status, 401);
  assert.equal((await call('GET', '/paraderos', tokenPara(2))).status, 403);

  const invitado = await models.Usuario.create({
    rol: 'pasajero',
    nombre_visible: 'Invitado',
    estado: 'habilitado',
    tipo_acceso: 'invitado',
  });
  const comoInvitado = await call('PUT', '/paraderos/1', tokenPara(invitado));
  assert.equal(comoInvitado.status, 403);
  assert.equal(comoInvitado.body.error.code, 'CUENTA_INVITADA');

  assert.equal((await call('PUT', '/paraderos/9999')).status, 404);
  const inactivo = await models.Paradero.findOne({ where: { codigo: 'PA-013' } });
  assert.equal((await call('PUT', `/paraderos/${inactivo.id}`)).status, 404);
  assert.equal((await call('PUT', '/paraderos/abc')).status, 400);
});
