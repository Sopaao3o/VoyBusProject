const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');
const { cargarDatosEjemplo } = require('../src/database/seeders/datos-ejemplo');

let server, base, sequelize, models;
let reloj = new Date('2026-12-01T09:00:00Z');

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

// 5 = Ana (pasajera), 2 = Carlos y 3 = María (conductores), 1 = admin
const call = async (method, path, { as = 5, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(as ? { 'x-user-id': String(as) } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

/** Un viaje en curso del recorrido 1 (línea 103 ida): paraderos 1, 3, 4, 7, 5 en ese orden. */
async function viajeEnCurso({ conductor = 2, vehiculo = 1, estado = 'en_curso' } = {}) {
  await models.Turno.update({ estado: 'finalizado' }, { where: { conductor_id: conductor, estado: 'en_curso' } });
  const dia = `2027-01-${String(10 + Math.floor(Math.random() * 18)).padStart(2, '0')}`;
  const turno = await models.Turno.create({
    conductor_id: conductor, vehiculo_id: vehiculo, estado: 'en_curso',
    inicio_planificado: `${dia}T08:00:00.000Z`, termino_planificado: `${dia}T16:00:00.000Z`,
  });
  const viaje = await models.Viaje.create({
    turno_id: turno.id, recorrido_id: 1, orden_en_turno: 1, estado,
    inicio_planificado: `${dia}T08:30:00.000Z`, termino_planificado: `${dia}T10:00:00.000Z`,
  });
  return viaje.id;
}

const solicitar = (viaje, paradero, as = 5) => call('POST', `/viajes/${viaje}/solicitudes-parada`, { as, body: { paradero_id: paradero } });

test('VIA-02: muestra los paraderos del recorrido, en orden, con nombre y código', async () => {
  const v = await viajeEnCurso();
  const { status, body } = await call('GET', `/viajes/${v}/paraderos-disponibles`);
  assert.equal(status, 200);
  assert.equal(body.data.viaje.linea_codigo, '103');
  assert.deepEqual(body.data.paraderos.map((p) => [p.orden, p.codigo]), [[1, 'PA-001'], [2, 'PA-003'], [3, 'PA-004'], [4, 'PA-007'], [5, 'PA-005']]);
  assert.ok(body.data.paraderos[0].nombre);
  assert.equal(body.data.mi_solicitud, null);
});

test('VIA-02: solo pasajeros, y solo en viajes que existen y están en curso', async () => {
  const v = await viajeEnCurso();
  assert.equal((await call('GET', `/viajes/${v}/paraderos-disponibles`, { as: null })).status, 401);
  assert.equal((await call('GET', `/viajes/${v}/paraderos-disponibles`, { as: 2 })).status, 403); // conductor
  assert.equal((await call('GET', '/viajes/99999/paraderos-disponibles')).status, 404);
  const programado = await viajeEnCurso({ conductor: 3, vehiculo: 2, estado: 'programado' });
  const r = await call('GET', `/viajes/${programado}/paraderos-disponibles`);
  assert.equal(r.status, 409);
  assert.match(r.body.error.message, /no está en curso/);
  assert.equal((await solicitar(programado, 3)).status, 409);
});

test('VIA-02: "Solicitar parada" guarda el aviso y confirma el envío', async () => {
  const v = await viajeEnCurso();
  const r = await solicitar(v, 4); // PA-004, orden 3
  assert.equal(r.status, 201);
  assert.equal(r.body.data.estado, 'enviada');
  assert.equal(r.body.data.paradero.codigo, 'PA-004');
  assert.equal(r.body.data.paradero.orden, 3);
  assert.match(r.body.meta.mensaje, /enviada/);
  const mia = await call('GET', `/viajes/${v}/solicitudes-parada/mia`);
  assert.equal(mia.body.data.id, r.body.data.id);
  assert.equal((await call('GET', `/viajes/${v}/paraderos-disponibles`)).body.data.mi_solicitud.estado, 'enviada');
});

test('VIA-02: una sola solicitud pendiente por pasajero y viaje, sin duplicados', async () => {
  const v = await viajeEnCurso();
  assert.equal((await solicitar(v, 4)).status, 201);
  const otra = await solicitar(v, 7);
  assert.equal(otra.status, 409);
  assert.match(otra.body.error.message, /pendiente/);
  assert.equal(await models.SolicitudParada.count({ where: { viaje_id: v } }), 1);
});

test('VIA-02: validaciones del paradero elegido', async () => {
  const v = await viajeEnCurso();
  assert.equal((await solicitar(v, 2)).status, 400); // PA-002 no está en este recorrido
  assert.equal((await call('POST', `/viajes/${v}/solicitudes-parada`, { body: { paradero_id: 'abc' } })).status, 400);
  assert.equal((await call('POST', `/viajes/${v}/solicitudes-parada`, { body: {} })).status, 400);
});

test('VIA-02: el simulador avanza el vehículo; solo se eligen paraderos que no superó', async () => {
  const v = await viajeEnCurso();
  assert.equal((await call('POST', `/simulador/viajes/${v}/avanzar`, { as: null })).status, 200); // supera PA-001
  const av = await call('POST', `/simulador/viajes/${v}/avanzar`, { as: null }); // supera PA-003
  assert.equal(av.body.data.ultimo_orden_superado, 2);
  assert.equal(av.body.data.paradero_superado.codigo, 'PA-003');

  const lista = await call('GET', `/viajes/${v}/paraderos-disponibles`);
  assert.deepEqual(lista.body.data.paraderos.map((p) => p.codigo), ['PA-004', 'PA-007', 'PA-005']);
  assert.equal((await solicitar(v, 3)).status, 409); // PA-003 ya fue superado
  assert.equal(await models.UbicacionVehiculo.count({ where: { viaje_id: v } }), 2);
});

test('VIA-02: el estado pasa de enviada a próxima y a cerrada, con el motivo', async () => {
  const v = await viajeEnCurso();
  const s = await solicitar(v, 7); // PA-007, orden 4
  assert.equal(s.body.data.estado, 'enviada');
  const paso = () => call('POST', `/simulador/viajes/${v}/avanzar`, { as: null });
  await paso(); await paso(); // superó el orden 2
  assert.equal((await call('GET', `/viajes/${v}/solicitudes-parada/mia`)).body.data.estado, 'enviada');
  await paso(); // superó el orden 3 → el siguiente es el 4
  assert.equal((await call('GET', `/viajes/${v}/solicitudes-parada/mia`)).body.data.estado, 'proxima');
  const cierre = await paso(); // superó el orden 4
  assert.equal(cierre.body.data.solicitudes_cerradas, 1);
  const mia = (await call('GET', `/viajes/${v}/solicitudes-parada/mia`)).body.data;
  assert.equal(mia.estado, 'cerrada');
  assert.equal(mia.motivo_cierre, 'paradero_superado');
  assert.match(mia.motivo_cierre_texto, /superó tu paradero/);
  assert.ok(mia.cerrada_en);
  // con la solicitud cerrada, ya puede pedir otra parada más adelante
  assert.equal((await solicitar(v, 5)).status, 201);
});

test('VIA-02: pedir el siguiente paradero queda directamente como próxima', async () => {
  const v = await viajeEnCurso();
  await call('POST', `/simulador/viajes/${v}/avanzar`, { as: null }); // superó el orden 1
  assert.equal((await solicitar(v, 3)).body.data.estado, 'proxima'); // PA-003 es el orden 2
});

test('VIA-02: las solicitudes de un mismo paradero se agrupan para el conductor y cada registro se conserva', async () => {
  const v = await viajeEnCurso({ conductor: 3, vehiculo: 2 });
  const extra = await models.Usuario.bulkCreate([
    { rol: 'pasajero', nombre_visible: 'Pedro Invitado', tipo_acceso: 'invitado' },
    { rol: 'pasajero', nombre_visible: 'Sofía Rivas', alias: 'sofia' },
  ]);
  await solicitar(v, 7, 5);
  await solicitar(v, 7, extra[0].id);
  await solicitar(v, 4, extra[1].id);
  const r = await call('GET', `/conductor/viajes/${v}/solicitudes-parada`, { as: 3 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data.map((g) => [g.paradero.codigo, g.paradero.orden, g.total]), [['PA-004', 3, 1], ['PA-007', 4, 2]]);
  assert.deepEqual(r.body.data[1].solicitudes.map((s) => s.pasajero_nombre), ['Ana Pasajera', 'Pedro Invitado']);
  assert.equal(r.body.meta.total_solicitudes, 3);
  // otro conductor no ve las solicitudes de este viaje
  assert.equal((await call('GET', `/conductor/viajes/${v}/solicitudes-parada`, { as: 2 })).status, 404);
});

test('VIA-02: al finalizar el viaje las solicitudes abiertas se cierran con ese motivo', async () => {
  const v = await viajeEnCurso();
  await solicitar(v, 5);
  const fin = await call('POST', `/conductor/viajes/${v}/finalizar`, { as: 2 });
  assert.equal(fin.status, 200);
  const mia = (await call('GET', `/viajes/${v}/solicitudes-parada/mia`)).body.data;
  assert.equal(mia.estado, 'cerrada');
  assert.equal(mia.motivo_cierre, 'viaje_finalizado');
  assert.match(mia.motivo_cierre_texto, /finalizó/);
});

test('VIA-02: el simulador se detiene en el último paradero y solo existe si se activa', async () => {
  const v = await viajeEnCurso();
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', `/simulador/viajes/${v}/avanzar`, { as: null })).status, 200);
  assert.equal((await call('POST', `/simulador/viajes/${v}/avanzar`, { as: null })).status, 409);

  const sinSimulador = createApp({ models }).listen(0);
  await new Promise((r) => sinSimulador.once('listening', r));
  const res = await fetch(`http://127.0.0.1:${sinSimulador.address().port}/api/v1/simulador/viajes/${v}/avanzar`, { method: 'POST' });
  sinSimulador.close();
  assert.equal(res.status, 404);
});