const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');
const { cargarDatosEjemplo } = require('../src/database/seeders/datos-ejemplo');

let server, base, sequelize, models;

test.before(async () => {
  sequelize = createDatabase(':memory:');
  await createMigrator(sequelize).up();
  models = initModels(sequelize);
  await cargarDatosEjemplo(models);
  server = createApp({ models }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

test.after(async () => {
  server.close();
  await sequelize.close();
});

const get = async (path) => {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
};

// ───── RED-01: líneas y recorridos ─────
test('RED-01: lista líneas sin sesión (acceso público) con el formato { data, meta }', async () => {
  const { status, body } = await get('/lineas');
  assert.equal(status, 200);
  assert.ok(body.data.length >= 3);
  assert.equal(body.meta.total, body.data.length);
});

test('RED-01: las líneas desactivadas no aparecen', async () => {
  const { body } = await get('/lineas');
  assert.ok(!body.data.some((l) => l.codigo === '305'));
  const { status, body: err } = await get('/lineas/4');
  assert.equal(status, 404);
  assert.equal(err.error.code, 'NO_ENCONTRADO');
  assert.match(err.error.message, /no existe o no está disponible/);
});

test('RED-01: las líneas suspendidas se muestran con aviso', async () => {
  const { body } = await get('/lineas');
  const l = body.data.find((x) => x.codigo === '211');
  assert.equal(l.estado_servicio, 'suspendida');
  assert.ok(l.aviso);
  assert.ok((await get('/lineas/3')).body.data.aviso);
});

test('RED-01: busca por nombre o código, sin importar mayúsculas ni tildes', async () => {
  assert.deepEqual(
    (await get('/lineas?q=COSTANERA')).body.data.map((l) => l.codigo),
    ['103'],
  );
  assert.deepEqual(
    (await get('/lineas?q=107')).body.data.map((l) => l.codigo),
    ['107'],
  );
  assert.deepEqual((await get('/lineas?q=zzz')).body.data, []);
});

test('RED-01: la línea trae recorridos con días, horarios y paraderos en orden', async () => {
  const { data } = (await get('/lineas/1')).body;
  assert.deepEqual(
    data.recorridos.map((r) => r.sentido),
    ['ida', 'vuelta'],
  );
  for (const r of data.recorridos) {
    assert.ok(r.dias_funcionamiento && r.horarios);
    assert.deepEqual(
      r.paraderos.map((p) => p.orden),
      r.paraderos.map((_, i) => i + 1),
    );
  }
  const ida = data.recorridos[0].paraderos.map((p) => p.codigo);
  const vuelta = data.recorridos[1].paraderos.map((p) => p.codigo);
  assert.deepEqual(vuelta, [...ida].reverse());
});

test('RED-01: consulta de un recorrido', async () => {
  const { status, body } = await get('/recorridos/1');
  assert.equal(status, 200);
  assert.equal(body.data.linea.codigo, '103');
  assert.equal(body.data.paraderos.length, 5);
  assert.equal((await get('/recorridos/9999')).status, 404);
});

// ───── RED-02: paraderos ─────
test('RED-02: lista paraderos activos con coordenadas', async () => {
  const { data } = (await get('/paraderos')).body;
  assert.ok(data.length >= 10);
  assert.ok(!data.some((p) => p.codigo === 'PA-013'));
  assert.ok(data.every((p) => typeof p.latitud === 'number' && typeof p.longitud === 'number'));
});

test('RED-02: busca por nombre sin tildes', async () => {
  assert.deepEqual(
    (await get('/paraderos?q=colon')).body.data.map((p) => p.codigo),
    ['PA-002'],
  );
});

test('RED-02: el paradero indica qué líneas pasan (sin desactivadas)', async () => {
  const { data } = (await get('/paraderos/2')).body;
  assert.deepEqual(
    data.lineas.map((l) => l.codigo),
    ['107', '211'],
  );
});

test('RED-02: paradero inexistente o inactivo da error claro', async () => {
  assert.equal((await get('/paraderos/999')).status, 404);
  const inactivo = await models.Paradero.findOne({ where: { codigo: 'PA-013' } });
  assert.equal((await get(`/paraderos/${inactivo.id}`)).status, 404);
});

// ───── Validación con Zod y formato de errores ─────
test('Un identificador inválido responde 400 con el campo y el motivo', async () => {
  for (const mal of ['abc', '-1', '0', '1.5']) {
    const { status, body } = await get(`/lineas/${mal}`);
    assert.equal(status, 400, mal);
    assert.equal(body.error.code, 'VALIDACION');
    assert.equal(body.error.details[0].campo, 'params.id');
  }
});

test('Una búsqueda demasiado larga responde 400', async () => {
  const { status, body } = await get(`/lineas?q=${'a'.repeat(61)}`);
  assert.equal(status, 400);
  assert.equal(body.error.details[0].campo, 'query.q');
});

test('Una ruta inexistente de la API responde 404 con el mismo formato de error', async () => {
  const { status, body } = await get('/no-existe');
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NO_ENCONTRADO');
});

// ───── Datos de ejemplo ─────
test('Los datos de ejemplo cumplen los mínimos pedidos', async () => {
  assert.ok((await models.Linea.count()) >= 3);
  assert.equal(await models.Vehiculo.count(), 10);
  assert.equal(await models.Usuario.count(), 5);
});
