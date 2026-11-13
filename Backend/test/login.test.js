const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_SECRET = 'secreto-de-pruebas';
process.env.LOGIN_MAX_INTENTOS = '3';
process.env.LOGIN_VENTANA_MINUTOS = '15';
process.env.LOGIN_BLOQUEO_MINUTOS = '5';

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');
const { cargarDatosEjemplo } = require('../src/database/seeders/datos-ejemplo');

let server, base, sequelize, models;
let reloj = new Date('2026-12-01T09:00:00Z');

const PASSWORD = 'Clave123!';
const avanzar = (ms) => {
  reloj = new Date(reloj.getTime() + ms);
};

test.before(async () => {
  sequelize = createDatabase(':memory:');
  await createMigrator(sequelize).up();
  models = initModels(sequelize);
  await cargarDatosEjemplo(models);
  server = createApp({ models, ahora: () => reloj }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

test.after(async () => {
  server.close();
  await sequelize.close();
});

let contador = 0;
const correoUnico = () => `login${++contador}@example.com`;
const telefonoUnico = () => `569${String(30000000 + contador++)}`;

async function crearUsuario({
  correo = correoUnico(),
  telefono = null,
  estado = 'habilitado',
  password = PASSWORD,
  dosFactores = 0,
  canalVerificacion = null,
} = {}) {
  return models.Usuario.create({
    rol: 'pasajero',
    nombre_visible: 'Usuario de Prueba',
    correo,
    telefono,
    password_hash: password === null ? null : await bcrypt.hash(password, 4),
    estado,
    tipo_acceso: 'registrado',
    dos_factores_activo: dosFactores,
    correo_verificado: estado === 'habilitado' && correo ? 1 : 0,
    telefono_verificado: estado === 'habilitado' && telefono ? 1 : 0,
    canal_verificacion: canalVerificacion,
  });
}

async function post(ruta, body) {
  const res = await fetch(base + ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

const iniciar = (body) => post('/auth/iniciar-sesion', body);

test('ACC-02: inicia sesión con correo y devuelve un JWT', async () => {
  const usuario = await crearUsuario();
  const { status, body } = await iniciar({
    correo: `  ${usuario.correo.toUpperCase()}  `,
    password: PASSWORD,
  });

  assert.equal(status, 200);
  assert.equal(body.data.usuario.id, usuario.id);
  assert.equal(body.data.usuario.rol, 'pasajero');
  assert.equal(body.data.usuario.estado, 'habilitado');
  assert.equal(body.data.token_type, 'Bearer');
  assert.ok(body.data.expira_en);
  assert.ok(!Number.isNaN(Date.parse(body.data.expira_en)));
  assert.ok(!JSON.stringify(body).includes('password_hash'));

  const payload = jwt.verify(body.data.token, process.env.JWT_SECRET);
  assert.equal(payload.sub, String(usuario.id));
  assert.equal(payload.rol, 'pasajero');
  assert.equal(payload.tipo_acceso, 'registrado');
});

test('ACC-02: inicia sesión con teléfono aunque venga formateado', async () => {
  const telefono = telefonoUnico();
  const usuario = await crearUsuario({ correo: null, telefono });
  const formateado = `+56 9 ${telefono.slice(3, 7)} ${telefono.slice(7)}`;

  const { status, body } = await iniciar({ telefono: formateado, password: PASSWORD });

  assert.equal(status, 200);
  assert.equal(body.data.usuario.id, usuario.id);
  assert.equal(body.data.usuario.telefono, telefono);
});

test('ACC-02: las cuentas demo del seed pueden iniciar sesión según su rol', async () => {
  const admin = await iniciar({ correo: 'admin@voybus.cl', password: PASSWORD });
  assert.equal(admin.status, 200);
  assert.equal(admin.body.data.usuario.rol, 'administrador');

  const conductor = await iniciar({ correo: 'carlos.rojas@voybus.cl', password: PASSWORD });
  assert.equal(conductor.status, 200);
  assert.equal(conductor.body.data.usuario.rol, 'conductor');

  const deshabilitado = await iniciar({ correo: 'luis.perez@voybus.cl', password: PASSWORD });
  assert.equal(deshabilitado.status, 403);
  assert.equal(deshabilitado.body.error.code, 'CUENTA_DESHABILITADA');
});

test('ACC-02: usa un mensaje general sin revelar qué credencial falló', async () => {
  const usuario = await crearUsuario();
  const claveMala = await iniciar({ correo: usuario.correo, password: 'Otra123!' });
  const sinCuenta = await iniciar({ correo: correoUnico(), password: 'Otra123!' });

  assert.equal(claveMala.status, 401);
  assert.equal(sinCuenta.status, 401);
  assert.equal(claveMala.body.error.code, 'CREDENCIALES_INVALIDAS');
  assert.equal(sinCuenta.body.error.code, 'CREDENCIALES_INVALIDAS');
  assert.equal(claveMala.body.error.message, sinCuenta.body.error.message);
  assert.deepEqual(claveMala.body.error.details, sinCuenta.body.error.details);
  assert.match(claveMala.body.error.message, /usuario o la contraseña/i);
  assert.ok(!claveMala.body.data);
});

test('ACC-02: valida el cuerpo del inicio de sesión', async () => {
  const casos = [
    [{ password: PASSWORD }, 'body.correo'],
    [{ correo: correoUnico() }, 'body.password'],
    [{ correo: correoUnico(), password: '' }, 'body.password'],
    [{ correo: correoUnico(), telefono: telefonoUnico(), password: PASSWORD }, 'body.telefono'],
    [{ correo: 'no-es-correo', password: PASSWORD }, 'body.correo'],
    [{ telefono: 'abc', password: PASSWORD }, 'body.telefono'],
  ];

  for (const [body, campo] of casos) {
    const { status, body: respuesta } = await iniciar(body);
    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(respuesta.error.code, 'VALIDACION');
    assert.ok(
      respuesta.error.details.some((d) => d.campo === campo),
      `${JSON.stringify(body)} debería fallar en ${campo}: ${JSON.stringify(respuesta.error.details)}`,
    );
  }
});

test('ACC-02: pide verificar la cuenta antes de iniciar sesión', async () => {
  const correo = correoUnico();
  const registro = await post('/auth/registro', {
    nombre: 'Ana Sin Verificar',
    correo,
    password: PASSWORD,
    confirmacion: PASSWORD,
    acepta_terminos: true,
  });
  assert.equal(registro.status, 201);

  const pendiente = await iniciar({ correo, password: PASSWORD });
  assert.equal(pendiente.status, 403);
  assert.equal(pendiente.body.error.code, 'CUENTA_SIN_VERIFICAR');
  assert.match(pendiente.body.error.message, /verific/i);
  assert.match(pendiente.body.error.message, /correo electrónico/i);
  assert.ok(!pendiente.body.data);

  const verificacion = await post('/auth/verificar-contacto', {
    correo,
    codigo: registro.body.data.verificacion.codigo_desarrollo,
  });
  assert.equal(verificacion.status, 200);

  const ingreso = await iniciar({ correo, password: PASSWORD });
  assert.equal(ingreso.status, 200);
  assert.equal(ingreso.body.data.usuario.id, registro.body.data.usuario.id);
});

test('ACC-02: indica el teléfono cuando la cuenta sin verificar se registró así', async () => {
  const telefono = telefonoUnico();
  const registro = await post('/auth/registro', {
    nombre: 'Pedro Sin Verificar',
    telefono,
    password: PASSWORD,
    confirmacion: PASSWORD,
    acepta_terminos: true,
  });
  assert.equal(registro.status, 201);

  const { status, body } = await iniciar({ telefono, password: PASSWORD });
  assert.equal(status, 403);
  assert.equal(body.error.code, 'CUENTA_SIN_VERIFICAR');
  assert.match(body.error.message, /teléfono/i);
});

test('ACC-02: no permite ingresar a una cuenta deshabilitada', async () => {
  const usuario = await crearUsuario({ estado: 'deshabilitado' });
  const { status, body } = await iniciar({ correo: usuario.correo, password: PASSWORD });

  assert.equal(status, 403);
  assert.equal(body.error.code, 'CUENTA_DESHABILITADA');
  assert.match(body.error.message, /deshabilitada/i);
  assert.ok(!body.data);
});

test('ACC-02: no revela el estado de la cuenta si la contraseña es incorrecta', async () => {
  const deshabilitada = await crearUsuario({ estado: 'deshabilitado' });
  const sinVerificar = await crearUsuario({
    estado: 'sin_verificar',
    canalVerificacion: 'correo',
  });

  for (const usuario of [deshabilitada, sinVerificar]) {
    const { status, body } = await iniciar({ correo: usuario.correo, password: 'Otra123!' });
    assert.equal(status, 401);
    assert.equal(body.error.code, 'CREDENCIALES_INVALIDAS');
  }
});

test('ACC-02: bloquea temporalmente tras intentos fallidos repetidos', async () => {
  const usuario = await crearUsuario();
  for (let i = 0; i < 3; i += 1) {
    const { status } = await iniciar({ correo: usuario.correo, password: 'Otra123!' });
    assert.equal(status, 401);
  }

  const bloqueado = await iniciar({ correo: usuario.correo, password: PASSWORD });
  assert.equal(bloqueado.status, 429);
  assert.equal(bloqueado.body.error.code, 'DEMASIADOS_INTENTOS');
  assert.equal(bloqueado.body.error.details[0].campo, 'espera_segundos');
  assert.match(bloqueado.body.error.message, /espera/i);
  assert.ok(!bloqueado.body.data);

  const retryAfter = Number(bloqueado.headers.get('retry-after'));
  assert.ok(retryAfter > 0 && retryAfter <= 300, `Retry-After inesperado: ${retryAfter}`);

  avanzar(5 * 60 * 1000 + 1000);
  const despues = await iniciar({ correo: usuario.correo, password: PASSWORD });
  assert.equal(despues.status, 200);
});

test('ACC-02: un ingreso correcto reinicia los intentos fallidos', async () => {
  const usuario = await crearUsuario();

  for (let i = 0; i < 2; i += 1) {
    assert.equal((await iniciar({ correo: usuario.correo, password: 'Otra123!' })).status, 401);
  }
  assert.equal((await iniciar({ correo: usuario.correo, password: PASSWORD })).status, 200);
  for (let i = 0; i < 2; i += 1) {
    assert.equal((await iniciar({ correo: usuario.correo, password: 'Otra123!' })).status, 401);
  }
});

test('ACC-02: los intentos fallidos vencen después de la ventana', async () => {
  const usuario = await crearUsuario();
  for (let i = 0; i < 2; i += 1) {
    assert.equal((await iniciar({ correo: usuario.correo, password: 'Otra123!' })).status, 401);
  }

  avanzar(15 * 60 * 1000 + 1000);

  // Si la ventana no se hubiera reiniciado, el segundo intento de aquí sería el cuarto
  // y respondería 429. Debe seguir siendo 401.
  for (let i = 0; i < 2; i += 1) {
    assert.equal((await iniciar({ correo: usuario.correo, password: 'Otra123!' })).status, 401);
  }
});

test('ACC-02: no omite la verificación en dos pasos si está activada', async () => {
  const usuario = await crearUsuario({ dosFactores: 1 });
  const { status, body } = await iniciar({ correo: usuario.correo, password: PASSWORD });

  assert.equal(status, 403);
  assert.equal(body.error.code, 'SEGUNDO_FACTOR_REQUERIDO');
  assert.ok(!body.data);
});
