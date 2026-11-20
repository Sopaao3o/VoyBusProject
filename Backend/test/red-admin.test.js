const test = require('node:test');
const assert = require('node:assert/strict');

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
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

test.after(async () => {
  server.close();
  await sequelize.close();
});

// 1 = admin, 2 = Carlos (conductor), 5 = Ana (pasajera). `as: null` = sin sesión.
const call = async (method, path, { as = 1, body } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (as) headers.Authorization = `Bearer ${tokenPara(as)}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

let numero = 500;
const nuevaLinea = (extra = {}) =>
  call('POST', '/admin/red/lineas', {
    body: {
      codigo: String(++numero),
      nombre: `Línea de prueba ${numero}`,
      color: '#2E7D32',
      ...extra,
    },
  });
const nuevoRecorrido = (lineaId, extra = {}) =>
  call('POST', `/admin/red/lineas/${lineaId}/recorridos`, {
    body: {
      sentido: 'ida',
      dias_funcionamiento: 'Lunes a viernes',
      horarios: '07:00 - 21:00',
      paraderos: [2, 12, 4],
      ...extra,
    },
  });
let paraderoNumero = 100;
const nuevoParadero = (extra = {}) =>
  call('POST', '/admin/red/paraderos', {
    body: {
      codigo: `pa-${++paraderoNumero}`,
      nombre: `Paradero de prueba ${paraderoNumero}`,
      latitud: -23.64,
      longitud: -70.4,
      ...extra,
    },
  });

/** Un viaje en curso del recorrido indicado (BUS-06 con Carlos). */
async function viajeEnCurso(recorridoId) {
  await models.Turno.update({ estado: 'finalizado' }, { where: { conductor_id: 2 } });
  const turno = await models.Turno.create({
    conductor_id: 2,
    vehiculo_id: 6,
    estado: 'en_curso',
    inicio_planificado: '2027-06-01T08:00:00.000Z',
    termino_planificado: '2027-06-01T16:00:00.000Z',
  });
  return models.Viaje.create({
    turno_id: turno.id,
    recorrido_id: recorridoId,
    orden_en_turno: 1,
    estado: 'en_curso',
    inicio_planificado: '2027-06-01T08:30:00.000Z',
    termino_planificado: '2027-06-01T10:00:00.000Z',
  });
}

test('ADM-01: solo el administrador gestiona la red', async () => {
  assert.equal((await call('GET', '/admin/red/lineas', { as: null })).status, 401);
  assert.equal((await call('GET', '/admin/red/lineas', { as: 2 })).status, 403);
  assert.equal((await call('POST', '/admin/red/paraderos', { as: 5, body: {} })).status, 403);
});

// ── Líneas ──

test('ADM-01: crea una línea con código, nombre, color y estado, y aparece en la consulta pública', async () => {
  const r = await nuevaLinea({ codigo: '120', nombre: 'Playa – Centro' });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.estado_servicio, 'activa');
  assert.equal(r.body.data.color, '#2E7D32');
  const publicas = (await call('GET', '/lineas', { as: null })).body.data;
  assert.ok(publicas.some((l) => l.codigo === '120'));
});

test('ADM-01: el código de la línea no se repite (sin importar mayúsculas)', async () => {
  await nuevaLinea({ codigo: 'X10' });
  const repetida = await nuevaLinea({ codigo: 'x10' });
  assert.equal(repetida.status, 409);
  assert.match(repetida.body.error.message, /Ya existe una línea con el código/);
  assert.equal((await nuevaLinea({ codigo: '103' })).status, 409); // ya está en los datos de ejemplo
});

test('ADM-01: valida los datos de la línea', async () => {
  assert.equal((await nuevaLinea({ color: 'azul' })).status, 400);
  assert.equal((await nuevaLinea({ codigo: '1 0 3' })).status, 400);
  assert.equal((await nuevaLinea({ nombre: 'A' })).status, 400);
  assert.equal((await nuevaLinea({ estado_servicio: 'pausada' })).status, 400);
  const linea = (await nuevaLinea()).body.data;
  assert.equal((await call('PUT', `/admin/red/lineas/${linea.id}`, { body: {} })).status, 400);
});

test('ADM-01: suspender o desactivar una línea se refleja en la consulta pública', async () => {
  const linea = (await nuevaLinea()).body.data;
  await call('PUT', `/admin/red/lineas/${linea.id}`, { body: { estado_servicio: 'suspendida' } });
  const suspendida = (await call('GET', `/lineas/${linea.id}`, { as: null })).body.data;
  assert.match(suspendida.aviso, /suspendida/);

  await call('PUT', `/admin/red/lineas/${linea.id}`, { body: { estado_servicio: 'desactivada' } });
  assert.equal((await call('GET', `/lineas/${linea.id}`, { as: null })).status, 404);
  // El administrador sigue viéndola para poder reactivarla.
  const admin = (await call('GET', '/admin/red/lineas')).body.data;
  assert.equal(admin.find((l) => l.id === linea.id).estado_servicio, 'desactivada');
});

test('ADM-01: una línea desactivada no se puede usar en un turno nuevo', async () => {
  const linea = (await nuevaLinea()).body.data;
  const recorrido = (await nuevoRecorrido(linea.id)).body.data;
  await call('PUT', `/admin/red/lineas/${linea.id}`, { body: { estado_servicio: 'desactivada' } });
  const turno = await call('POST', '/admin/turnos', {
    body: {
      conductor_id: 3,
      vehiculo_id: 7,
      inicio_planificado: '2027-07-01T08:00:00Z',
      termino_planificado: '2027-07-01T12:00:00Z',
      viajes: [
        {
          recorrido_id: recorrido.id,
          inicio_planificado: '2027-07-01T08:30:00Z',
          termino_planificado: '2027-07-01T09:30:00Z',
        },
      ],
    },
  });
  assert.equal(turno.status, 409);
  assert.match(turno.body.error.message, /no está activa/);
});

// ── Recorridos ──

test('ADM-01: crea un recorrido con sus paraderos en orden (inicio y término)', async () => {
  const linea = (await nuevaLinea()).body.data;
  const r = await nuevoRecorrido(linea.id, { paraderos: [2, 12, 4, 9] });
  assert.equal(r.status, 201);
  assert.deepEqual(
    r.body.data.paraderos.map((p) => [p.orden, p.codigo]),
    [
      [1, 'PA-002'],
      [2, 'PA-012'],
      [3, 'PA-004'],
      [4, 'PA-009'],
    ],
  );
  const publica = (await call('GET', `/lineas/${linea.id}`, { as: null })).body.data;
  assert.equal(publica.punto_inicio, 'Plaza Colón');
  assert.equal(publica.punto_termino, 'Terminal Norte');
});

test('ADM-01: valida los paraderos del recorrido y un solo recorrido por sentido', async () => {
  const linea = (await nuevaLinea()).body.data;
  assert.equal((await nuevoRecorrido(linea.id, { paraderos: [2] })).status, 400);
  assert.equal((await nuevoRecorrido(linea.id, { paraderos: [2, 4, 2] })).status, 400);
  const inexistente = await nuevoRecorrido(linea.id, { paraderos: [2, 9999] });
  assert.equal(inexistente.status, 400);
  assert.match(inexistente.body.error.message, /No existen los paraderos: 9999/);
  const inactivo = await nuevoRecorrido(linea.id, { paraderos: [2, 13] }); // PA-013 fuera de uso
  assert.equal(inactivo.status, 400);
  assert.match(inactivo.body.error.message, /desactivados: PA-013/);

  assert.equal((await nuevoRecorrido(linea.id)).status, 201);
  const otraIda = await nuevoRecorrido(linea.id);
  assert.equal(otraIda.status, 409);
  assert.match(otraIda.body.error.message, /ya tiene un recorrido de ida/);
  assert.equal((await nuevoRecorrido(linea.id, { sentido: 'vuelta' })).status, 201);
});

test('ADM-01: con viajes en curso, los paraderos del recorrido no cambian; días y horarios sí', async () => {
  const linea = (await nuevaLinea()).body.data;
  const recorrido = (await nuevoRecorrido(linea.id, { paraderos: [2, 12, 4] })).body.data;
  const viaje = await viajeEnCurso(recorrido.id);
  const ruta = `/admin/red/recorridos/${recorrido.id}`;

  const horarios = await call('PUT', ruta, { body: { horarios: '06:00 - 23:00' } });
  assert.equal(horarios.status, 200);
  assert.equal(horarios.body.data.horarios, '06:00 - 23:00');
  assert.equal(horarios.body.data.viajes_en_curso, 1);

  const cambio = await call('PUT', ruta, { body: { paraderos: [2, 4, 12] } });
  assert.equal(cambio.status, 409);
  assert.match(cambio.body.error.message, /1 viaje en curso/);
  const sinCambios = (await call('GET', ruta)).body.data.paraderos.map((p) => p.codigo);
  assert.deepEqual(sinCambios, ['PA-002', 'PA-012', 'PA-004']);

  // Enviar el mismo orden no es un cambio.
  assert.equal((await call('PUT', ruta, { body: { paraderos: [2, 12, 4] } })).status, 200);

  await viaje.update({ estado: 'finalizado' });
  const ahora = await call('PUT', ruta, { body: { paraderos: [2, 4, 12] } });
  assert.equal(ahora.status, 200);
  assert.deepEqual(
    ahora.body.data.paraderos.map((p) => p.codigo),
    ['PA-002', 'PA-004', 'PA-012'],
  );
});

test('ADM-01: un recorrido desactivado se oculta y no se puede asignar', async () => {
  const linea = (await nuevaLinea()).body.data;
  const recorrido = (await nuevoRecorrido(linea.id)).body.data;
  await call('PUT', `/admin/red/recorridos/${recorrido.id}`, { body: { activo: false } });
  const publica = (await call('GET', `/lineas/${linea.id}`, { as: null })).body.data;
  assert.equal(publica.recorridos.length, 0);
  const turno = await call('POST', '/admin/turnos', {
    body: {
      conductor_id: 3,
      vehiculo_id: 7,
      inicio_planificado: '2027-08-01T08:00:00Z',
      termino_planificado: '2027-08-01T12:00:00Z',
      viajes: [
        {
          recorrido_id: recorrido.id,
          inicio_planificado: '2027-08-01T08:30:00Z',
          termino_planificado: '2027-08-01T09:30:00Z',
        },
      ],
    },
  });
  assert.equal(turno.status, 400);
});

// ── Paraderos ──

test('ADM-01: crea un paradero con código, nombre y ubicación', async () => {
  const r = await nuevoParadero({ codigo: 'pa-200', nombre: 'Balneario Municipal' });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.codigo, 'PA-200');
  const publicos = (await call('GET', '/paraderos?q=balneario', { as: null })).body.data;
  assert.equal(publicos[0].codigo, 'PA-200');
  const repetido = await nuevoParadero({ codigo: 'PA-200' });
  assert.equal(repetido.status, 409);
  assert.equal((await nuevoParadero({ latitud: 120 })).status, 400);
});

test('ADM-01: un paradero desactivado deja de verse y no se usa en recorridos nuevos', async () => {
  const p = (await nuevoParadero()).body.data;
  await call('PUT', `/admin/red/paraderos/${p.id}`, { body: { activo: false } });
  assert.equal((await call('GET', `/paraderos/${p.id}`, { as: null })).status, 404);
  const linea = (await nuevaLinea()).body.data;
  assert.equal((await nuevoRecorrido(linea.id, { paraderos: [2, p.id] })).status, 400);
});

test('ADM-01: un paradero en uso por un viaje en curso no se mueve ni se desactiva', async () => {
  const p = (await nuevoParadero()).body.data;
  const linea = (await nuevaLinea()).body.data;
  const recorrido = (await nuevoRecorrido(linea.id, { paraderos: [2, p.id] })).body.data;
  const viaje = await viajeEnCurso(recorrido.id);
  const ruta = `/admin/red/paraderos/${p.id}`;

  const mover = await call('PUT', ruta, { body: { latitud: -23.65 } });
  assert.equal(mover.status, 409);
  assert.match(mover.body.error.message, /moverlo/);
  const desactivar = await call('PUT', ruta, { body: { activo: false } });
  assert.equal(desactivar.status, 409);
  // El nombre sí se puede corregir.
  const nombre = await call('PUT', ruta, { body: { nombre: 'Nombre corregido' } });
  assert.equal(nombre.status, 200);
  assert.equal(nombre.body.data.viajes_en_curso, 1);
  assert.equal(nombre.body.data.recorridos[0].id, recorrido.id);

  await viaje.update({ estado: 'finalizado' });
  assert.equal((await call('PUT', ruta, { body: { latitud: -23.65 } })).status, 200);
});

test('ADM-01: el administrador ve también lo desactivado, con cuántos recorridos usan cada paradero', async () => {
  const lista = (await call('GET', '/admin/red/paraderos')).body.data;
  const fueraDeUso = lista.find((p) => p.codigo === 'PA-013');
  assert.equal(fueraDeUso.activo, false);
  assert.ok(lista.find((p) => p.codigo === 'PA-004').total_recorridos >= 4);
  const lineas = (await call('GET', '/admin/red/lineas')).body.data;
  assert.ok(lineas.some((l) => l.codigo === '305')); // desactivada en los datos de ejemplo
});
