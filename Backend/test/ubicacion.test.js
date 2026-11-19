const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');
const { cargarDatosEjemplo } = require('../src/database/seeders/datos-ejemplo');
const { calcularAvance, distancia } = require('../src/modules/ubicacion/geo');
const { createUbicacionService } = require('../src/modules/ubicacion/ubicacion.service');
const { tokenPara } = require('./auth-helpers');

let server, base, sequelize, models;
const reloj = new Date('2026-12-01T09:00:00Z');

test.before(async () => {
  sequelize = createDatabase(':memory:');
  await createMigrator(sequelize).up();
  models = initModels(sequelize);
  await cargarDatosEjemplo(models);
  server = createApp({ models, ahora: () => reloj, simulador: true }).listen(0);
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

// Recorrido 1 (línea 103, ida): PA-001 → PA-003 → PA-004 → PA-007 → PA-005.
const PA001 = { latitud: -23.6345, longitud: -70.3975 };
const PA003 = { latitud: -23.636, longitud: -70.402 };
const PA004 = { latitud: -23.619, longitud: -70.4 };
const PA007 = { latitud: -23.612, longitud: -70.392 };
/** Un punto entre dos paraderos: `t` = 0 es el primero y 1 el segundo. */
const entre = (a, b, t) => ({
  latitud: a.latitud + (b.latitud - a.latitud) * t,
  longitud: a.longitud + (b.longitud - a.longitud) * t,
});

let diaSiguiente = 1;
async function viajeEnCurso({ conductor = 2, estado = 'en_curso' } = {}) {
  await models.Turno.update(
    { estado: 'finalizado' },
    { where: { conductor_id: conductor, estado: 'en_curso' } },
  );
  const dia = `2027-02-${String(diaSiguiente++).padStart(2, '0')}`;
  const turno = await models.Turno.create({
    conductor_id: conductor,
    vehiculo_id: conductor === 2 ? 1 : 2,
    estado: 'en_curso',
    inicio_planificado: `${dia}T08:00:00.000Z`,
    termino_planificado: `${dia}T16:00:00.000Z`,
  });
  const viaje = await models.Viaje.create({
    turno_id: turno.id,
    recorrido_id: 1,
    orden_en_turno: 1,
    estado,
    inicio_planificado: `${dia}T08:30:00.000Z`,
    termino_planificado: `${dia}T10:00:00.000Z`,
  });
  return viaje.id;
}

const enviar = (viaje, punto, extra = {}, as = 2) =>
  call('POST', `/conductor/viajes/${viaje}/ubicacion`, { as, body: { ...punto, ...extra } });

// ── El cálculo del avance, sin base de datos ──

const PARADEROS = [
  { orden: 1, ...PA001 },
  { orden: 2, ...PA003 },
  { orden: 3, ...PA004 },
  { orden: 4, ...PA007 },
];

test('VEH-01: la distancia entre dos paraderos se calcula en metros', () => {
  const metros = distancia(PA001, PA003);
  assert.ok(metros > 450 && metros < 550, `se esperaban unos 500 m y fueron ${metros}`);
});

test('VEH-01: un paradero queda superado cuando el vehículo pasa más allá de él', () => {
  // Saliendo del primer paradero: lo superó.
  assert.equal(calcularAvance(PARADEROS, 0, entre(PA001, PA003, 0.5)).ultimoSuperado, 1);
  // Justo encima del segundo: todavía no lo supera (podría estar deteniéndose ahí).
  assert.equal(calcularAvance(PARADEROS, 1, PA003).ultimoSuperado, 1);
  // Un tercio del camino hacia el tercero: superó el segundo.
  assert.equal(calcularAvance(PARADEROS, 1, entre(PA003, PA004, 0.33)).ultimoSuperado, 2);
});

test('VEH-01: el avance nunca retrocede', () => {
  assert.equal(calcularAvance(PARADEROS, 2, PA001).ultimoSuperado, 2);
});

test('VEH-01: una posición lejos del recorrido no cambia el avance', () => {
  const lejos = { latitud: -23.7, longitud: -70.3 };
  const avance = calcularAvance(PARADEROS, 1, lejos);
  assert.equal(avance.ultimoSuperado, 1);
  assert.ok(avance.lejania > 250);
});

test('VEH-01: el último paradero no se da por superado (se cierra al finalizar el viaje)', () => {
  const masAlla = entre(PA004, PA007, 1.1); // unos 110 m después del último
  assert.equal(calcularAvance(PARADEROS, 2, masAlla).ultimoSuperado, 3);
});

// ── La ruta del conductor ──

test('VEH-01: el conductor comparte su ubicación y se guarda con su precisión y origen', async () => {
  const v = await viajeEnCurso();
  const r = await enviar(v, entre(PA001, PA003, 0.5), { precision_m: 8 });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.ultimo_orden_superado, 1);
  assert.equal(r.body.data.siguiente_paradero.codigo, 'PA-003');
  assert.equal(r.body.data.origen, 'gps');
  const guardada = await models.UbicacionVehiculo.findOne({
    where: { viaje_id: v },
    order: [['id', 'DESC']],
  });
  assert.equal(guardada.precision_m, 8);
  assert.equal(guardada.origen, 'gps');
  assert.equal(guardada.registrado_en, reloj.toISOString());
});

test('VEH-01: solo el conductor del viaje y solo con el viaje en curso', async () => {
  const v = await viajeEnCurso();
  assert.equal((await enviar(v, PA001, {}, 5)).status, 403); // pasajera
  assert.equal((await enviar(v, PA001, {}, 3)).status, 404); // viaje de otro conductor
  const programado = await viajeEnCurso({ estado: 'programado' });
  const r = await enviar(programado, PA001);
  assert.equal(r.status, 409);
  assert.match(r.body.error.message, /viaje en curso/);
  assert.equal((await enviar(999999, PA001)).status, 404);
});

test('VEH-01: valida las coordenadas recibidas', async () => {
  const v = await viajeEnCurso();
  assert.equal((await enviar(v, { latitud: 200, longitud: -70.4 })).status, 400);
  assert.equal((await enviar(v, { latitud: -23.6 })).status, 400);
  assert.equal((await enviar(v, { latitud: 'x', longitud: -70.4 })).status, 400);
  assert.equal((await enviar(v, PA001, { precision_m: -3 })).status, 400);
  assert.equal((await enviar(v, PA001, { origen: 'satelite' })).status, 400);
});

test('VEH-01: con mala precisión la posición se guarda, pero no hace avanzar el viaje', async () => {
  const v = await viajeEnCurso();
  const r = await enviar(v, entre(PA003, PA004, 0.5), { precision_m: 500 });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.ultimo_orden_superado, 0);
  assert.equal(r.body.data.precision_insuficiente, true);
});

