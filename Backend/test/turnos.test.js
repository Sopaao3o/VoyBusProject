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
  base = `http://127.0.0.1:${server.address().port}/api/v1/admin`;
});

test.after(async () => {
  server.close();
  await sequelize.close();
});

const call = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenPara(1)}`, // administrador de ejemplo
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

test('Las rutas de administración exigen un JWT de administrador', async () => {
  const sinToken = await fetch(base + '/turnos');
  assert.equal(sinToken.status, 401);
  assert.equal((await sinToken.json()).error.code, 'NO_AUTENTICADO');

  const malFormado = await fetch(base + '/turnos', {
    headers: { Authorization: 'Basic abc' },
  });
  assert.equal(malFormado.status, 401);
  assert.equal((await malFormado.json()).error.code, 'NO_AUTENTICADO');

  const pasajero = await fetch(base + '/turnos', {
    headers: { Authorization: `Bearer ${tokenPara(5)}` },
  });
  assert.equal(pasajero.status, 403);
  assert.equal((await pasajero.json()).error.code, 'SIN_PERMISO');
});

// Turno de ejemplo: día 10 de diciembre, con dos viajes
const dia = (d, hora) => `2026-12-${String(d).padStart(2, '0')}T${hora}:00Z`;
const turno = (over = {}) => ({
  conductor_id: 2,
  vehiculo_id: 1,
  inicio_planificado: dia(10, '08:00'),
  termino_planificado: dia(10, '16:00'),
  viajes: [
    {
      recorrido_id: 1,
      inicio_planificado: dia(10, '08:30'),
      termino_planificado: dia(10, '09:30'),
    },
    {
      recorrido_id: 2,
      inicio_planificado: dia(10, '09:45'),
      termino_planificado: dia(10, '10:45'),
    },
  ],
  ...over,
});

test('ADM-03: crea un turno con viajes ordenados por horario', async () => {
  const invertido = turno();
  invertido.viajes.reverse();
  const { status, body } = await call('POST', '/turnos', invertido);
  assert.equal(status, 201);
  assert.equal(body.data.estado, 'programado');
  assert.deepEqual(
    body.data.viajes.map((v) => [v.orden_en_turno, v.recorrido_id, v.sentido]),
    [
      [1, 1, 'ida'],
      [2, 2, 'vuelta'],
    ],
  );
  assert.equal(body.data.viajes[0].linea_codigo, '103');
  assert.equal(body.data.conductor_nombre, 'Carlos Rojas');
});

test('ADM-03: rechaza turnos superpuestos del mismo conductor', async () => {
  const { status, body } = await call(
    'POST',
    '/turnos',
    turno({
      vehiculo_id: 2,
      inicio_planificado: dia(10, '15:00'),
      termino_planificado: dia(10, '20:00'),
      viajes: [
        {
          recorrido_id: 1,
          inicio_planificado: dia(10, '16:00'),
          termino_planificado: dia(10, '17:00'),
        },
      ],
    }),
  );
  assert.equal(status, 409);
  assert.equal(body.error.code, 'CONFLICTO');
  assert.match(body.error.message, /conductor/);
});

test('ADM-03: rechaza turnos superpuestos del mismo vehículo', async () => {
  const { status, body } = await call('POST', '/turnos', turno({ conductor_id: 3 }));
  assert.equal(status, 409);
  assert.match(body.error.message, /vehículo/);
});

test('ADM-03: turnos consecutivos (sin superposición) sí se aceptan', async () => {
  const { status } = await call(
    'POST',
    '/turnos',
    turno({
      inicio_planificado: dia(10, '16:00'),
      termino_planificado: dia(10, '22:00'),
      viajes: [
        {
          recorrido_id: 1,
          inicio_planificado: dia(10, '17:00'),
          termino_planificado: dia(10, '18:00'),
        },
      ],
    }),
  );
  assert.equal(status, 201);
});

test('ADM-03: solo conductores habilitados', async () => {
  const { status, body } = await call(
    'POST',
    '/turnos',
    turno({ conductor_id: 4, vehiculo_id: 3 }),
  );
  assert.equal(status, 409);
  assert.match(body.error.message, /habilitados/);
  assert.equal(
    (await call('POST', '/turnos', turno({ conductor_id: 5, vehiculo_id: 3 }))).status,
    400,
  ); // es pasajero
});

test('ADM-03: solo vehículos operativos (con o sin observaciones)', async () => {
  const con = await call('POST', '/turnos', turno({ conductor_id: 3, vehiculo_id: 8 })); // con observaciones
  assert.equal(con.status, 201);
  for (const v of [9, 10]) {
    const r = await call(
      'POST',
      '/turnos',
      turno({
        conductor_id: 3,
        vehiculo_id: v,
        inicio_planificado: dia(11, '08:00'),
        termino_planificado: dia(11, '16:00'),
        viajes: [
          {
            recorrido_id: 1,
            inicio_planificado: dia(11, '09:00'),
            termino_planificado: dia(11, '10:00'),
          },
        ],
      }),
    );
    assert.equal(r.status, 409);
  }
});

test('ADM-03: validaciones de datos (fechas, viajes, líneas)', async () => {
  // día 20: libre de otros turnos, para que solo falle la validación que se prueba
  const d = (h) => dia(20, h);
  const base20 = {
    conductor_id: 3,
    vehiculo_id: 4,
    inicio_planificado: d('08:00'),
    termino_planificado: d('16:00'),
  };
  const viaje = (rec, i, t) => ({
    recorrido_id: rec,
    inicio_planificado: d(i),
    termino_planificado: d(t),
  });
  const ok = [viaje(1, '09:00', '10:00')];
  assert.equal(
    (
      await call('POST', '/turnos', {
        ...base20,
        termino_planificado: d('07:00'),
        viajes: ok,
      })
    ).status,
    400,
  );
  assert.equal((await call('POST', '/turnos', { ...base20, viajes: [] })).status, 400);
  assert.equal(
    (
      await call('POST', '/turnos', {
        ...base20,
        viajes: [viaje(1, '06:00', '07:00')],
      })
    ).status,
    400,
  ); // fuera del turno
  assert.equal(
    (
      await call('POST', '/turnos', {
        ...base20,
        viajes: [viaje(1, '09:00', '10:00'), viaje(2, '09:30', '10:30')],
      })
    ).status,
    400,
  ); // superpuestos
  assert.equal(
    (
      await call('POST', '/turnos', {
        ...base20,
        viajes: [viaje(5, '09:00', '10:00')],
      })
    ).status,
    409,
  ); // línea 211 suspendida
  assert.equal(
    (
      await call('POST', '/turnos', {
        ...base20,
        inicio_planificado: 'mañana',
        viajes: ok,
      })
    ).status,
    400,
  );
  assert.equal((await call('POST', '/turnos', { ...base20, viajes: ok })).status, 201); // y con datos correctos sí se crea
});

test('ADM-03: el error de validación indica qué campo falló', async () => {
  const { status, body } = await call('POST', '/turnos', {
    ...turno(),
    conductor_id: 'abc',
    margen_tolerancia_min: -3,
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDACION');
  const campos = body.error.details.map((x) => x.campo);
  assert.ok(campos.includes('body.conductor_id'));
  assert.ok(campos.includes('body.margen_tolerancia_min'));
});

test('ADM-03: modifica un turno programado (sin chocar consigo mismo)', async () => {
  const creado = await call(
    'POST',
    '/turnos',
    turno({
      conductor_id: 2,
      vehiculo_id: 5,
      inicio_planificado: dia(12, '08:00'),
      termino_planificado: dia(12, '12:00'),
      viajes: [
        {
          recorrido_id: 3,
          inicio_planificado: dia(12, '08:30'),
          termino_planificado: dia(12, '09:30'),
        },
      ],
    }),
  );
  const edit = await call('PUT', `/turnos/${creado.body.data.id}`, {
    ...turno({
      vehiculo_id: 5,
      inicio_planificado: dia(12, '08:00'),
      termino_planificado: dia(12, '14:00'),
    }),
    viajes: [
      {
        recorrido_id: 3,
        inicio_planificado: dia(12, '08:30'),
        termino_planificado: dia(12, '09:30'),
      },
      {
        recorrido_id: 4,
        inicio_planificado: dia(12, '10:00'),
        termino_planificado: dia(12, '11:00'),
      },
    ],
  });
  assert.equal(edit.status, 200);
  assert.equal(edit.body.data.viajes.length, 2);
  assert.equal(edit.body.data.termino_planificado, '2026-12-12T14:00:00.000Z');
});

test('ADM-03: no se modifica un turno que ya empezó', async () => {
  const t = await call(
    'POST',
    '/turnos',
    turno({
      conductor_id: 3,
      vehiculo_id: 6,
      inicio_planificado: dia(13, '08:00'),
      termino_planificado: dia(13, '12:00'),
      viajes: [
        {
          recorrido_id: 1,
          inicio_planificado: dia(13, '09:00'),
          termino_planificado: dia(13, '10:00'),
        },
      ],
    }),
  );
  await models.Turno.update({ estado: 'en_curso' }, { where: { id: t.body.data.id } });
  assert.equal((await call('PUT', `/turnos/${t.body.data.id}`, turno())).status, 409);
});

test('ADM-03: lista por fecha y conductor; turno inexistente da 404', async () => {
  const dia10 = await call('GET', '/turnos?fecha=2026-12-10');
  assert.ok(dia10.body.data.length >= 3);
  assert.equal(dia10.body.meta.total, dia10.body.data.length);
  assert.ok(dia10.body.data.every((t) => t.inicio_planificado.startsWith('2026-12-10')));
  const c3 = await call('GET', '/turnos?conductor_id=3');
  assert.ok(c3.body.data.every((t) => t.conductor_id === 3));
  assert.equal((await call('GET', '/turnos/9999')).status, 404);
  assert.equal((await call('GET', '/turnos?fecha=10-12-2026')).status, 400);
});

test('ADM-03: margen de tolerancia por defecto configurable; cada turno guarda el suyo', async () => {
  assert.equal((await call('GET', '/configuracion')).body.data.margen_tolerancia_min, 5);
  assert.equal(
    (await call('PUT', '/configuracion', { margen_tolerancia_min: 10 })).body.data
      .margen_tolerancia_min,
    10,
  );
  assert.equal((await call('PUT', '/configuracion', { margen_tolerancia_min: -1 })).status, 400);
  assert.equal((await call('PUT', '/configuracion', { margen_tolerancia_min: 'a' })).status, 400);

  const viajes = (d) => [
    {
      recorrido_id: 1,
      inicio_planificado: dia(d, '09:00'),
      termino_planificado: dia(d, '10:00'),
    },
  ];
  const base30 = (d) => ({
    conductor_id: 2,
    vehiculo_id: 6,
    inicio_planificado: dia(d, '08:00'),
    termino_planificado: dia(d, '16:00'),
    viajes: viajes(d),
  });
  // sin indicar margen → usa el valor por defecto actual (10)
  const a = await call('POST', '/turnos', base30(25));
  assert.equal(a.body.data.margen_tolerancia_min, 10);
  // indicando margen → usa el del turno
  const b = await call('POST', '/turnos', {
    ...base30(26),
    margen_tolerancia_min: 2,
  });
  assert.equal(b.body.data.margen_tolerancia_min, 2);
  // cambiar el valor por defecto no altera turnos ya creados
  await call('PUT', '/configuracion', { margen_tolerancia_min: 5 });
  assert.equal(
    (await call('GET', `/turnos/${a.body.data.id}`)).body.data.margen_tolerancia_min,
    10,
  );
});

test('ADM-03: el administrador lista conductores y vehículos para asignar turnos', async () => {
  const c = await call('GET', '/conductores');
  assert.equal(c.status, 200);
  assert.equal(c.body.meta.total, 3);
  const luis = c.body.data.find((x) => x.nombre === 'Luis Pérez');
  assert.equal(luis.habilitado, false);
  assert.equal(c.body.data.find((x) => x.nombre === 'Carlos Rojas').habilitado, true);

  const v = await call('GET', '/vehiculos');
  assert.equal(v.status, 200);
  assert.equal(v.body.meta.total, 10);
  const porId = (identificador) => v.body.data.find((x) => x.identificador === identificador);
  assert.equal(porId('BUS-01').asignable, true);
  assert.equal(porId('BUS-08').asignable, true); // operativo con observaciones
  assert.equal(porId('BUS-09').asignable, false); // en mantenimiento
  assert.equal(porId('BUS-10').asignable, false); // fuera de servicio
});
