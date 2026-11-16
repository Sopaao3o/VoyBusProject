const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_SECRET = 'secreto-de-pruebas';

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');

let server, base, sequelize, models;

test.before(async () => {
  sequelize = createDatabase(':memory:');
  await createMigrator(sequelize).up();
  models = initModels(sequelize);
  server = createApp({ models, exponerCodigoVerificacion: true }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

test.after(async () => {
  server.close();
  await sequelize.close();
});

let contador = 0;
const correoUnico = () => `pasajero${++contador}@example.com`;
const telefonoUnico = () => `+569${String(10000000 + contador++)}`;

const registro = (extra = {}) => ({
  nombre: 'Ana Pérez',
  correo: correoUnico(),
  password: 'Clave123!',
  confirmacion: 'Clave123!',
  acepta_terminos: true,
  ...extra,
});

async function post(ruta, body) {
  const res = await fetch(base + ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const registrar = (extra) => post('/auth/registro', registro(extra));

test('ACC-01: crea una cuenta de pasajero y devuelve el código de verificación en desarrollo', async () => {
  const { status, body } = await registrar({ correo: '  Ana.Perez@Example.COM ' });

  assert.equal(status, 201);
  assert.equal(body.data.usuario.correo, 'ana.perez@example.com');
  assert.equal(body.data.usuario.rol, 'pasajero');
  assert.equal(body.data.usuario.estado, 'sin_verificar');
  assert.equal(body.data.usuario.tipo_acceso, 'registrado');
  assert.equal(body.data.usuario.correo_verificado, false);
  assert.equal(body.data.verificacion.requerida, true);
  assert.equal(body.data.verificacion.canal, 'correo');
  assert.match(body.data.verificacion.codigo_desarrollo, /^\d{6}$/);
  assert.ok(!JSON.stringify(body).includes('password_hash'));

  const guardado = await models.Usuario.findByPk(body.data.usuario.id);
  assert.notEqual(guardado.password_hash, 'Clave123!');
  assert.ok(await bcrypt.compare('Clave123!', guardado.password_hash));
  assert.notEqual(guardado.codigo_verificacion, body.data.verificacion.codigo_desarrollo);
  assert.ok(guardado.terminos_aceptados_en);
});

test('ACC-01: la contraseña debe tener entre 8 y 15 caracteres y mayúscula, minúscula, número y símbolo', async () => {
  const invalidas = {
    'Ab1!xyz': /al menos 8/,
    'Abcdef123456789!': /como máximo 15/,
    'abcdef1!': /mayúscula/,
    'ABCDEF1!': /minúscula/,
    'Abcdefg!': /número/,
    Abcdefg1: /símbolo/,
  };

  for (const [password, mensaje] of Object.entries(invalidas)) {
    const { status, body } = await post('/auth/registro', {
      ...registro(),
      password,
      confirmacion: password,
    });
    assert.equal(status, 400, `debería rechazar "${password}"`);
    assert.equal(body.error.code, 'VALIDACION');
    assert.ok(
      body.error.details.some((d) => d.campo === 'body.password' && mensaje.test(d.mensaje)),
      `debería explicar el problema de "${password}"`,
    );
  }
});

test('ACC-01: la confirmación debe coincidir con la contraseña', async () => {
  const { status, body } = await registrar({ confirmacion: 'Otra123!' });
  assert.equal(status, 400);
  assert.ok(
    body.error.details.some(
      (d) => d.campo === 'body.confirmacion' && /no coincide/.test(d.mensaje),
    ),
  );
});

test('ACC-01: es obligatorio aceptar los términos de privacidad', async () => {
  const { status, body } = await registrar({ acepta_terminos: false });
  assert.equal(status, 400);
  assert.ok(
    body.error.details.some(
      (d) => d.campo === 'body.acepta_terminos' && /términos/.test(d.mensaje),
    ),
  );
});

test('ACC-01: exige un correo o un teléfono válido', async () => {
  const sinContacto = await post('/auth/registro', {
    nombre: 'Ana Pérez',
    password: 'Clave123!',
    confirmacion: 'Clave123!',
    acepta_terminos: true,
  });
  assert.equal(sinContacto.status, 400);
  assert.ok(sinContacto.body.error.details.some((d) => d.campo === 'body.correo'));

  const correoMalo = await registrar({ correo: 'no-es-un-correo' });
  assert.equal(correoMalo.status, 400);
  assert.ok(correoMalo.body.error.details.some((d) => d.campo === 'body.correo'));

  const telefonoMalo = await post('/auth/registro', {
    ...registro(),
    correo: undefined,
    telefono: 'abc',
  });
  assert.equal(telefonoMalo.status, 400);
  assert.ok(telefonoMalo.body.error.details.some((d) => d.campo === 'body.telefono'));
});

test('ACC-01: no permite dos cuentas con el mismo correo (sin importar mayúsculas)', async () => {
  const correo = correoUnico();
  const primera = await registrar({ correo });
  assert.equal(primera.status, 201);

  const { status, body } = await registrar({ correo: correo.toUpperCase() });
  assert.equal(status, 409);
  assert.equal(body.error.code, 'CUENTA_DUPLICADA');
  assert.ok(body.error.details.some((d) => d.campo === 'body.correo'));
});

test('ACC-01: no permite dos cuentas con el mismo teléfono (aunque cambie el formato)', async () => {
  const telefono = telefonoUnico();
  const primera = await post('/auth/registro', {
    ...registro(),
    correo: undefined,
    telefono: `${telefono.slice(0, 3)} ${telefono.slice(3, 6)} ${telefono.slice(6)}`,
  });
  assert.equal(primera.status, 201);
  assert.equal(primera.body.data.verificacion.canal, 'telefono');

  const { status, body } = await post('/auth/registro', {
    ...registro(),
    correo: undefined,
    telefono,
  });
  assert.equal(status, 409);
  assert.equal(body.error.code, 'CUENTA_DUPLICADA');
  assert.ok(body.error.details.some((d) => d.campo === 'body.telefono'));
});

test('ACC-01: el registro público solo crea pasajeros aunque se envíe otro rol', async () => {
  const { status, body } = await registrar({ rol: 'administrador', tipo_acceso: 'invitado' });
  assert.equal(status, 201);
  assert.equal(body.data.usuario.rol, 'pasajero');
  assert.equal(body.data.usuario.tipo_acceso, 'registrado');

  const guardado = await models.Usuario.findByPk(body.data.usuario.id);
  assert.equal(guardado.rol, 'pasajero');
});

test('ACC-01: verifica el correo, habilita la cuenta y entrega un token JWT', async () => {
  const correo = correoUnico();
  const creada = await registrar({ correo });
  assert.equal(creada.status, 201);

  const { status, body } = await post('/auth/verificar-contacto', {
    correo,
    codigo: creada.body.data.verificacion.codigo_desarrollo,
  });

  assert.equal(status, 200);
  assert.equal(body.data.usuario.estado, 'habilitado');
  assert.equal(body.data.usuario.correo_verificado, true);
  assert.equal(body.data.token_type, 'Bearer');
  assert.ok(body.data.expira_en);

  const payload = jwt.verify(body.data.token, process.env.JWT_SECRET);
  assert.equal(payload.sub, String(body.data.usuario.id));
  assert.equal(payload.rol, 'pasajero');

  const guardado = await models.Usuario.findByPk(body.data.usuario.id);
  assert.equal(guardado.estado, 'habilitado');
  assert.equal(guardado.codigo_verificacion, null);
  assert.equal(guardado.canal_verificacion, null);
});

test('ACC-01: verifica el teléfono cuando el registro fue con teléfono', async () => {
  const telefono = telefonoUnico();
  const creada = await post('/auth/registro', {
    ...registro(),
    correo: undefined,
    telefono,
  });
  assert.equal(creada.status, 201);

  const { status, body } = await post('/auth/verificar-contacto', {
    telefono,
    codigo: creada.body.data.verificacion.codigo_desarrollo,
  });
  assert.equal(status, 200);
  assert.equal(body.data.usuario.estado, 'habilitado');
  assert.equal(body.data.usuario.telefono_verificado, true);
  assert.equal(body.data.usuario.telefono, telefono.replace(/\D/g, ''));
});

test('ACC-01: rechaza un código incorrecto o expirado', async () => {
  const correo = correoUnico();
  const creada = await registrar({ correo });
  const codigo = creada.body.data.verificacion.codigo_desarrollo;

  const incorrecto = await post('/auth/verificar-contacto', {
    correo,
    codigo: codigo === '000000' ? '111111' : '000000',
  });
  assert.equal(incorrecto.status, 400);
  assert.equal(incorrecto.body.error.code, 'CODIGO_INVALIDO');

  await models.Usuario.update(
    { codigo_verificacion_expira: new Date(Date.now() - 1000).toISOString() },
    { where: { correo } },
  );
  const expirado = await post('/auth/verificar-contacto', {
    correo,
    codigo: creada.body.data.verificacion.codigo_desarrollo,
  });
  assert.equal(expirado.status, 409);
  assert.equal(expirado.body.error.code, 'CODIGO_EXPIRADO');
});

test('ACC-01: no vuelve a verificar una cuenta ya habilitada', async () => {
  const correo = correoUnico();
  const creada = await registrar({ correo });
  const codigo = creada.body.data.verificacion.codigo_desarrollo;

  assert.equal((await post('/auth/verificar-contacto', { correo, codigo })).status, 200);
  const repetida = await post('/auth/verificar-contacto', { correo, codigo });
  assert.equal(repetida.status, 409);
  assert.match(repetida.body.error.message, /ya está verificada/);
});

test('ACC-01: el acceso como invitado crea un pasajero temporal sin contraseña', async () => {
  const { status, body } = await post('/auth/invitado');
  assert.equal(status, 201);
  assert.equal(body.data.usuario.rol, 'pasajero');
  assert.equal(body.data.usuario.tipo_acceso, 'invitado');
  assert.equal(body.data.usuario.estado, 'habilitado');
  assert.equal(body.data.usuario.correo, null);

  const payload = jwt.verify(body.data.token, process.env.JWT_SECRET);
  assert.equal(payload.tipo_acceso, 'invitado');

  const guardado = await models.Usuario.findByPk(body.data.usuario.id);
  assert.equal(guardado.password_hash, null);
  assert.match(guardado.identificador, /^INV-/);
});

test('ACC-01: reenvía un código nuevo, invalida el anterior y pide esperar entre reenvíos', async () => {
  const correo = correoUnico();
  const alta = await registrar({ correo });
  const codigoViejo = alta.body.data.verificacion.codigo_desarrollo;

  const reenvio = await post('/auth/reenviar-codigo', { correo });
  assert.equal(reenvio.status, 200);
  const codigoNuevo = reenvio.body.data.codigo_desarrollo;
  assert.match(codigoNuevo, /^\d{6}$/);
  assert.ok(reenvio.body.data.expira_en);

  if (codigoViejo !== codigoNuevo) {
    const conViejo = await post('/auth/verificar-contacto', { correo, codigo: codigoViejo });
    assert.equal(conViejo.status, 400);
    assert.equal(conViejo.body.error.code, 'CODIGO_INVALIDO');
  }

  // Un segundo reenvío inmediato debe esperar.
  const repetido = await post('/auth/reenviar-codigo', { correo });
  assert.equal(repetido.status, 429);
  assert.equal(repetido.body.error.code, 'DEMASIADOS_INTENTOS');

  const conNuevo = await post('/auth/verificar-contacto', { correo, codigo: codigoNuevo });
  assert.equal(conNuevo.status, 200);
  assert.ok(conNuevo.body.data.token);
});

test('ACC-01: el reenvío no revela si el contacto tiene cuenta ni reenvía a cuentas verificadas', async () => {
  const desconocido = await post('/auth/reenviar-codigo', { correo: 'nadie@example.com' });
  assert.equal(desconocido.status, 200);
  assert.equal(desconocido.body.data.codigo_desarrollo, undefined);

  const correo = correoUnico();
  const alta = await registrar({ correo });
  await post('/auth/verificar-contacto', {
    correo,
    codigo: alta.body.data.verificacion.codigo_desarrollo,
  });
  const verificada = await post('/auth/reenviar-codigo', { correo });
  assert.equal(verificada.status, 200);
  assert.equal(verificada.body.data.mensaje, desconocido.body.data.mensaje);
  assert.equal(verificada.body.data.codigo_desarrollo, undefined);

  const sinContacto = await post('/auth/reenviar-codigo', {});
  assert.equal(sinContacto.status, 400);
});
