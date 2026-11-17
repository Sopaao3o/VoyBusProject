const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_SECRET = 'secreto-de-pruebas';

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');
const { cargarDatosEjemplo } = require('../src/database/seeders/datos-ejemplo');
const { createGoogleOAuth, leerJwt } = require('../src/utils/google');
const { codigoTotp, generarSecreto } = require('../src/utils/totp');

// Google de mentira: cada "código" que devolvería Google corresponde a un perfil.
const PERFILES = {
  nueva: {
    sub: 'g-100',
    correo: 'nueva.persona@gmail.com',
    correoVerificado: true,
    nombre: 'Nueva Persona',
  },
  ana: { sub: 'g-ana', correo: 'ana.pasajera@voybus.cl', correoVerificado: true, nombre: 'Ana P.' },
  ana_otra: {
    sub: 'g-intrusa',
    correo: 'ana.pasajera@voybus.cl',
    correoVerificado: true,
    nombre: 'X',
  },
  carlos: {
    sub: 'g-carlos',
    correo: 'carlos.rojas@voybus.cl',
    correoVerificado: true,
    nombre: 'Carlos',
  },
  sin_verificar: {
    sub: 'g-200',
    correo: 'dudoso@gmail.com',
    correoVerificado: false,
    nombre: 'Dudoso',
  },
  dosfa: {
    sub: 'g-300',
    correo: 'con.2fa@gmail.com',
    correoVerificado: true,
    nombre: 'Con Dos Pasos',
  },
  pendiente: {
    sub: 'g-400',
    correo: 'pendiente@gmail.com',
    correoVerificado: true,
    nombre: 'Pendiente',
  },
};
const googleFalso = {
  configurado: true,
  urlAutorizacion: (estado) => `https://accounts.google.com/o/oauth2/v2/auth?state=${estado}`,
  async canjearCodigo(codigo) {
    if (!PERFILES[codigo]) throw new Error('código inválido');
    return PERFILES[codigo];
  },
};

const RETORNO = 'exp://192.168.1.50:8081/--/google';
let server, base, sequelize, models;

