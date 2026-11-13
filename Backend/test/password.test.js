const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_SECRET = 'secreto-de-pruebas';
process.env.LOGIN_MAX_INTENTOS = '3';
process.env.LOGIN_VENTANA_MINUTOS = '15';
process.env.LOGIN_BLOQUEO_MINUTOS = '5';
process.env.RECUPERACION_EXPIRA_MINUTOS = '30';

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');

let server, base, sequelize, models;
let reloj = new Date('2026-12-01T09:00:00Z');

const PASSWORD = 'Clave123!';
const PASSWORD_NUEVA = 'NuevaClave1';
const avanzar = (ms) => {
  reloj = new Date(reloj.getTime() + ms);
};

test.before(async () => {
  sequelize = createDatabase(':memory:');
  await createMigrator(sequelize).up();
  models = initModels(sequelize);
  server = createApp({ models, ahora: () => reloj }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

test.after(async () => {
  server.close();
  await sequelize.close();
});

let contador = 0;
const correoNuevo = () => `password${++contador}@example.com`;

async function pedir(metodo, ruta, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + ruta, {
    method: metodo,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

const iniciar = (correo, password = PASSWORD) =>
  pedir('POST', '/auth/iniciar-sesion', { body: { correo, password } });
const recuperar = (correo) => pedir('POST', '/auth/recuperar-password', { body: { correo } });
const restablecer = (token, password = PASSWORD_NUEVA, confirmacion = password) =>
  pedir('POST', '/auth/restablecer-password', { body: { token, password, confirmacion } });
const cambiar = (token, password_actual, password = PASSWORD_NUEVA, confirmacion = password) =>
  pedir('POST', '/auth/cambiar-password', {
    body: { password_actual, password, confirmacion },
    token,
  });

/** Crea una cuenta de pasajero por la API y, si se pide, la deja verificada. */
async function crearCuenta({ correo = correoNuevo(), verificado = true } = {}) {
  const registro = await pedir('POST', '/auth/registro', {
    body: {
      nombre: 'Cuenta de Prueba',
      correo,
      password: PASSWORD,
      confirmacion: PASSWORD,
      acepta_terminos: true,
    },
  });
  assert.equal(registro.status, 201, JSON.stringify(registro.body));
  if (verificado) {
    const verificacion = await pedir('POST', '/auth/verificar-contacto', {
      body: { correo, codigo: registro.body.data.verificacion.codigo_desarrollo },
    });
    assert.equal(verificacion.status, 200, JSON.stringify(verificacion.body));
  }
  return { correo, usuarioId: registro.body.data.usuario.id };
}

test('ACC-04: solo envía el enlace a cuentas con correo verificado y no revela si existe', async () => {
  const { correo } = await crearCuenta();
  const existente = await recuperar(correo);
  assert.equal(existente.status, 200);
  assert.match(existente.body.data.mensaje, /si el correo pertenece a una cuenta verificada/i);
  assert.ok(existente.body.data.token_desarrollo, 'en desarrollo se expone el enlace');
  assert.ok(!Number.isNaN(Date.parse(existente.body.data.expira_en)));

  const inexistente = await recuperar(correoNuevo());
  assert.equal(inexistente.status, 200);
  assert.equal(inexistente.body.data.mensaje, existente.body.data.mensaje);
  assert.equal(inexistente.body.data.token_desarrollo, undefined);

  const { correo: sinVerificar } = await crearCuenta({ verificado: false });
  const pendiente = await recuperar(sinVerificar);
  assert.equal(pendiente.status, 200);
  assert.equal(pendiente.body.data.mensaje, existente.body.data.mensaje);
  assert.equal(pendiente.body.data.token_desarrollo, undefined);

  const { correo: deshabilitada } = await crearCuenta();
  await models.Usuario.update({ estado: 'deshabilitado' }, { where: { correo: deshabilitada } });
  const bloqueada = await recuperar(deshabilitada);
  assert.equal(bloqueada.status, 200);
  assert.equal(bloqueada.body.data.mensaje, existente.body.data.mensaje);
  assert.equal(bloqueada.body.data.token_desarrollo, undefined);
});

test('ACC-04: valida el correo de la recuperación', async () => {
  for (const body of [{}, { correo: '' }, { correo: 'no-es-correo' }]) {
    const { status, body: respuesta } = await pedir('POST', '/auth/recuperar-password', { body });
    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(respuesta.error.code, 'VALIDACION');
    assert.ok(respuesta.error.details.some((d) => d.campo === 'body.correo'));
  }
});

test('ACC-04: restablece la contraseña con el enlace y el token es de un solo uso', async () => {
  const { correo } = await crearCuenta();
  const { token_desarrollo: token } = (await recuperar(correo)).body.data;

  const respuesta = await restablecer(token);
  assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
  assert.equal(respuesta.body.data.mensaje, 'Tu contraseña fue actualizada');

  assert.equal((await iniciar(correo)).status, 401, 'la contraseña anterior ya no sirve');
  assert.equal((await iniciar(correo, PASSWORD_NUEVA)).status, 200);

  const repetido = await restablecer(token);
  assert.equal(repetido.status, 400);
  assert.equal(repetido.body.error.code, 'TOKEN_RECUPERACION_INVALIDO');
});

test('ACC-04: el enlace de recuperación vence', async () => {
  const { correo } = await crearCuenta();
  const { token_desarrollo: token } = (await recuperar(correo)).body.data;

  avanzar(30 * 60 * 1000 + 1000);

  const vencido = await restablecer(token);
  assert.equal(vencido.status, 400);
  assert.equal(vencido.body.error.code, 'TOKEN_RECUPERACION_EXPIRADO');

  // Se puede pedir un enlace nuevo y usarlo.
  const { token_desarrollo: nuevo } = (await recuperar(correo)).body.data;
  assert.equal((await restablecer(nuevo)).status, 200);
});

test('ACC-04: la nueva contraseña debe ser distinta y cumplir las reglas', async () => {
  const { correo } = await crearCuenta();
  const { token_desarrollo: token } = (await recuperar(correo)).body.data;

  const repetida = await restablecer(token, PASSWORD, PASSWORD);
  assert.equal(repetida.status, 400);
  assert.equal(repetida.body.error.code, 'PASSWORD_REPETIDA');

  const casos = [
    [{ token, password: 'Abc1', confirmacion: 'Abc1' }, 'body.password'],
    [{ token, password: 'SoloLetras!', confirmacion: 'SoloLetras!' }, 'body.password'],
    [{ token, password: PASSWORD_NUEVA, confirmacion: 'OtraClave2' }, 'body.confirmacion'],
    [{ password: PASSWORD_NUEVA, confirmacion: PASSWORD_NUEVA }, 'body.token'],
  ];
  for (const [body, campo] of casos) {
    const { status, body: respuesta } = await pedir('POST', '/auth/restablecer-password', { body });
    assert.equal(status, 400, JSON.stringify(body));
    assert.ok(
      respuesta.error.details.some((d) => d.campo === campo),
      `${JSON.stringify(body)} debería fallar en ${campo}: ${JSON.stringify(respuesta.error.details)}`,
    );
  }

  // Ninguno de los intentos inválidos consumió el enlace.
  assert.equal((await restablecer(token)).status, 200);
});

test('ACC-04: no restablece una cuenta deshabilitada aunque tenga enlace', async () => {
  const { correo } = await crearCuenta();
  const { token_desarrollo: token } = (await recuperar(correo)).body.data;

  await models.Usuario.update({ estado: 'deshabilitado' }, { where: { correo } });

  const { status, body } = await restablecer(token);
  assert.equal(status, 403);
  assert.equal(body.error.code, 'CUENTA_DESHABILITADA');
});

test('ACC-04: cambia la contraseña desde el perfil con la contraseña actual', async () => {
  const { correo } = await crearCuenta();
  const token = (await iniciar(correo)).body.data.token;

  const sinSesion = await pedir('POST', '/auth/cambiar-password', {
    body: { password_actual: PASSWORD, password: PASSWORD_NUEVA, confirmacion: PASSWORD_NUEVA },
  });
  assert.equal(sinSesion.status, 401);
  assert.equal(sinSesion.body.error.code, 'NO_AUTENTICADO');

  const soloXUserId = await fetch(base + '/auth/cambiar-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': '1' },
    body: JSON.stringify({
      password_actual: PASSWORD,
      password: PASSWORD_NUEVA,
      confirmacion: PASSWORD_NUEVA,
    }),
  });
  assert.equal(soloXUserId.status, 401, 'x-user-id no sirve para cambiar la contraseña');

  const incorrecta = await cambiar(token, 'OtraActual1');
  assert.equal(incorrecta.status, 401);
  assert.equal(incorrecta.body.error.code, 'PASSWORD_ACTUAL_INCORRECTA');
  assert.match(incorrecta.body.error.message, /contraseña actual/i);
  assert.ok(!JSON.stringify(incorrecta.body).includes('hash'));

  const cambio = await cambiar(token, PASSWORD);
  assert.equal(cambio.status, 200, JSON.stringify(cambio.body));
  assert.equal(cambio.body.data.mensaje, 'Tu contraseña fue actualizada');
  assert.ok(cambio.body.data.token, 'devuelve un token nuevo para la sesión actual');
  assert.notEqual(cambio.body.data.token, token);
  const tokenNuevo = cambio.body.data.token;

  assert.equal((await iniciar(correo)).status, 401);
  assert.equal((await iniciar(correo, PASSWORD_NUEVA)).status, 200);

  // El token anterior ya no sirve; el nuevo mantiene la sesión actual.
  const conAnterior = await pedir('GET', '/viajes/999/paraderos-disponibles', { token });
  assert.equal(conAnterior.status, 401);
  assert.equal(conAnterior.body.error.code, 'SESION_CERRADA');
  assert.equal(
    (await pedir('GET', '/viajes/999/paraderos-disponibles', { token: tokenNuevo })).status,
    404,
  );

  const igual = await cambiar(tokenNuevo, PASSWORD_NUEVA, PASSWORD_NUEVA, PASSWORD_NUEVA);
  assert.equal(igual.status, 400);
  assert.equal(igual.body.error.code, 'PASSWORD_REPETIDA');
});

test('ACC-04: cambiar la contraseña cierra las demás sesiones y renueva la actual', async () => {
  const { correo } = await crearCuenta();
  const primera = (await iniciar(correo)).body.data.token;
  const segunda = (await iniciar(correo)).body.data.token;
  assert.notEqual(primera, segunda);

  const cambio = await cambiar(primera, PASSWORD);
  assert.equal(cambio.status, 200, JSON.stringify(cambio.body));
  const renovada = cambio.body.data.token;
  assert.ok(renovada);

  for (const [nombre, token] of [
    ['la sesión que cambió la contraseña', primera],
    ['la otra sesión', segunda],
  ]) {
    const r = await pedir('GET', '/viajes/999/paraderos-disponibles', { token });
    assert.equal(r.status, 401, nombre);
    assert.equal(r.body.error.code, 'SESION_CERRADA', nombre);
  }
  assert.equal(
    (await pedir('GET', '/viajes/999/paraderos-disponibles', { token: renovada })).status,
    404,
  );

  const cuenta = await models.Usuario.findOne({ where: { correo } });
  assert.equal(cuenta.token_version, 1);
});

test('ACC-04: restablecer la contraseña cierra todas las sesiones', async () => {
  const { correo } = await crearCuenta();
  const sesion = (await iniciar(correo)).body.data.token;
  const { token_desarrollo: enlace } = (await recuperar(correo)).body.data;

  assert.equal((await restablecer(enlace)).status, 200);

  const r = await pedir('GET', '/viajes/999/paraderos-disponibles', { token: sesion });
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, 'SESION_CERRADA');

  const ingreso = await iniciar(correo, PASSWORD_NUEVA);
  assert.equal(ingreso.status, 200);
  assert.equal(
    (await pedir('GET', '/viajes/999/paraderos-disponibles', { token: ingreso.body.data.token }))
      .status,
    404,
  );

  const cuenta = await models.Usuario.findOne({ where: { correo } });
  assert.equal(cuenta.token_version, 1);
});

test('ACC-04: varios fallos con la contraseña actual piden esperar', async () => {
  const { correo } = await crearCuenta();
  const token = (await iniciar(correo)).body.data.token;

  for (let i = 0; i < 3; i += 1) {
    assert.equal((await cambiar(token, 'MalaActual1')).status, 401);
  }

  const bloqueado = await cambiar(token, PASSWORD);
  assert.equal(bloqueado.status, 429);
  assert.equal(bloqueado.body.error.code, 'DEMASIADOS_INTENTOS');
  assert.ok(Number(bloqueado.headers.get('retry-after')) > 0);

  avanzar(5 * 60 * 1000 + 1000);

  const despues = await cambiar(token, PASSWORD);
  assert.equal(despues.status, 200, JSON.stringify(despues.body));
});

test('ACC-04: el cambio de contraseña invalida un enlace de recuperación pendiente', async () => {
  const { correo } = await crearCuenta();
  const token = (await iniciar(correo)).body.data.token;
  const { token_desarrollo: enlace } = (await recuperar(correo)).body.data;

  assert.equal((await cambiar(token, PASSWORD)).status, 200);

  const usado = await restablecer(enlace);
  assert.equal(usado.status, 400);
  assert.equal(usado.body.error.code, 'TOKEN_RECUPERACION_INVALIDO');
});

test('ACC-04: recuperar la contraseña limpia el bloqueo de inicio de sesión', async () => {
  const { correo } = await crearCuenta();

  for (let i = 0; i < 3; i += 1) {
    assert.equal((await iniciar(correo, 'MalaClave1')).status, 401);
  }
  assert.equal((await iniciar(correo)).status, 429);

  const { token_desarrollo: token } = (await recuperar(correo)).body.data;
  assert.equal((await restablecer(token)).status, 200);

  const ingreso = await iniciar(correo, PASSWORD_NUEVA);
  assert.equal(ingreso.status, 200, 'tras recuperar, puede entrar sin esperar el bloqueo');
});
