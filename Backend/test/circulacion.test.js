const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');
const { cargarDatosEjemplo } = require('../src/database/seeders/datos-ejemplo');
const { createUbicacionService } = require('../src/modules/ubicacion/ubicacion.service');
const { createSimuladorFlota } = require('../src/modules/ubicacion/simulador-flota');
const { tokenPara } = require('./auth-helpers');

let server, base, sequelize, models, flota;
let reloj = new Date('2026-12-01T09:00:00Z');
const avanzarReloj = (segundos) => {
  reloj = new Date(reloj.getTime() + segundos * 1000);
};

test.before(async () => {
  sequelize = createDatabase(':memory:');
  await createMigrator(sequelize).up();
  models = initModels(sequelize);
  await cargarDatosEjemplo(models);
  const ubicacion = createUbicacionService(models, {
    ahora: () => reloj,
    permitirSimulacion: true,
  });
  flota = createSimuladorFlota(models, ubicacion, { ahora: () => reloj });
  server = createApp({ models, ahora: () => reloj, simulador: true, flota }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

test.after(async () => {
  await flota.detener();
  server.close();
  await sequelize.close();
});

// 1 = admin, 2 = Carlos y 3 = María (conductores), 5 = Ana. `as: null` = sin sesión.
const call = async (method, path, { as = null, body } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (as) headers.Authorization = `Bearer ${tokenPara(as)}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

// Recorrido 1 = línea 103 ida (PA-001 → PA-003 → PA-004 → PA-007 → PA-005).
// Recorrido 3 = línea 107 ida (PA-002 → PA-001 → PA-012 → PA-004 → PA-009).
const PA001 = { latitud: -23.6345, longitud: -70.3975 };
const PA003 = { latitud: -23.636, longitud: -70.402 };
const PA004 = { latitud: -23.619, longitud: -70.4 };
const entre = (a, b, t) => ({
  latitud: a.latitud + (b.latitud - a.latitud) * t,
  longitud: a.longitud + (b.longitud - a.longitud) * t,
});

let dia = 1;
/** Deja a un conductor con un viaje en curso y sin otros (los de pruebas anteriores se cierran). */
async function viajeEnCurso({ conductor = 2, vehiculo = 1, recorrido = 1 } = {}) {
  await models.Viaje.update({ estado: 'finalizado' }, { where: { estado: 'en_curso' } });
  await models.Turno.update(
    { estado: 'finalizado' },
    { where: { conductor_id: conductor, estado: 'en_curso' } },
  );
  const fecha = `2027-03-${String(dia++).padStart(2, '0')}`;
  const turno = await models.Turno.create({
    conductor_id: conductor,
    vehiculo_id: vehiculo,
    estado: 'en_curso',
    inicio_planificado: `${fecha}T08:00:00.000Z`,
    termino_planificado: `${fecha}T16:00:00.000Z`,
  });
  const viaje = await models.Viaje.create({
    turno_id: turno.id,
    recorrido_id: recorrido,
    orden_en_turno: 1,
    estado: 'en_curso',
    inicio_planificado: `${fecha}T08:30:00.000Z`,
    termino_planificado: `${fecha}T10:00:00.000Z`,
  });
  return { viaje: viaje.id, turno: turno.id };
}

const posicion = (viaje, punto, as = 2) =>
  call('POST', `/conductor/viajes/${viaje}/ubicacion`, { as, body: punto });

// ── RED-03: visualización de vehículos ──

test('RED-03: sin iniciar sesión se ven los vehículos en circulación con su última ubicación', async () => {
  const { viaje } = await viajeEnCurso();
  await posicion(viaje, entre(PA001, PA003, 0.5));
  const r = await call('GET', '/vehiculos');
  assert.equal(r.status, 200);
  const v = r.body.data.find((x) => x.viaje_id === viaje);
  assert.equal(v.vehiculo.identificador, 'BUS-01');
  assert.equal(v.linea.codigo, '103');
  assert.equal(v.recorrido.sentido, 'ida');
  assert.equal(v.recorrido.destino, 'Universidad de Antofagasta');
  assert.ok(Math.abs(v.ultima_ubicacion.latitud - entre(PA001, PA003, 0.5).latitud) < 1e-9);
  assert.equal(v.ultima_ubicacion.registrado_en, reloj.toISOString());
  assert.equal(v.ubicacion_atrasada, false);
  assert.equal(v.siguiente_paradero.codigo, 'PA-003');
});

test('RED-03: al elegir una línea se muestran solo sus vehículos con viaje activo', async () => {
  const { viaje } = await viajeEnCurso(); // línea 103 (id 1)
  const linea107 = await call('GET', '/vehiculos?linea_id=2');
  assert.ok(!linea107.body.data.some((x) => x.viaje_id === viaje));
  const linea103 = await call('GET', '/vehiculos?linea_id=1');
  assert.ok(linea103.body.data.some((x) => x.viaje_id === viaje));
  assert.equal((await call('GET', '/vehiculos?linea_id=abc')).status, 400);
});

test('RED-03: los vehículos con viajes finalizados dejan de mostrarse', async () => {
  const { viaje } = await viajeEnCurso();
  await posicion(viaje, PA001);
  await call('POST', `/conductor/viajes/${viaje}/finalizar`, { as: 2 });
  const r = await call('GET', '/vehiculos');
  assert.ok(!r.body.data.some((x) => x.viaje_id === viaje));
});

test('RED-03 y ADM-04: una ubicación vieja se marca atrasada y conserva su hora', async () => {
  const { viaje } = await viajeEnCurso();
  await posicion(viaje, PA001);
  const enviadaA = reloj.toISOString();
  avanzarReloj(45);
  const v = (await call('GET', '/vehiculos')).body.data.find((x) => x.viaje_id === viaje);
  assert.equal(v.ubicacion_atrasada, true);
  assert.equal(v.segundos_desde_actualizacion, 45);
  assert.equal(v.ultima_ubicacion.registrado_en, enviadaA);
  // Sin señal no se da por terminado el viaje: sigue en circulación.
  const viajeGuardado = await models.Viaje.findByPk(viaje);
  assert.equal(viajeGuardado.estado, 'en_curso');
});

test('RED-03: un viaje que todavía no envía ubicación aparece sin posición y atrasado', async () => {
  const { viaje } = await viajeEnCurso();
  const v = (await call('GET', '/vehiculos')).body.data.find((x) => x.viaje_id === viaje);
  assert.equal(v.ultima_ubicacion, null);
  assert.equal(v.ubicacion_atrasada, true);
});

// ── Paraderos cercanos y micros que se acercan ──

test('Inicio: entrega el paradero más cercano con su distancia', async () => {
  const cerca = { latitud: PA004.latitud + 0.001, longitud: PA004.longitud };
  const r = await call(
    'GET',
    `/paraderos/cercanos?latitud=${cerca.latitud}&longitud=${cerca.longitud}`,
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.data[0].codigo, 'PA-004');
  assert.ok(r.body.data[0].distancia_m > 90 && r.body.data[0].distancia_m < 130);
  const lejos = await call('GET', '/paraderos/cercanos?latitud=-23.3&longitud=-70.1');
  assert.deepEqual(lejos.body.data, []);
  assert.equal((await call('GET', '/paraderos/cercanos?latitud=-23.6')).status, 400);
});

test('RED-03: las micros que se acercan a un paradero, con paraderos y metros que faltan', async () => {
  const { viaje } = await viajeEnCurso();
  await posicion(viaje, entre(PA001, PA003, 0.5)); // superó PA-001; viene hacia PA-003 y PA-004
  const r = await call('GET', '/paraderos/4/proximas'); // PA-004, tercer paradero
  const v = r.body.data.find((x) => x.viaje_id === viaje);
  assert.equal(v.paraderos_antes, 1); // le falta pasar por PA-003
  assert.ok(v.distancia_m > 2000 && v.distancia_m < 2600, `distancia ${v.distancia_m}`);

  await posicion(viaje, entre(PA003, PA004, 0.5));
  const despues = (await call('GET', '/paraderos/4/proximas')).body.data.find(
    (x) => x.viaje_id === viaje,
  );
  assert.equal(despues.paraderos_antes, 0); // es su próximo paradero

  await posicion(viaje, entre(PA004, { latitud: -23.612, longitud: -70.392 }, 0.5));
  const yaPaso = (await call('GET', '/paraderos/4/proximas')).body.data;
  assert.ok(!yaPaso.some((x) => x.viaje_id === viaje)); // ya lo superó
  assert.equal((await call('GET', '/paraderos/999/proximas')).status, 404);
});

// ── ADM-04: monitoreo de la operación ──

test('ADM-04: solo el administrador ve el monitoreo', async () => {
  assert.equal((await call('GET', '/admin/monitoreo')).status, 401);
  assert.equal((await call('GET', '/admin/monitoreo', { as: 2 })).status, 403);
  assert.equal((await call('GET', '/admin/monitoreo', { as: 1 })).status, 200);
});

test('ADM-04: conductor, turno, ubicación, solicitudes pendientes, estado e incidencias', async () => {
  const { viaje, turno } = await viajeEnCurso();
  await posicion(viaje, entre(PA001, PA003, 0.5));
  await call('POST', `/viajes/${viaje}/solicitudes-parada`, { as: 5, body: { paradero_id: 4 } });
  await call('POST', `/conductor/turnos/${turno}/incidencias`, {
    as: 2,
    body: { tipo: 'recorrido', descripcion: 'Desvío por obras' },
  });

  const r = await call('GET', '/admin/monitoreo', { as: 1 });
  const v = r.body.data.vehiculos.find((x) => x.viaje_id === viaje);
  assert.equal(v.conductor.nombre, 'Carlos Rojas');
  assert.equal(v.turno.id, turno);
  assert.equal(v.linea.codigo, '103');
  assert.equal(v.recorrido.sentido, 'ida');
  assert.ok(v.ultima_ubicacion);
  assert.equal(v.estado_vehiculo, 'operativo');
  assert.deepEqual(
    v.solicitudes_pendientes.map((s) => [s.paradero.codigo, s.total]),
    [['PA-004', 1]],
  );
  assert.equal(v.incidencias[0].descripcion, 'Desvío por obras');
  assert.ok(r.body.data.resumen.en_circulacion >= 1);
  assert.ok(r.body.data.resumen.solicitudes_pendientes >= 1);
});

// ── Simulador de flota (solo desarrollo) ──

test('Simulador de flota: pone 4 micros en circulación, las mueve y las retira', async () => {
  await models.Viaje.update({ estado: 'finalizado' }, { where: { estado: 'en_curso' } });
  const estado = await flota.iniciar({ automatico: false });
  assert.equal(estado.vehiculos.length, 4);

  const antes = (await call('GET', '/vehiculos')).body.data;
  assert.equal(antes.length, 4);
  assert.deepEqual(antes.map((v) => v.vehiculo.identificador).sort(), [
    'BUS-02',
    'BUS-03',
    'BUS-04',
    'BUS-05',
  ]);
  const bus2 = antes.find((v) => v.vehiculo.identificador === 'BUS-02');

  avanzarReloj(5);
  await flota.paso();
  const despues = (await call('GET', '/vehiculos')).body.data;
  const bus2Despues = despues.find((v) => v.vehiculo.identificador === 'BUS-02');
  assert.notDeepEqual(bus2Despues.ultima_ubicacion, bus2.ultima_ubicacion); // se movió

  // Los conductores de demostración no tienen contraseña: no se puede entrar con ellos.
  const demo = await models.Usuario.findOne({ where: { correo: 'demo.conductor1@voybus.cl' } });
  assert.equal(demo.password_hash, null);

  await flota.detener();
  assert.deepEqual((await call('GET', '/vehiculos')).body.data, []);
});

test('Simulador de flota: al llegar al final del recorrido cierra el viaje y vuelve', async () => {
  await flota.iniciar({ automatico: false });
  const primero = flota.estado().vehiculos.find((v) => v.identificador === 'BUS-02').viaje_id;
  await flota.paso(60 * 60 * 1000); // una hora de una vez: llega al final
  const segundo = flota.estado().vehiculos.find((v) => v.identificador === 'BUS-02').viaje_id;
  assert.notEqual(segundo, primero);
  assert.equal((await models.Viaje.findByPk(primero)).estado, 'finalizado');
  await flota.detener();
});

test('Simulador de flota: limpia micros que quedaron circulando de una simulación anterior', async () => {
  await flota.iniciar({ automatico: false });
  // Simula que el servidor se apagó sin detener la simulación: un simulador nuevo no las conoce.
  const otro = createSimuladorFlota(models, createUbicacionService(models), { ahora: () => reloj });
  assert.equal(await otro.limpiarRestos(), 4);
  assert.deepEqual((await call('GET', '/vehiculos')).body.data, []);
  await flota.detener();
});

test('Simulador de flota: sus rutas existen solo con el simulador activo', async () => {
  assert.equal((await call('GET', '/simulador/flota')).status, 200);
  const sinSimulador = createApp({ models }).listen(0);
  await new Promise((r) => sinSimulador.once('listening', r));
  const res = await fetch(`http://127.0.0.1:${sinSimulador.address().port}/api/v1/simulador/flota`);
  assert.equal(res.status, 404);
  sinSimulador.close();
});
