const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');
const { cargarDatosEjemplo } = require('../src/database/seeders/datos-ejemplo');
const { tokenPara } = require('./auth-helpers');

let server, base, sequelize, models;
let reloj = new Date('2026-12-01T09:00:00Z');
const avanzarReloj = (segundos) => {
  reloj = new Date(reloj.getTime() + segundos * 1000);
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

// 2 = Carlos y 3 = María (conductores), 5 = Ana (pasajera)
const call = async (method, path, { as = 2, body } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (as) headers.Authorization = `Bearer ${tokenPara(as)}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

// Recorrido 1 (línea 103 ida): PA-001 (id 1) → PA-003 (3) → PA-004 (4) → PA-007 (7) → PA-005 (5)
const PA003 = { latitud: -23.636, longitud: -70.402 };
const PA004 = { latitud: -23.619, longitud: -70.4 };
const PA007 = { latitud: -23.612, longitud: -70.392 };
const entre = (a, b, t) => ({
  latitud: a.latitud + (b.latitud - a.latitud) * t,
  longitud: a.longitud + (b.longitud - a.longitud) * t,
});

let dia = 1;
let pasajeros = 0;
/** Viaje en curso de Carlos en BUS-01; devuelve el viaje y una función para sumar pasajeros. */
async function viajeEnCurso() {
  await models.Viaje.update({ estado: 'finalizado' }, { where: { estado: 'en_curso' } });
  await models.Turno.update({ estado: 'finalizado' }, { where: { estado: 'en_curso' } });
  const fecha = `2027-05-${String(dia++).padStart(2, '0')}`;
  const turno = await models.Turno.create({
    conductor_id: 2,
    vehiculo_id: 1,
    estado: 'en_curso',
    inicio_planificado: `${fecha}T08:00:00.000Z`,
    termino_planificado: `${fecha}T16:00:00.000Z`,
  });
  const viaje = await models.Viaje.create({
    turno_id: turno.id,
    recorrido_id: 1,
    orden_en_turno: 1,
    estado: 'en_curso',
    inicio_planificado: `${fecha}T08:30:00.000Z`,
    termino_planificado: `${fecha}T10:00:00.000Z`,
  });
  return viaje.id;
}

/** Un pasajero nuevo, vinculado al viaje, que pide parada en `paraderoId`. */
async function pedirParada(viajeId, paraderoId) {
  const pasajero = await models.Usuario.create({
    rol: 'pasajero',
    nombre_visible: `Pasajero ${++pasajeros}`,
  });
  await models.Vinculacion.create({
    pasajero_id: pasajero.id,
    viaje_id: viajeId,
    creada_en: reloj.toISOString(),
  });
  const r = await call('POST', `/viajes/${viajeId}/solicitudes-parada`, {
    as: pasajero,
    body: { paradero_id: paraderoId },
  });
  assert.equal(r.status, 201);
  return pasajero;
}

const alertas = (viaje, as = 2) =>
  call('POST', `/conductor/viajes/${viaje}/alertas-parada`, { as });
const posicion = (viaje, punto) =>
  call('POST', `/conductor/viajes/${viaje}/ubicacion`, { body: punto });
const codigos = (lista) => lista.map((g) => [g.paradero.codigo, g.nuevas ?? g.total]);

test('VEH-02: una solicitud nueva llega como aviso con el paradero y la cantidad', async () => {
  const v = await viajeEnCurso();
  await pedirParada(v, 4);
  const r = await alertas(v);
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.body.data.nuevas.map((g) => [g.paradero.codigo, g.paradero.nombre, g.nuevas, g.total]),
    [['PA-004', 'Hospital Regional', 1, 1]],
  );
  assert.deepEqual(codigos(r.body.data.pendientes), [['PA-004', 1]]);
});

test('VEH-02: un aviso ya recibido no se repite, pero el paradero sigue pendiente', async () => {
  const v = await viajeEnCurso();
  await pedirParada(v, 4);
  await alertas(v);
  const otraVez = await alertas(v);
  assert.deepEqual(otraVez.body.data.nuevas, []);
  assert.deepEqual(codigos(otraVez.body.data.pendientes), [['PA-004', 1]]);
});

test('VEH-02: otra solicitud para el mismo paradero actualiza el contador', async () => {
  const v = await viajeEnCurso();
  await pedirParada(v, 4);
  await alertas(v);
  await pedirParada(v, 4);
  const r = await alertas(v);
  assert.deepEqual(
    r.body.data.nuevas.map((g) => [g.paradero.codigo, g.nuevas, g.total]),
    [['PA-004', 1, 2]],
  );
  assert.deepEqual(codigos(r.body.data.pendientes), [['PA-004', 2]]);
});

test('VEH-02: los paraderos pendientes van en el orden del recorrido', async () => {
  const v = await viajeEnCurso();
  await pedirParada(v, 7); // cuarto paradero
  await pedirParada(v, 4); // tercero
  await pedirParada(v, 3); // segundo
  const r = await alertas(v);
  assert.deepEqual(
    r.body.data.pendientes.map((g) => g.paradero.codigo),
    ['PA-003', 'PA-004', 'PA-007'],
  );
  assert.equal(r.body.data.total_pendientes, 3);
});

test('VEH-02: cuando el vehículo supera el paradero, deja de aparecer y no se avisa', async () => {
  const v = await viajeEnCurso();
  await pedirParada(v, 4);
  await pedirParada(v, 7);
  await alertas(v);
  await posicion(v, entre(PA004, PA007, 0.5)); // superó PA-003 y PA-004
  const r = await alertas(v);
  assert.deepEqual(codigos(r.body.data.pendientes), [['PA-007', 1]]);
});

test('VEH-02: al reconectarse llegan solo las nuevas de paraderos futuros, una vez', async () => {
  const v = await viajeEnCurso();
  await pedirParada(v, 3);
  await alertas(v); // la de PA-003 ya se recibió
  // Sin conexión: llegan solicitudes y la micro avanza más allá de PA-004.
  await pedirParada(v, 4);
  await pedirParada(v, 7);
  await posicion(v, entre(PA004, PA007, 0.3));
  // Al volver: solo PA-007 (PA-003 ya se avisó y PA-004 quedó atrás).
  const r = await alertas(v);
  assert.deepEqual(codigos(r.body.data.nuevas), [['PA-007', 1]]);
  assert.deepEqual((await alertas(v)).body.data.nuevas, []);
});

test('VEH-02: solo el conductor del viaje y con el viaje en curso', async () => {
  const v = await viajeEnCurso();
  assert.equal((await alertas(v, 3)).status, 404); // otro conductor
  assert.equal((await alertas(v, 5)).status, 403); // pasajera
  await call('POST', `/conductor/viajes/${v}/finalizar`);
  assert.equal((await alertas(v)).status, 409);
});

test('VIA-03: el pasajero ve si la ubicación de la micro está atrasada', async () => {
  const v = await viajeEnCurso();
  const pasajero = await pedirParada(v, 4);
  const consultar = async () =>
    (await call('GET', `/viajes/${v}/paraderos-disponibles`, { as: pasajero })).body.data
      .ubicacion_vehiculo;

  assert.equal((await consultar()).informacion_atrasada, true); // aún no envía ubicación
  await posicion(v, entre(PA003, PA004, 0.1));
  const alDia = await consultar();
  assert.equal(alDia.informacion_atrasada, false);
  assert.equal(alDia.registrado_en, reloj.toISOString());

  avanzarReloj(45);
  const atrasada = await consultar();
  assert.equal(atrasada.informacion_atrasada, true);
  assert.equal(atrasada.segundos_desde_actualizacion, 45);
  // Se conserva el último estado conocido de la solicitud.
  const mia = (await call('GET', `/viajes/${v}/solicitudes-parada/mia`, { as: pasajero })).body
    .data;
  assert.equal(mia.estado, 'proxima');
});
