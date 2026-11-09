const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { openDatabase } = require('../src/db/connection');
const { seed } = require('../src/db/seed');

let server, base, db;

test.before(async () => {
  db = openDatabase(':memory:');
  seed(db);
  server = createApp({ db }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/admin`;
});

test.after(() => {
  server.close();
  db.close();
});

const call = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

// Turno de ejemplo: día 10 de diciembre, con dos viajes
const dia = (d, hora) => `2026-12-${String(d).padStart(2, '0')}T${hora}:00Z`;
const turno = (over = {}) => ({
  conductor_id: 2,
  vehiculo_id: 1,
  inicio_planificado: dia(10, '08:00'),
  termino_planificado: dia(10, '16:00'),
  viajes: [
    { recorrido_id: 1, inicio_planificado: dia(10, '08:30'), termino_planificado: dia(10, '09:30') },
    { recorrido_id: 2, inicio_planificado: dia(10, '09:45'), termino_planificado: dia(10, '10:45') },
  ],
  ...over,
});

test('ADM-03: crea un turno con viajes ordenados por horario', async () => {
  const invertido = turno();
  invertido.viajes.reverse();
  const { status, body } = await call('POST', '/turnos', invertido);
  assert.equal(status, 201);
  assert.equal(body.estado, 'programado');
  assert.deepEqual(body.viajes.map((v) => [v.orden_en_turno, v.recorrido_id, v.sentido]), [[1, 1, 'ida'], [2, 2, 'vuelta']]);
  assert.equal(body.viajes[0].linea_codigo, '103');
});

test('ADM-03: rechaza turnos superpuestos del mismo conductor', async () => {
  const { status, body } = await call('POST', '/turnos', turno({ vehiculo_id: 2, inicio_planificado: dia(10, '15:00'), termino_planificado: dia(10, '20:00'),
    viajes: [{ recorrido_id: 1, inicio_planificado: dia(10, '16:00'), termino_planificado: dia(10, '17:00') }] }));
  assert.equal(status, 409);
  assert.match(body.error, /conductor/);
});

test('ADM-03: rechaza turnos superpuestos del mismo vehículo', async () => {
  const { status, body } = await call('POST', '/turnos', turno({ conductor_id: 3 }));
  assert.equal(status, 409);
  assert.match(body.error, /vehículo/);
});

test('ADM-03: turnos consecutivos (sin superposición) sí se aceptan', async () => {
  const { status } = await call('POST', '/turnos', turno({
    inicio_planificado: dia(10, '16:00'), termino_planificado: dia(10, '22:00'),
    viajes: [{ recorrido_id: 1, inicio_planificado: dia(10, '17:00'), termino_planificado: dia(10, '18:00') }],
  }));
  assert.equal(status, 201);
});

test('ADM-03: solo conductores habilitados', async () => {
  const { status, body } = await call('POST', '/turnos', turno({ conductor_id: 4, vehiculo_id: 3 }));
  assert.equal(status, 409);
  assert.match(body.error, /habilitados/);
  assert.equal((await call('POST', '/turnos', turno({ conductor_id: 5, vehiculo_id: 3 }))).status, 400); // es pasajero
});

test('ADM-03: solo vehículos operativos (con o sin observaciones)', async () => {
  const con = await call('POST', '/turnos', turno({ conductor_id: 3, vehiculo_id: 8 })); // con observaciones
  assert.equal(con.status, 201);
  for (const v of [9, 10]) {
    const r = await call('POST', '/turnos', turno({ conductor_id: 3, vehiculo_id: v, inicio_planificado: dia(11, '08:00'), termino_planificado: dia(11, '16:00'),
      viajes: [{ recorrido_id: 1, inicio_planificado: dia(11, '09:00'), termino_planificado: dia(11, '10:00') }] }));
    assert.equal(r.status, 409);
  }
});

test('ADM-03: validaciones de datos (fechas, viajes, líneas)', async () => {
  // día 20: libre de otros turnos, para que solo falle la validación que se prueba
  const d = (h) => dia(20, h);
  const base = { conductor_id: 3, vehiculo_id: 4, inicio_planificado: d('08:00'), termino_planificado: d('16:00') };
  const viaje = (rec, i, t) => ({ recorrido_id: rec, inicio_planificado: d(i), termino_planificado: d(t) });
  const ok = [viaje(1, '09:00', '10:00')];
  assert.equal((await call('POST', '/turnos', { ...base, termino_planificado: d('07:00'), viajes: ok })).status, 400);
  assert.equal((await call('POST', '/turnos', { ...base, viajes: [] })).status, 400);
  assert.equal((await call('POST', '/turnos', { ...base, viajes: [viaje(1, '06:00', '07:00')] })).status, 400); // fuera del turno
  assert.equal((await call('POST', '/turnos', { ...base, viajes: [viaje(1, '09:00', '10:00'), viaje(2, '09:30', '10:30')] })).status, 400); // superpuestos
  assert.equal((await call('POST', '/turnos', { ...base, viajes: [viaje(5, '09:00', '10:00')] })).status, 409); // línea 211 suspendida
  assert.equal((await call('POST', '/turnos', { ...base, inicio_planificado: 'mañana', viajes: ok })).status, 400);
  assert.equal((await call('POST', '/turnos', { ...base, viajes: ok })).status, 201); // y con datos correctos sí se crea
});

test('ADM-03: modifica un turno programado (sin chocar consigo mismo)', async () => {
  const creado = await call('POST', '/turnos', turno({ conductor_id: 2, vehiculo_id: 5, inicio_planificado: dia(12, '08:00'), termino_planificado: dia(12, '12:00'),
    viajes: [{ recorrido_id: 3, inicio_planificado: dia(12, '08:30'), termino_planificado: dia(12, '09:30') }] }));
  const edit = await call('PUT', `/turnos/${creado.body.id}`, {
    ...turno({ vehiculo_id: 5, inicio_planificado: dia(12, '08:00'), termino_planificado: dia(12, '14:00') }),
    viajes: [
      { recorrido_id: 3, inicio_planificado: dia(12, '08:30'), termino_planificado: dia(12, '09:30') },
      { recorrido_id: 4, inicio_planificado: dia(12, '10:00'), termino_planificado: dia(12, '11:00') },
    ],
  });
  assert.equal(edit.status, 200);
  assert.equal(edit.body.viajes.length, 2);
  assert.equal(edit.body.termino_planificado, '2026-12-12T14:00:00.000Z');
});

test('ADM-03: no se modifica un turno que ya empezó', async () => {
  const t = await call('POST', '/turnos', turno({ conductor_id: 3, vehiculo_id: 6, inicio_planificado: dia(13, '08:00'), termino_planificado: dia(13, '12:00'),
    viajes: [{ recorrido_id: 1, inicio_planificado: dia(13, '09:00'), termino_planificado: dia(13, '10:00') }] }));
  db.prepare(`UPDATE turnos SET estado='en_curso' WHERE id=?`).run(t.body.id);
  assert.equal((await call('PUT', `/turnos/${t.body.id}`, turno())).status, 409);
});

test('ADM-03: lista por fecha y conductor; turno inexistente da 404', async () => {
  const dia10 = await call('GET', '/turnos?fecha=2026-12-10');
  assert.ok(dia10.body.length >= 3);
  assert.ok(dia10.body.every((t) => t.inicio_planificado.startsWith('2026-12-10')));
  const c3 = await call('GET', '/turnos?conductor_id=3');
  assert.ok(c3.body.every((t) => t.conductor_id === 3));
  assert.equal((await call('GET', '/turnos/9999')).status, 404);
});

test('ADM-03: margen de tolerancia configurable (por defecto 5 min)', async () => {
  assert.equal((await call('GET', '/configuracion')).body.margen_tolerancia_min, 5);
  const ok = await call('PUT', '/configuracion', { margen_tolerancia_min: 10 });
  assert.equal(ok.body.margen_tolerancia_min, 10);
  assert.equal((await call('PUT', '/configuracion', { margen_tolerancia_min: -1 })).status, 400);
  assert.equal((await call('PUT', '/configuracion', { margen_tolerancia_min: 'a' })).status, 400);
});