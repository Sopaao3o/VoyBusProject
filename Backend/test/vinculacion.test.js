const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');
const { cargarDatosEjemplo } = require('../src/database/seeders/datos-ejemplo');
const { normalizarCodigo } = require('../src/modules/vinculacion/vinculacion.service');
const { tokenPara } = require('./auth-helpers');

let server, base, sequelize, models;
const reloj = new Date('2026-12-01T09:00:00Z');

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

// 5 = Ana (pasajera), 2 = Carlos y 3 = María (conductores)
const call = async (method, path, { as = 5, body } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (as) headers.Authorization = `Bearer ${tokenPara(as)}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

let dia = 1;
/** Pone al vehículo en un viaje en curso de la línea 103 (ida), cerrando lo anterior. */
async function viajeEnCurso({ conductor = 2, vehiculo = 1 } = {}) {
  const anteriores = await models.Turno.findAll({
    where: { [Op.or]: [{ vehiculo_id: vehiculo }, { conductor_id: conductor }] },
  });
  const ids = anteriores.map((t) => t.id);
  await models.Viaje.update({ estado: 'finalizado' }, { where: { turno_id: ids } });
  await models.Turno.update({ estado: 'finalizado' }, { where: { id: ids } });
  const fecha = `2027-04-${String(dia++).padStart(2, '0')}`;
  const turno = await models.Turno.create({
    conductor_id: conductor,
    vehiculo_id: vehiculo,
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

/** Termina cualquier vinculación activa de Ana entre pruebas. */
const soltarAna = () =>
  models.Vinculacion.update(
    { terminada_en: reloj.toISOString(), motivo_termino: 'desvinculado' },
    { where: { pasajero_id: 5, terminada_en: null } },
  );

const vincular = (codigo, as = 5) => call('POST', '/vinculacion', { as, body: { codigo } });

test('VIA-01: el código se lee igual escrito a mano o desde el QR', () => {
  assert.equal(normalizarCodigo('bus-01'), 'BUS-01');
  assert.equal(normalizarCodigo('  BUS-01 '), 'BUS-01');
  assert.equal(normalizarCodigo('voybus://vehiculo/BUS-01'), 'BUS-01');
});

test('VIA-01: antes de confirmar se muestra el vehículo, la línea y el sentido', async () => {
  await soltarAna();
  const v = await viajeEnCurso();
  const r = await call('GET', '/vinculacion/vehiculos/bus-01');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.viaje_id, v);
  assert.equal(r.body.data.vehiculo.identificador, 'BUS-01');
  assert.equal(r.body.data.linea.codigo, '103');
  assert.equal(r.body.data.recorrido.sentido, 'ida');
  assert.equal(r.body.data.destino, 'Universidad de Antofagasta');
  // Consultar no vincula.
  assert.equal((await call('GET', '/vinculacion')).body.data, null);
});

test('VIA-01: un código inválido o sin viaje en curso se informa sin vincular', async () => {
  await soltarAna();
  const inexistente = await vincular('BUS-99');
  assert.equal(inexistente.status, 404);
  assert.match(inexistente.body.error.message, /No existe un vehículo con el código BUS-99/);
  // BUS-07 no tiene viaje en curso.
  const sinViaje = await vincular('BUS-07');
  assert.equal(sinViaje.status, 409);
  assert.match(sinViaje.body.error.message, /no está realizando un viaje/);
  assert.equal((await vincular('')).status, 400);
  assert.equal((await call('GET', '/vinculacion')).body.data, null);
});

test('VIA-01: el pasajero se vincula y ve su vinculación activa', async () => {
  await soltarAna();
  const v = await viajeEnCurso();
  const r = await vincular('voybus://vehiculo/BUS-01');
  assert.equal(r.status, 201);
  assert.equal(r.body.data.viaje_id, v);
  assert.match(r.body.meta.mensaje, /BUS-01/);
  const actual = await call('GET', '/vinculacion');
  assert.equal(actual.body.data.viaje_id, v);
  assert.equal(actual.body.data.vehiculo.identificador, 'BUS-01');
  // Volver a escanear la misma micro no crea otra vinculación.
  const otraVez = await vincular('BUS-01');
  assert.equal(otraVez.status, 200);
  assert.equal(
    await models.Vinculacion.count({ where: { pasajero_id: 5, terminada_en: null } }),
    1,
  );
});

test('VIA-01: una sola vinculación a la vez; hay que terminarla para cambiar de vehículo', async () => {
  await soltarAna();
  await viajeEnCurso({ vehiculo: 1 });
  const otro = await viajeEnCurso({ conductor: 3, vehiculo: 2 });
  assert.equal((await vincular('BUS-01')).status, 201);
  const cambio = await vincular('BUS-02');
  assert.equal(cambio.status, 409);
  assert.match(cambio.body.error.message, /Ya estás vinculado a la micro BUS-01/);
  assert.equal((await call('DELETE', '/vinculacion')).status, 200);
  const ahora = await vincular('BUS-02');
  assert.equal(ahora.status, 201);
  assert.equal(ahora.body.data.viaje_id, otro);
});

test('VIA-01: un invitado también puede vincularse', async () => {
  await viajeEnCurso();
  const invitado = await models.Usuario.create({
    rol: 'pasajero',
    nombre_visible: 'Invitado',
    tipo_acceso: 'invitado',
  });
  assert.equal((await vincular('BUS-01', invitado)).status, 201);
});

test('VIA-01: solo pasajeros', async () => {
  assert.equal((await call('GET', '/vinculacion', { as: null })).status, 401);
  assert.equal(
    (await call('POST', '/vinculacion', { as: 2, body: { codigo: 'BUS-01' } })).status,
    403,
  );
});

test('VIA-02: sin vincularse no se eligen paraderos ni se pide parada', async () => {
  await soltarAna();
  const v = await viajeEnCurso();
  const lista = await call('GET', `/viajes/${v}/paraderos-disponibles`);
  assert.equal(lista.status, 403);
  assert.equal(lista.body.error.code, 'NO_VINCULADO');
  const pedir = await call('POST', `/viajes/${v}/solicitudes-parada`, { body: { paradero_id: 4 } });
  assert.equal(pedir.status, 403);
  await vincular('BUS-01');
  assert.equal((await call('GET', `/viajes/${v}/paraderos-disponibles`)).status, 200);
});

test('VIA-01: al desvincularse se cierra su solicitud de parada pendiente', async () => {
  await soltarAna();
  const v = await viajeEnCurso();
  await vincular('BUS-01');
  await call('POST', `/viajes/${v}/solicitudes-parada`, { body: { paradero_id: 4 } });
  const r = await call('DELETE', '/vinculacion');
  assert.equal(r.status, 200);
  const mia = (await call('GET', `/viajes/${v}/solicitudes-parada/mia`)).body.data;
  assert.equal(mia.estado, 'cerrada');
  assert.equal(mia.motivo_cierre, 'pasajero_desvinculado');
  assert.match(mia.motivo_cierre_texto, /desvinculaste/);
  assert.equal((await call('DELETE', '/vinculacion')).status, 404); // ya no hay vinculación
});

test('VIA-01: la vinculación termina cuando el conductor finaliza el viaje', async () => {
  await soltarAna();
  const v = await viajeEnCurso();
  await vincular('BUS-01');
  await call('POST', `/conductor/viajes/${v}/finalizar`, { as: 2 });
  assert.equal((await call('GET', '/vinculacion')).body.data, null);
  const guardada = await models.Vinculacion.findOne({
    where: { pasajero_id: 5, viaje_id: v },
  });
  assert.equal(guardada.motivo_termino, 'viaje_finalizado');
  assert.ok(guardada.terminada_en);
});

test('VIA-01: si el viaje terminó de otra forma, la vinculación se cierra al consultarla', async () => {
  await soltarAna();
  const v = await viajeEnCurso();
  await vincular('BUS-01');
  await models.Viaje.update({ estado: 'finalizado' }, { where: { id: v } });
  assert.equal((await call('GET', '/vinculacion')).body.data, null);
  // Y ya puede vincularse a otra micro.
  await viajeEnCurso({ conductor: 3, vehiculo: 2 });
  assert.equal((await vincular('BUS-02')).status, 201);
});

test('VIA-01: la base no admite dos vinculaciones activas del mismo pasajero', async () => {
  await soltarAna();
  const v = await viajeEnCurso();
  await models.Vinculacion.create({ pasajero_id: 5, viaje_id: v, creada_en: reloj.toISOString() });
  await assert.rejects(
    models.Vinculacion.create({ pasajero_id: 5, viaje_id: v, creada_en: reloj.toISOString() }),
  );
});
