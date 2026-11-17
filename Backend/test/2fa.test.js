const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_SECRET = 'secreto-de-pruebas';
process.env.LOGIN_MAX_INTENTOS = '3';
process.env.LOGIN_VENTANA_MINUTOS = '15';
process.env.LOGIN_BLOQUEO_MINUTOS = '5';
process.env.DOS_FACTORES_MINUTOS = '5';

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');
const { codigoTotp } = require('../src/utils/totp');

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
  server = createApp({ models, ahora: () => reloj }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

test.after(async () => {
  server.close();
  await sequelize.close();
});

let contador = 0;
const correoUnico = () => `dosfactores${++contador}@example.com`;

async function crearUsuario({ dosFactores = 0, secreto = null } = {}) {
  return models.Usuario.create({
    rol: 'pasajero',
    nombre_visible: 'Usuario de Prueba',
    correo: correoUnico(),
    password_hash: await bcrypt.hash(PASSWORD, 4),
    estado: 'habilitado',
    tipo_acceso: 'registrado',
    dos_factores_activo: dosFactores,
    dos_factores_secreto: secreto,
    correo_verificado: 1,
  });
}

async function post(ruta, body = {}, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + ruta, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

const iniciar = (correo, password = PASSWORD) => post('/auth/iniciar-sesion', { correo, password });

const codigoPara = (secreto, pasos = 0) =>
  codigoTotp(secreto, { fecha: new Date(reloj.getTime() + pasos * 30_000) });

/** Un código de 6 dígitos distinto al válido en este momento. */
function codigoErroneo(secreto) {
  const valido = codigoPara(secreto);
  const primerDigito = (Number(valido[0]) + 1) % 10;
  return String(primerDigito) + valido.slice(1);
}

/** Deja una cuenta con la verificación en dos pasos activa y devuelve su secreto. */
async function activar2fa() {
  const usuario = await crearUsuario();
  const token = (await iniciar(usuario.correo)).body.data.token;
  const inicio = await post('/auth/2fa/iniciar', {}, token);
  assert.equal(inicio.status, 200, JSON.stringify(inicio.body));
  const { secreto } = inicio.body.data;
  const confirmado = await post('/auth/2fa/confirmar', { codigo: codigoPara(secreto) }, token);
  assert.equal(confirmado.status, 200, JSON.stringify(confirmado.body));
  return { usuario, secreto, token };
}

test('TOTP: cumple los vectores de prueba del RFC 6238', () => {
  const secreto = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890" en ASCII
  assert.equal(codigoTotp(secreto, { paso: 1, digitos: 8 }), '94287082');
  assert.equal(codigoTotp(secreto, { paso: 37037036, digitos: 8 }), '07081804');
  assert.equal(codigoTotp(secreto, { paso: 41152263, digitos: 8 }), '89005924');
  assert.equal(codigoTotp(secreto, { paso: 66666666, digitos: 8 }), '69279037');
});

test('ACC-01: configura la verificación en dos pasos con un QR y un código de 6 dígitos', async () => {
  const usuario = await crearUsuario();
  const token = (await iniciar(usuario.correo)).body.data.token;

  const inicio = await post('/auth/2fa/iniciar', {}, token);
  assert.equal(inicio.status, 200, JSON.stringify(inicio.body));
  const { secreto, otpauth_url, cuenta, emisor, digitos, periodo } = inicio.body.data;
  assert.match(secreto, /^[A-Z2-7]{32}$/, 'secreto base32 de 160 bits');
  assert.match(otpauth_url, /^otpauth:\/\/totp\//);
  assert.match(otpauth_url, new RegExp(`secret=${secreto}`));
  assert.match(otpauth_url, /issuer=VoyBus/);
  assert.equal(cuenta, usuario.correo);
  assert.equal(emisor, 'VoyBus');
  assert.equal(digitos, 6);
  assert.equal(periodo, 30);

  const confirmado = await post('/auth/2fa/confirmar', { codigo: codigoPara(secreto) }, token);
  assert.equal(confirmado.status, 200, JSON.stringify(confirmado.body));
  assert.equal(confirmado.body.data.usuario.dos_factores_activo, true);
  assert.match(confirmado.body.data.mensaje, /activada/i);
  assert.ok(!JSON.stringify(confirmado.body).includes(secreto), 'no devuelve el secreto');

  const guardado = await models.Usuario.findByPk(usuario.id);
  assert.equal(guardado.dos_factores_activo, 1);
  assert.equal(guardado.dos_factores_secreto, secreto);
  assert.ok(guardado.dos_factores_confirmado_en);
});

test('ACC-01: no activa la verificación en dos pasos con un código incorrecto', async () => {
  const usuario = await crearUsuario();
  const token = (await iniciar(usuario.correo)).body.data.token;

  const sinInicio = await post('/auth/2fa/confirmar', { codigo: '123456' }, token);
  assert.equal(sinInicio.status, 400);
  assert.equal(sinInicio.body.error.code, 'DOS_FACTORES_SIN_CONFIGURAR');

  const { secreto } = (await post('/auth/2fa/iniciar', {}, token)).body.data;
  const malo = await post('/auth/2fa/confirmar', { codigo: codigoErroneo(secreto) }, token);
  assert.equal(malo.status, 400);
  assert.equal(malo.body.error.code, 'CODIGO_2FA_INVALIDO');

  const guardado = await models.Usuario.findByPk(usuario.id);
  assert.equal(guardado.dos_factores_activo, 0);

  const ingreso = await iniciar(usuario.correo);
  assert.equal(ingreso.status, 200);
  assert.ok(ingreso.body.data.token, 'sin activar, el inicio de sesión no pide código');
});

test('ACC-01: no permite configurar dos veces si ya está activa', async () => {
  const { token } = await activar2fa();
  const otraVez = await post('/auth/2fa/iniciar', {}, token);
  assert.equal(otraVez.status, 409);
  assert.equal(otraVez.body.error.code, 'DOS_FACTORES_YA_ACTIVO');
});

test('ACC-02: con 2FA activo pide el código y solo entonces entrega la sesión', async () => {
  const { usuario, secreto } = await activar2fa();

  const ingreso = await iniciar(usuario.correo);
  assert.equal(ingreso.status, 200);
  assert.equal(ingreso.body.data.requiere_2fa, true);
  assert.ok(ingreso.body.data.desafio);
  assert.ok(ingreso.body.data.expira_en);
  assert.equal(ingreso.body.data.usuario.id, usuario.id);
  assert.ok(!ingreso.body.data.token, 'la contraseña sola no entrega la sesión');
  assert.ok(!ingreso.body.data.token_type);

  // El desafío no abre una ruta privada.
  const privada = await fetch(base + '/viajes/999/paraderos-disponibles', {
    headers: { Authorization: `Bearer ${ingreso.body.data.desafio}` },
  });
  assert.equal(privada.status, 401);
  assert.equal((await privada.json()).error.code, 'SEGUNDO_FACTOR_PENDIENTE');

  const verificado = await post('/auth/2fa/verificar', {
    desafio: ingreso.body.data.desafio,
    codigo: codigoPara(secreto),
  });
  assert.equal(verificado.status, 200, JSON.stringify(verificado.body));
  assert.equal(verificado.body.data.usuario.id, usuario.id);
  assert.ok(verificado.body.data.token);

  const conSesion = await fetch(base + '/viajes/999/paraderos-disponibles', {
    headers: { Authorization: `Bearer ${verificado.body.data.token}` },
  });
  assert.equal(conSesion.status, 404, 'el token de sesión sí entra a las rutas privadas');
});

test('ACC-02: rechaza un código incorrecto y no entrega la sesión', async () => {
  const { usuario, secreto } = await activar2fa();
  const ingreso = await iniciar(usuario.correo);

  const malo = await post('/auth/2fa/verificar', {
    desafio: ingreso.body.data.desafio,
    codigo: codigoErroneo(secreto),
  });
  assert.equal(malo.status, 401);
  assert.equal(malo.body.error.code, 'CODIGO_2FA_INVALIDO');
  assert.match(malo.body.error.message, /código/i);
  assert.ok(!malo.body.data);
});

test('ACC-02: un código de 6 dígitos no se puede reutilizar', async () => {
  const { usuario, secreto } = await activar2fa();
  const codigo = codigoPara(secreto);

  const primero = await iniciar(usuario.correo);
  const ok = await post('/auth/2fa/verificar', {
    desafio: primero.body.data.desafio,
    codigo,
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));

  const segundo = await iniciar(usuario.correo);
  const repetido = await post('/auth/2fa/verificar', {
    desafio: segundo.body.data.desafio,
    codigo,
  });
  assert.equal(repetido.status, 401);
  assert.equal(repetido.body.error.code, 'CODIGO_2FA_INVALIDO');

  avanzar(30_000);
  const nuevo = await post('/auth/2fa/verificar', {
    desafio: segundo.body.data.desafio,
    codigo: codigoPara(secreto),
  });
  assert.equal(nuevo.status, 200, JSON.stringify(nuevo.body));
});

test('ACC-02: varios códigos incorrectos piden esperar', async () => {
  const { usuario, secreto } = await activar2fa();
  const ingreso = await iniciar(usuario.correo);

  for (let i = 0; i < 3; i += 1) {
    const r = await post('/auth/2fa/verificar', {
      desafio: ingreso.body.data.desafio,
      codigo: codigoErroneo(secreto),
    });
    assert.equal(r.status, 401);
  }

  const bloqueado = await post('/auth/2fa/verificar', {
    desafio: ingreso.body.data.desafio,
    codigo: codigoPara(secreto),
  });
  assert.equal(bloqueado.status, 429);
  assert.equal(bloqueado.body.error.code, 'DEMASIADOS_INTENTOS');
  assert.ok(Number(bloqueado.headers.get('retry-after')) > 0);

  avanzar(5 * 60 * 1000 + 1000);
  const nuevoIngreso = await iniciar(usuario.correo);
  const despues = await post('/auth/2fa/verificar', {
    desafio: nuevoIngreso.body.data.desafio,
    codigo: codigoPara(secreto),
  });
  assert.equal(despues.status, 200, JSON.stringify(despues.body));
});

test('ACC-02: rechaza un desafío vencido, de sesión o mal formado', async () => {
  const usuario = await crearUsuario();
  const sesion = (await iniciar(usuario.correo)).body.data.token;

  const conSesion = await post('/auth/2fa/verificar', { desafio: sesion, codigo: '123456' });
  assert.equal(conSesion.status, 401);
  assert.equal(conSesion.body.error.code, 'DESAFIO_2FA_INVALIDO');

  const vencido = jwt.sign(
    {
      sub: String(usuario.id),
      rol: 'pasajero',
      tipo_acceso: 'registrado',
      alcance: '2fa',
      exp: Math.floor(Date.now() / 1000) - 60,
    },
    process.env.JWT_SECRET,
  );
  const rVencido = await post('/auth/2fa/verificar', { desafio: vencido, codigo: '123456' });
  assert.equal(rVencido.status, 401);
  assert.equal(rVencido.body.error.code, 'DESAFIO_2FA_INVALIDO');

  const basura = await post('/auth/2fa/verificar', { desafio: 'no-es-jwt', codigo: '123456' });
  assert.equal(basura.status, 401);
  assert.equal(basura.body.error.code, 'DESAFIO_2FA_INVALIDO');
});

test('ACC-01/02: valida el código y el desafío de la verificación en dos pasos', async () => {
  for (const [body, campo] of [
    [{}, 'body.codigo'],
    [{ codigo: '123' }, 'body.codigo'],
    [{ codigo: 'abcdef' }, 'body.codigo'],
    [{ codigo: '123456' }, 'body.desafio'],
  ]) {
    const { status, body: respuesta } = await post('/auth/2fa/verificar', body);
    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(respuesta.error.code, 'VALIDACION');
    assert.ok(
      respuesta.error.details.some((d) => d.campo === campo),
      JSON.stringify(body),
    );
  }

  const sinSesion = await post('/auth/2fa/confirmar', { codigo: '123456' });
  assert.equal(sinSesion.status, 401);
  assert.equal(sinSesion.body.error.code, 'NO_AUTENTICADO');

  const sinSesionInicio = await post('/auth/2fa/iniciar', {});
  assert.equal(sinSesionInicio.status, 401);
  assert.equal(sinSesionInicio.body.error.code, 'NO_AUTENTICADO');
});

test('ACC-01: desactiva la verificación en dos pasos con contraseña y código', async () => {
  const { usuario, secreto, token } = await activar2fa();

  const malaPassword = await post(
    '/auth/2fa/desactivar',
    { password_actual: 'Otra123!', codigo: codigoPara(secreto) },
    token,
  );
  assert.equal(malaPassword.status, 401);
  assert.equal(malaPassword.body.error.code, 'PASSWORD_ACTUAL_INCORRECTA');

  const malCodigo = await post(
    '/auth/2fa/desactivar',
    { password_actual: PASSWORD, codigo: codigoErroneo(secreto) },
    token,
  );
  assert.equal(malCodigo.status, 400);
  assert.equal(malCodigo.body.error.code, 'CODIGO_2FA_INVALIDO');

  const desactivado = await post(
    '/auth/2fa/desactivar',
    { password_actual: PASSWORD, codigo: codigoPara(secreto) },
    token,
  );
  assert.equal(desactivado.status, 200, JSON.stringify(desactivado.body));
  assert.equal(desactivado.body.data.usuario.dos_factores_activo, false);
  assert.match(desactivado.body.data.mensaje, /desactivada/i);

  const guardado = await models.Usuario.findByPk(usuario.id);
  assert.equal(guardado.dos_factores_activo, 0);
  assert.equal(guardado.dos_factores_secreto, null);

  const ingreso = await iniciar(usuario.correo);
  assert.equal(ingreso.status, 200);
  assert.ok(ingreso.body.data.token, 'sin 2FA, el inicio de sesión entrega la sesión');

  const otraVez = await post(
    '/auth/2fa/desactivar',
    { password_actual: PASSWORD, codigo: codigoPara(secreto) },
    token,
  );
  assert.equal(otraVez.status, 409);
  assert.equal(otraVez.body.error.code, 'DOS_FACTORES_NO_ACTIVO');
});

test('ACC-01: las cuentas de invitado no pueden usar la verificación en dos pasos', async () => {
  const invitado = await post('/auth/invitado', {});
  assert.equal(invitado.status, 201);

  const inicio = await post('/auth/2fa/iniciar', {}, invitado.body.data.token);
  assert.equal(inicio.status, 403);
  assert.equal(inicio.body.error.code, 'CUENTA_INVITADA');
});