test.before(async () => {
  sequelize = createDatabase(':memory:');
  await createMigrator(sequelize).up();
  models = initModels(sequelize);
  await cargarDatosEjemplo(models);
  server = createApp({ models, google: googleFalso }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
});

test.after(async () => {
  server.close();
  await sequelize.close();
});

const sinSeguir = (url, headers = {}) => fetch(url, { redirect: 'manual', headers });

async function post(ruta, body) {
  const res = await fetch(`${base}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

/** Enlace del botón "Volver a VoyBus" de la página final. */
async function enlaceDeRetorno(res) {
  assert.equal(res.status, 200);
  const html = await res.text();
  const enlace = html.match(/data-retorno="([^"]+)"/);
  assert.ok(enlace, html);
  return enlace[1].replace(/&#38;/g, '&');
}

/** Pasos 1 a 3, como los recorren la app y el navegador. Devuelve el código de la app. */
async function flujo(codigoGoogle, retorno = RETORNO) {
  const preparado = await post('/google/preparar', { retorno });
  assert.equal(preparado.status, 200);
  const { url, codigo } = preparado.body.data;
  const state = new URL(url).searchParams.get('state');
  const callback = await sinSeguir(
    `${base}/google/callback?state=${state}&code=${encodeURIComponent(codigoGoogle)}`,
  );
  const vuelta = await enlaceDeRetorno(callback);
  assert.ok(vuelta.startsWith(retorno), vuelta);
  return codigo;
}

const canjear = (codigo) => post('/google/canjear', { codigo });

/** Recorre el flujo y espera un rechazo: devuelve el mensaje que recibe la app. */
async function rechazo(codigoGoogle) {
  const { status, body } = await canjear(await flujo(codigoGoogle));
  assert.equal(status, 400);
  assert.equal(body.error.code, 'GOOGLE_RECHAZADO');
  return body.error.message;
}

test('ACC-01: con Google se crea una cuenta de pasajero verificada y se entrega un JWT', async () => {
  const codigo = await flujo('nueva');
  const { status, body } = await canjear(codigo);
  assert.equal(status, 200);
  assert.equal(body.data.usuario.rol, 'pasajero');
  assert.equal(body.data.usuario.correo, 'nueva.persona@gmail.com');
  assert.equal(body.data.usuario.correo_verificado, true);
  assert.equal(body.data.usuario.estado, 'habilitado');
  assert.ok(body.data.token);

  const cuenta = await models.Usuario.findOne({ where: { correo: 'nueva.persona@gmail.com' } });
  assert.equal(cuenta.google_sub, 'g-100');
  assert.ok(cuenta.terminos_aceptados_en);
  assert.equal(cuenta.password_hash, null);

  // El código de la app es de un solo uso.
  const repetido = await canjear(codigo);
  assert.equal(repetido.status, 400);
  assert.equal(repetido.body.error.code, 'GOOGLE_CODIGO_INVALIDO');

  // Entrar de nuevo con Google usa la misma cuenta: no se duplica.
  const otra = await canjear(await flujo('nueva'));
  assert.equal(otra.body.data.usuario.id, body.data.usuario.id);
  assert.equal(await models.Usuario.count({ where: { correo: 'nueva.persona@gmail.com' } }), 1);
});

test('ACC-02: si el correo ya tiene cuenta de pasajero, Google se vincula a esa cuenta', async () => {
  const { body } = await canjear(await flujo('ana'));
  assert.equal(body.data.usuario.id, 5);
  const ana = await models.Usuario.findByPk(5);
  assert.equal(ana.google_sub, 'g-ana');

  // Otra cuenta de Google con el mismo correo no puede tomar la cuenta ya vinculada.
  assert.match(await rechazo('ana_otra'), /otra cuenta de Google/);
});

test('ACC-02: conductores y administradores no entran con Google', async () => {
  assert.match(await rechazo('carlos'), /conductor y administrador/);
  assert.equal((await models.Usuario.findByPk(2)).google_sub, null);
});

test('ACC-02: un correo de Google sin verificar o una cuenta deshabilitada no entran', async () => {
  assert.match(await rechazo('sin_verificar'), /correo verificado/);

  await models.Usuario.create({
    rol: 'pasajero',
    nombre_visible: 'Bloqueada',
    correo: 'bloqueada@gmail.com',
    estado: 'deshabilitado',
    tipo_acceso: 'registrado',
  });
  PERFILES.bloqueada = {
    sub: 'g-500',
    correo: 'bloqueada@gmail.com',
    correoVerificado: true,
    nombre: 'B',
  };
  assert.match(await rechazo('bloqueada'), /deshabilitada/);
});

test('ACC-01: una cuenta pendiente de verificación queda habilitada al entrar con Google', async () => {
  await models.Usuario.create({
    rol: 'pasajero',
    nombre_visible: 'Pendiente',
    correo: 'pendiente@gmail.com',
    estado: 'sin_verificar',
    tipo_acceso: 'registrado',
    codigo_verificacion: 'x',
    canal_verificacion: 'correo',
  });
  const { body } = await canjear(await flujo('pendiente'));
  assert.equal(body.data.usuario.estado, 'habilitado');
  const cuenta = await models.Usuario.findOne({ where: { correo: 'pendiente@gmail.com' } });
  assert.equal(cuenta.codigo_verificacion, null);
});

test('ACC-02: con 2FA activo, Google entrega el desafío y la sesión solo llega con el código', async () => {
  const secreto = generarSecreto();
  await models.Usuario.create({
    rol: 'pasajero',
    nombre_visible: 'Con Dos Pasos',
    correo: 'con.2fa@gmail.com',
    estado: 'habilitado',
    tipo_acceso: 'registrado',
    correo_verificado: 1,
    dos_factores_activo: 1,
    dos_factores_secreto: secreto,
  });
  const { body } = await canjear(await flujo('dosfa'));
  assert.equal(body.data.requiere_2fa, true);
  assert.equal(body.data.token, undefined);

  const res = await fetch(`${base}/2fa/verificar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ desafio: body.data.desafio, codigo: codigoTotp(secreto) }),
  });
  assert.equal(res.status, 200);
  assert.ok((await res.json()).data.token);
});

