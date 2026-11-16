const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_SECRET = 'secreto-de-pruebas';

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');
const { cargarDatosEjemplo } = require('../src/database/seeders/datos-ejemplo');

let server, base, sequelize, models;

async function baseNueva() {
  const db = createDatabase(':memory:');
  await createMigrator(db).up();
  return { db, modelos: initModels(db) };
}

test.before(async () => {
  const { db, modelos } = await baseNueva();
  sequelize = db;
  models = modelos;
  await cargarDatosEjemplo(models);
  server = createApp({ models, exponerCodigoVerificacion: true }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

test.after(async () => {
  server.close();
  await sequelize.close();
});

async function post(ruta, body) {
  const res = await fetch(base + ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

test('Una cuenta deshabilitada pierde el acceso aunque su token siga vigente', async () => {
  const login = await post('/auth/iniciar-sesion', {
    correo: 'admin@voybus.cl',
    password: 'Clave123!',
  });
  const autorizacion = { Authorization: `Bearer ${login.body.data.token}` };
  const antes = await fetch(`${base}/admin/turnos`, { headers: autorizacion });
  assert.equal(antes.status, 200);

  await models.Usuario.update({ estado: 'deshabilitado' }, { where: { id: 1 } });
  const despues = await fetch(`${base}/admin/turnos`, { headers: autorizacion });
  assert.equal(despues.status, 403);
  assert.equal((await despues.json()).error.code, 'CUENTA_DESHABILITADA');

  await models.Usuario.update({ estado: 'habilitado' }, { where: { id: 1 } });
  assert.equal((await fetch(`${base}/admin/turnos`, { headers: autorizacion })).status, 200);
});

test('ACC-01: varios códigos de verificación incorrectos piden esperar', async () => {
  const correo = 'fuerza.bruta@example.com';
  const alta = await post('/auth/registro', {
    nombre: 'Prueba Intentos',
    correo,
    password: 'Clave123!',
    confirmacion: 'Clave123!',
    acepta_terminos: true,
  });
  const correcto = alta.body.data.verificacion.codigo_desarrollo;
  const incorrecto = correcto === '000000' ? '111111' : '000000';

  for (let i = 0; i < 5; i++) {
    const fallo = await post('/auth/verificar-contacto', { correo, codigo: incorrecto });
    assert.equal(fallo.status, 400);
    assert.equal(fallo.body.error.code, 'CODIGO_INVALIDO');
  }

  // Bloqueado: ni siquiera el código correcto sirve hasta que pase la espera.
  const bloqueado = await post('/auth/verificar-contacto', { correo, codigo: correcto });
  assert.equal(bloqueado.status, 429);
  assert.equal(bloqueado.body.error.code, 'DEMASIADOS_INTENTOS');
  assert.ok(Number(bloqueado.headers.get('retry-after')) > 0);
});

test('En producción no se cargan los usuarios de demostración', async () => {
  const { db, modelos } = await baseNueva();
  await cargarDatosEjemplo(modelos, { usuariosDemo: false });
  assert.equal(await modelos.Usuario.count(), 0);
  assert.ok((await modelos.Linea.count()) >= 3);
  await db.close();
});

test('En producción el primer administrador sale de ADMIN_CORREO y ADMIN_PASSWORD', async () => {
  process.env.ADMIN_CORREO = 'Jefa@Empresa.cl';
  process.env.ADMIN_PASSWORD = 'Una-Clave-Larga-1';
  try {
    const { db, modelos } = await baseNueva();
    await cargarDatosEjemplo(modelos, { usuariosDemo: false });
    const usuarios = await modelos.Usuario.findAll();
    assert.equal(usuarios.length, 1);
    assert.equal(usuarios[0].rol, 'administrador');
    assert.equal(usuarios[0].correo, 'jefa@empresa.cl');
    assert.notEqual(usuarios[0].password_hash, 'Una-Clave-Larga-1');
    await db.close();
  } finally {
    delete process.env.ADMIN_CORREO;
    delete process.env.ADMIN_PASSWORD;
  }
});