test('VEH-01: avisa cuando el vehículo está fuera del recorrido', async () => {
  const v = await viajeEnCurso();
  const r = await enviar(v, { latitud: -23.7, longitud: -70.3 });
  assert.equal(r.body.data.fuera_de_recorrido, true);
  assert.equal(r.body.data.ultimo_orden_superado, 0);
});

test('VIA-03: con el GPS, la solicitud pasa sola de enviada a próxima y a cerrada', async () => {
  const v = await viajeEnCurso();
  const pedida = await call('POST', `/viajes/${v}/solicitudes-parada`, {
    as: 5,
    body: { paradero_id: 4 }, // PA-004, tercer paradero
  });
  assert.equal(pedida.body.data.estado, 'enviada');
  const mia = async () =>
    (await call('GET', `/viajes/${v}/solicitudes-parada/mia`, { as: 5 })).body.data;

  await enviar(v, entre(PA001, PA003, 0.5));
  assert.equal((await mia()).estado, 'enviada');

  await enviar(v, entre(PA003, PA004, 0.4));
  assert.equal((await mia()).estado, 'proxima');

  const r = await enviar(v, entre(PA004, PA007, 0.5));
  assert.equal(r.body.data.solicitudes_cerradas, 1);
  const cerrada = await mia();
  assert.equal(cerrada.estado, 'cerrada');
  assert.equal(cerrada.motivo_cierre, 'paradero_superado');
});

test('VEH-01: las posiciones simuladas solo se aceptan si el simulador está activo', async () => {
  const v = await viajeEnCurso();
  assert.equal((await enviar(v, PA001, { origen: 'simulador' })).status, 201);
  const sinSimulador = createUbicacionService(models, { ahora: () => reloj });
  await assert.rejects(
    sinSimulador.registrar(2, v, { ...PA001, origen: 'simulador' }),
    (e) => e.status === 400,
  );
});