test('Google: solo vuelve a la app, el state es de un solo uso y cancelar se informa', async () => {
  // Retorno a un sitio cualquiera: se rechaza (evita redirecciones abiertas).
  const mal = await post('/google/preparar', { retorno: 'https://malo.example' });
  assert.equal(mal.status, 400);
  assert.equal(mal.body.error.code, 'GOOGLE_RETORNO_INVALIDO');

  const { url, codigo } = (await post('/google/preparar', { retorno: RETORNO })).body.data;
  // Mientras la persona no termina en Google, el código está pendiente.
  const espera = await canjear(codigo);
  assert.equal(espera.status, 409);
  assert.equal(espera.body.error.code, 'GOOGLE_PENDIENTE');

  const state = new URL(url).searchParams.get('state');
  const cancelado = await sinSeguir(`${base}/google/callback?state=${state}&error=access_denied`);
  assert.match(decodeURIComponent(await enlaceDeRetorno(cancelado)), /Cancelaste/);
  assert.match((await canjear(codigo)).body.error.message, /Cancelaste/);

  // El mismo state no sirve dos veces, ni uno inventado.
  const reuso = await sinSeguir(`${base}/google/callback?state=${state}&code=nueva`);
  assert.equal(reuso.status, 400);
  assert.match(await reuso.text(), /expiró/);
  assert.equal((await sinSeguir(`${base}/google/callback?state=inventado&code=nueva`)).status, 400);

  // Un código que Google rechaza llega a la app como un error general.
  assert.match(await rechazo('no-existe'), /No se pudo completar/);
});

test('Google: en Android la página final pide cerrar la pestaña (la app retira la sesión)', async () => {
  const { url, codigo } = (await post('/google/preparar', { retorno: RETORNO })).body.data;
  const state = new URL(url).searchParams.get('state');
  const res = await sinSeguir(`${base}/google/callback?state=${state}&code=nueva`, {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile',
  });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Cierra esta pestaña/);
  assert.doesNotMatch(html, /exp:\/\//); // no se intenta un salto que Chrome bloquea
  assert.ok((await canjear(codigo)).body.data.token);
});

test('Google sin configurar: la app recibe un aviso claro sin abrir el navegador', async () => {
  const sinGoogle = createApp({
    models,
    google: createGoogleOAuth({ clientId: '', clientSecret: '', urlPublica: '' }),
  }).listen(0);
  await new Promise((r) => sinGoogle.once('listening', r));
  const res = await fetch(
    `http://127.0.0.1:${sinGoogle.address().port}/api/v1/auth/google/preparar`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ retorno: RETORNO }),
    },
  );
  sinGoogle.close();
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error.code, 'GOOGLE_NO_CONFIGURADO');
  assert.match(body.error.message, /no está configurado/);
});

test('Google: el canje real valida el id_token (destinatario, emisor y vencimiento)', async () => {
  const jwtFalso = (payload) =>
    ['e30', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'firma'].join('.');
  const valido = {
    sub: '42',
    email: 'Persona@Gmail.com',
    email_verified: true,
    name: 'Persona',
    aud: 'cliente-1',
    iss: 'https://accounts.google.com',
    exp: Math.floor(Date.now() / 1000) + 600,
  };
  const conRespuesta = (idToken) =>
    createGoogleOAuth({
      clientId: 'cliente-1',
      clientSecret: 's',
      urlPublica: 'https://demo.ngrok-free.app/',
      fetch: async () => ({ ok: true, json: async () => ({ id_token: idToken }) }),
    });

  const google = conRespuesta(jwtFalso(valido));
  assert.equal(google.redirectUri, 'https://demo.ngrok-free.app/api/v1/auth/google/callback');
  assert.match(google.urlAutorizacion('abc'), /state=abc/);
  assert.deepEqual(await google.canjearCodigo('x'), {
    sub: '42',
    correo: 'persona@gmail.com',
    correoVerificado: true,
    nombre: 'Persona',
  });
  await assert.rejects(
    conRespuesta(jwtFalso({ ...valido, aud: 'otra-app' })).canjearCodigo('x'),
    /no es para esta aplicación/,
  );
  await assert.rejects(
    conRespuesta(jwtFalso({ ...valido, iss: 'https://malo' })).canjearCodigo('x'),
    /no lo emitió Google/,
  );
  await assert.rejects(conRespuesta(jwtFalso({ ...valido, exp: 1 })).canjearCodigo('x'), /expiró/);
  assert.equal(leerJwt(jwtFalso({ a: 1 })).a, 1);
});
