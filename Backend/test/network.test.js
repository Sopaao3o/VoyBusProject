const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { openDatabase } = require('../src/db/connection');
const { seed } = require('../src/db/seed');

let server, base, db;

test.before(async () => {
  db = openDatabase(':memory:');
  seed(db);
  server = createApp({ db }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(() => {
  server.close();
  db.close();
});

const get = async (path) => {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
};

// ───── RED-01: líneas y recorridos ─────
test('RED-01: lista líneas sin sesión (acceso público)', async () => {
  const { status, body } = await get('/lineas');
  assert.equal(status, 200);
  assert.ok(body.length >= 3);
});

test('RED-01: las líneas desactivadas no aparecen', async () => {
  const { body } = await get('/lineas');
  assert.ok(!body.some((l) => l.codigo === '305'));
  const { status, body: err } = await get('/lineas/4');
  assert.equal(status, 404);
  assert.match(err.error, /no existe o no está disponible/);
});

test('RED-01: las líneas suspendidas se muestran con aviso', async () => {
  const { body } = await get('/lineas');
  const l = body.find((x) => x.codigo === '211');
  assert.equal(l.estado_servicio, 'suspendida');
  assert.ok(l.aviso);
  const { body: det } = await get('/lineas/3');
  assert.ok(det.aviso);
});

test('RED-01: busca por nombre o código, sin importar mayúsculas ni tildes', async () => {
  assert.deepEqual((await get('/lineas?q=COSTANERA')).body.map((l) => l.codigo), ['103']);
  assert.deepEqual((await get('/lineas?q=107')).body.map((l) => l.codigo), ['107']);
  assert.deepEqual((await get('/lineas?q=zzz')).body, []);
});

test('RED-01: la línea trae recorridos con días, horarios y paraderos en orden', async () => {
  const { body } = await get('/lineas/1');
  assert.deepEqual(body.recorridos.map((r) => r.sentido), ['ida', 'vuelta']);
  for (const r of body.recorridos) {
    assert.ok(r.dias_funcionamiento && r.horarios);
    assert.deepEqual(r.paraderos.map((p) => p.orden), r.paraderos.map((_, i) => i + 1));
  }
  const ida = body.recorridos[0].paraderos.map((p) => p.codigo);
  const vuelta = body.recorridos[1].paraderos.map((p) => p.codigo);
  assert.deepEqual(vuelta, [...ida].reverse());
});

test('RED-01: consulta de un recorrido', async () => {
  const { status, body } = await get('/recorridos/1');
  assert.equal(status, 200);
  assert.equal(body.linea.codigo, '103');
  assert.equal((await get('/recorridos/9999')).status, 404);
});

// ───── RED-02: paraderos ─────
test('RED-02: lista paraderos activos con coordenadas', async () => {
  const { body } = await get('/paraderos');
  assert.ok(body.length >= 10);
  assert.ok(!body.some((p) => p.codigo === 'PA-013'));
  assert.ok(body.every((p) => typeof p.latitud === 'number' && typeof p.longitud === 'number'));
});

test('RED-02: busca por nombre sin tildes', async () => {
  assert.deepEqual((await get('/paraderos?q=colon')).body.map((p) => p.codigo), ['PA-002']);
});

test('RED-02: el paradero indica qué líneas pasan (sin desactivadas)', async () => {
  const { body } = await get('/paraderos/2');
  assert.deepEqual(body.lineas.map((l) => l.codigo), ['107', '211']);
});

test('RED-02: paradero inexistente o inactivo da error claro', async () => {
  assert.equal((await get('/paraderos/999')).status, 404);
  const id = db.prepare(`SELECT id FROM paraderos WHERE codigo='PA-013'`).get().id;
  assert.equal((await get(`/paraderos/${id}`)).status, 404);
});

test('Identificador inválido responde 400', async () => {
  assert.equal((await get('/lineas/abc')).status, 400);
  assert.equal((await get('/paraderos/-1')).status, 400);
});

// ───── Datos de ejemplo y reglas de BD ─────
test('Seed cumple los mínimos pedidos', () => {
  const n = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  assert.ok(n('lineas') >= 3);
  assert.equal(n('vehiculos'), 10);
  assert.equal(db.prepare('SELECT margen_tolerancia_min m FROM configuracion_sistema').get().m, 5);
});

test('BD rechaza estados inválidos y favoritos ambiguos', () => {
  assert.throws(() => db.prepare(`INSERT INTO lineas (codigo,nombre,estado_servicio) VALUES ('X','X','rota')`).run());
  db.prepare(`INSERT INTO usuarios (rol,nombre_visible,alias) VALUES ('pasajero','T','t')`).run();
  assert.throws(() => db.prepare(`INSERT INTO favoritos (usuario_id) VALUES (1)`).run());
  assert.throws(() => db.prepare(`INSERT INTO favoritos (usuario_id,linea_id,paradero_id) VALUES (1,1,1)`).run());
});
