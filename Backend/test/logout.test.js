const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_SECRET = 'secreto-de-pruebas';

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');
const { cargarDatosEjemplo } = require('../src/database/seeders/datos-ejemplo');

let server, base, sequelize, models;

const PASSWORD = 'Clave123!';

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

async function pedir(metodo, ruta, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + ruta, {
    method: metodo,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const iniciar = (correo) =>
  pedir('POST', '/auth/iniciar-sesion', { body: { correo, password: PASSWORD } });
const cerrar = (token, confirmar = true) =>
  pedir('POST', '/auth/cerrar-sesion', { body: { confirmar }, token });
const rutaPrivada = (token) => pedir('GET', '/admin/incidencias', { token });

test('ACC-03: cierra la sesión y el token deja de dar acceso', async () => {
  const ingreso = await iniciar('admin@voybus.cl');
  assert.equal(ingreso.status, 200);
  const token = ingreso.body.data.token;

  assert.equal((await rutaPrivada(token)).status, 200);

  const cierre = await cerrar(token);
  assert.equal(cierre.status, 200);
  assert.equal(cierre.body.data.sesion_cerrada, true);
  assert.equal(cierre.body.data.ya_estaba_cerrada, false);
  assert.ok(!Number.isNaN(Date.parse(cierre.body.data.cerrada_en)));
  // La respuesta del cierre no expone datos privados de la cuenta.
  assert.ok(!cierre.body.data.usuario);
  assert.ok(!JSON.stringify(cierre.body).includes('@voybus.cl'));

  const despues = await rutaPrivada(token);
  assert.equal(despues.status, 401);
  assert.equal(despues.body.error.code, 'SESION_CERRADA');
  assert.match(despues.body.error.message, /cerrada/i);
});

test('ACC-03: exige confirmar el cierre para evitar salidas accidentales', async () => {
  const token = (await iniciar('admin@voybus.cl')).body.data.token;

  const sinConfirmacion = await pedir('POST', '/auth/cerrar-sesion', { body: {}, token });
  assert.equal(sinConfirmacion.status, 400);
  assert.equal(sinConfirmacion.body.error.code, 'VALIDACION');
  assert.ok(
    sinConfirmacion.body.error.details.some((d) => d.campo === 'body.confirmar'),
    JSON.stringify(sinConfirmacion.body.error.details),
  );

  const negada = await cerrar(token, false);
  assert.equal(negada.status, 400);

  // Sin confirmación no se cerró nada: el token sigue sirviendo.
  assert.equal((await rutaPrivada(token)).status, 200);
});

test('ACC-03: exige el token de la sesión y rechaza encabezados inválidos', async () => {
  const sinToken = await pedir('POST', '/auth/cerrar-sesion', { body: { confirmar: true } });
  assert.equal(sinToken.status, 401);
  assert.equal(sinToken.body.error.code, 'NO_AUTENTICADO');

  const basico = await fetch(base + '/auth/cerrar-sesion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic abc' },
    body: JSON.stringify({ confirmar: true }),
  });
  assert.equal(basico.status, 401);
  assert.equal((await basico.json()).error.code, 'TOKEN_INVALIDO');

  const inventado = await cerrar('esto-no-es-un-jwt');
  assert.equal(inventado.status, 401);
  assert.equal(inventado.body.error.code, 'TOKEN_INVALIDO');

  // Un token firmado correctamente pero sin vencimiento tampoco se acepta.
  const sinExpiracion = jwt.sign(
    { sub: '1', rol: 'administrador', tipo_acceso: 'registrado' },
    process.env.JWT_SECRET,
  );
  const sinExp = await cerrar(sinExpiracion);
  assert.equal(sinExp.status, 401);
  assert.equal(sinExp.body.error.code, 'TOKEN_INVALIDO');
});

test('ACC-03: el cierre es idempotente (reintentos y tokens ya vencidos)', async () => {
  const token = (await iniciar('admin@voybus.cl')).body.data.token;

  const primera = await cerrar(token);
  assert.equal(primera.status, 200);
  assert.equal(primera.body.data.ya_estaba_cerrada, false);

  const segunda = await cerrar(token);
  assert.equal(segunda.status, 200);
  assert.equal(segunda.body.data.sesion_cerrada, true);
  assert.equal(segunda.body.data.ya_estaba_cerrada, true);
  assert.equal(segunda.body.data.cerrada_en, primera.body.data.cerrada_en);

  // Un token expirado tampoco da acceso: cerrar sesión con él también es un éxito.
  const vencido = jwt.sign(
    { sub: '1', rol: 'administrador', tipo_acceso: 'registrado' },
    process.env.JWT_SECRET,
    { expiresIn: -60 },
  );
  const conVencido = await cerrar(vencido);
  assert.equal(conVencido.status, 200);
  assert.equal(conVencido.body.data.ya_estaba_cerrada, true);
});

test('ACC-03: cierra solo la sesión indicada y no las demás', async () => {
  const primera = (await iniciar('admin@voybus.cl')).body.data.token;
  const segunda = (await iniciar('admin@voybus.cl')).body.data.token;
  assert.notEqual(primera, segunda);

  assert.equal((await cerrar(primera)).status, 200);

  assert.equal((await rutaPrivada(primera)).status, 401);
  assert.equal((await rutaPrivada(segunda)).status, 200);
});

test('ACC-03: conserva el perfil, los favoritos y el historial', async () => {
  const ingreso = await iniciar('ana.pasajera@voybus.cl');
  assert.equal(ingreso.status, 200);
  const usuarioId = ingreso.body.data.usuario.id;

  const [linea] = await sequelize.query('SELECT id FROM lineas ORDER BY id LIMIT 1');
  await sequelize.query('INSERT INTO favoritos (usuario_id, linea_id) VALUES (?, ?)', {
    replacements: [usuarioId, linea[0].id],
  });

  assert.equal((await cerrar(ingreso.body.data.token)).status, 200);

  const usuario = await models.Usuario.findByPk(usuarioId);
  assert.ok(usuario, 'la cuenta se conserva después de cerrar sesión');
  assert.equal(usuario.estado, 'habilitado');
  assert.equal(usuario.correo, 'ana.pasajera@voybus.cl');

  const [favoritos] = await sequelize.query(
    'SELECT COUNT(*) AS total FROM favoritos WHERE usuario_id = ?',
    { replacements: [usuarioId] },
  );
  assert.equal(favoritos[0].total, 1);

  // Puede volver a entrar y el token nuevo sí da acceso.
  const nuevo = await iniciar('ana.pasajera@voybus.cl');
  assert.equal(nuevo.status, 200);
  assert.equal(
    (await pedir('GET', '/viajes/999/paraderos-disponibles', { token: nuevo.body.data.token }))
      .status,
    404,
  );
});

test('ACC-03: un token cerrado de pasajero no entra a rutas privadas', async () => {
  const token = (await iniciar('ana.pasajera@voybus.cl')).body.data.token;

  assert.equal((await pedir('GET', '/viajes/999/paraderos-disponibles', { token })).status, 404);

  assert.equal((await cerrar(token)).status, 200);

  const cerrado = await pedir('GET', '/viajes/999/paraderos-disponibles', { token });
  assert.equal(cerrado.status, 401);
  assert.equal(cerrado.body.error.code, 'SESION_CERRADA');
});

test('El rol del JWT se respeta en las rutas privadas', async () => {
  const pasajero = (await iniciar('ana.pasajera@voybus.cl')).body.data.token;

  const prohibido = await rutaPrivada(pasajero);
  assert.equal(prohibido.status, 403);
  assert.equal(prohibido.body.error.code, 'SIN_PERMISO');
});
