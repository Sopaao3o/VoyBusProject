const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');
const { cargarDatosEjemplo } = require('../src/database/seeders/datos-ejemplo');

let server, base, sequelize, models;
let reloj = new Date('2026-12-01T08:00:00Z'); // hora "actual" controlada por las pruebas
const poner = (iso) => {
  reloj = new Date(iso);
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

// conductor 2 = Carlos, conductor 3 = María, 1 = admin, 5 = pasajera
const call = async (method, path, { as = 2, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(as ? { 'x-user-id': String(as) } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

/** Crea un turno de prueba directamente en la base, con dos viajes. */
async function crearTurno({ conductor = 2, vehiculo = 1, dia = '2026-12-01', margen = 5 } = {}) {
  // Cierra turnos que otras pruebas dejaron en curso, para que no interfieran con esta.
  await models.Turno.update(
    { estado: 'finalizado' },
    { where: { conductor_id: conductor, estado: 'en_curso' } },
  );
  const t = await models.Turno.create({
    conductor_id: conductor,
    vehiculo_id: vehiculo,
    inicio_planificado: `${dia}T08:00:00.000Z`,
    termino_planificado: `${dia}T16:00:00.000Z`,
    margen_tolerancia_min: margen,
  });
  const v1 = await models.Viaje.create({
    turno_id: t.id,
    recorrido_id: 1,
    orden_en_turno: 1,
    inicio_planificado: `${dia}T08:30:00.000Z`,
    termino_planificado: `${dia}T10:00:00.000Z`,
  });
  const v2 = await models.Viaje.create({
    turno_id: t.id,
    recorrido_id: 2,
    orden_en_turno: 2,
    inicio_planificado: `${dia}T10:30:00.000Z`,
    termino_planificado: `${dia}T12:00:00.000Z`,
  });
  return { turno: t.id, viajes: [v1.id, v2.id] };
}

const ok = { estado_vehiculo: 'operativo' };

test('VEH-03: el conductor ve solo sus turnos, con vehículo y recorridos', async () => {
  const mio = await crearTurno({ conductor: 2, dia: '2026-12-02', vehiculo: 1 });
  const ajeno = await crearTurno({ conductor: 3, dia: '2026-12-02', vehiculo: 2 });
  const lista = await call('GET', '/conductor/turnos?fecha=2026-12-02');
  assert.deepEqual(
    lista.body.data.map((t) => t.id),
    [mio.turno],
  );
  assert.equal(lista.body.data[0].vehiculo.identificador, 'BUS-01');
  assert.equal(lista.body.data[0].viajes.length, 2);
  assert.equal(lista.body.data[0].viajes[0].linea_codigo, '103');
  assert.equal((await call('GET', `/conductor/turnos/${ajeno.turno}`)).status, 404); // turno de otro conductor
});

test('VEH-03: solo conductores habilitados pueden usar estas rutas', async () => {
  assert.equal((await call('GET', '/conductor/turnos', { as: null })).status, 401);
  assert.equal((await call('GET', '/conductor/turnos', { as: 5 })).status, 403); // pasajera
  assert.equal((await call('GET', '/conductor/turnos', { as: 4 })).status, 403); // conductor deshabilitado
});

test('VEH-03: iniciar y finalizar turno registra hora real y estado del vehículo', async () => {
  const { turno, viajes } = await crearTurno({ dia: '2026-12-03', vehiculo: 3 });
  poner('2026-12-03T08:02:00Z');
  const ini = await call('POST', `/conductor/turnos/${turno}/iniciar`, { body: ok });
  assert.equal(ini.status, 200);
  assert.equal(ini.body.data.estado, 'en_curso');
  assert.equal(ini.body.data.inicio_real, '2026-12-03T08:02:00.000Z');
  assert.equal(ini.body.data.estado_vehiculo_recibido, 'operativo');
  assert.equal(ini.body.data.evaluacion.inicio.estado, 'a_tiempo'); // 2 min < margen de 5

  // Un turno con varios viajes: finalizar un viaje NO cierra el turno
  poner('2026-12-03T08:30:00Z');
  await call('POST', `/conductor/viajes/${viajes[0]}/iniciar`);
  poner('2026-12-03T10:00:00Z');
  const fin1 = await call('POST', `/conductor/viajes/${viajes[0]}/finalizar`);
  assert.equal(fin1.body.data.estado, 'en_curso');
  assert.equal(fin1.body.data.viajes[0].estado, 'finalizado');

  await call('POST', `/conductor/viajes/${viajes[1]}/iniciar`);
  poner('2026-12-03T12:00:00Z');
  await call('POST', `/conductor/viajes/${viajes[1]}/finalizar`);
  poner('2026-12-03T16:00:00Z');
  const fin = await call('POST', `/conductor/turnos/${turno}/finalizar`, { body: ok });
  assert.equal(fin.body.data.estado, 'finalizado');
  assert.equal(fin.body.data.termino_real, '2026-12-03T16:00:00.000Z');
  assert.equal(fin.body.data.estado_vehiculo_entregado, 'operativo');
});

test('VEH-03: no se puede iniciar un turno dos veces ni tener dos en curso', async () => {
  const a = await crearTurno({ dia: '2026-12-04', vehiculo: 4 });
  const b = await crearTurno({ dia: '2026-12-05', vehiculo: 4 });
  // (crearTurno cierra turnos en curso del conductor; por eso primero se crean ambos y luego se inicia)
  assert.equal(
    (await call('POST', `/conductor/turnos/${a.turno}/iniciar`, { body: ok })).status,
    200,
  );
  assert.equal(
    (await call('POST', `/conductor/turnos/${a.turno}/iniciar`, { body: ok })).status,
    409,
  );
  assert.equal(
    (await call('POST', `/conductor/turnos/${b.turno}/iniciar`, { body: ok })).status,
    409,
  );
});

test('VEH-03: los viajes se hacen en orden y solo con el turno en curso', async () => {
  const { turno, viajes } = await crearTurno({ dia: '2026-12-06', vehiculo: 5 });
  assert.equal((await call('POST', `/conductor/viajes/${viajes[0]}/iniciar`)).status, 409); // turno sin iniciar
  await call('POST', `/conductor/turnos/${turno}/iniciar`, { body: ok });
  assert.equal((await call('POST', `/conductor/viajes/${viajes[1]}/iniciar`)).status, 409); // falta el viaje 1
  assert.equal((await call('POST', `/conductor/viajes/${viajes[0]}/iniciar`)).status, 200);
  assert.equal(
    (await call('POST', `/conductor/turnos/${turno}/finalizar`, { body: ok })).status,
    409,
  ); // viaje en curso
});

test('VEH-03: estado con observaciones o fuera de servicio exige describir el problema', async () => {
  const { turno } = await crearTurno({ dia: '2026-12-07', vehiculo: 6 });
  const sin = await call('POST', `/conductor/turnos/${turno}/iniciar`, {
    body: { estado_vehiculo: 'operativo_con_observaciones' },
  });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.error.details[0].campo, 'body.descripcion');
  const mal = await call('POST', `/conductor/turnos/${turno}/iniciar`, {
    body: { estado_vehiculo: 'en_mantenimiento', descripcion: 'x' },
  });
  assert.equal(mal.status, 400); // el conductor no puede declarar mantenimiento
  const bien = await call('POST', `/conductor/turnos/${turno}/iniciar`, {
    body: {
      estado_vehiculo: 'operativo_con_observaciones',
      descripcion: 'Luz trasera izquierda no funciona',
    },
  });
  assert.equal(bien.status, 200);
  assert.equal(bien.body.data.vehiculo.estado_operativo, 'operativo_con_observaciones');
  assert.equal(bien.body.data.estado_vehiculo_recibido, 'operativo_con_observaciones');
});

test('VEH-03: un vehículo fuera de servicio no puede iniciar nuevos viajes', async () => {
  const { turno, viajes } = await crearTurno({ dia: '2026-12-08', vehiculo: 7 });
  await call('POST', `/conductor/turnos/${turno}/iniciar`, { body: ok });
  const est = await call('POST', `/conductor/turnos/${turno}/estado-vehiculo`, {
    body: { estado_vehiculo: 'fuera_de_servicio', descripcion: 'Falla de frenos' },
  });
  assert.equal(est.body.data.vehiculo.estado_operativo, 'fuera_de_servicio');
  const r = await call('POST', `/conductor/viajes/${viajes[0]}/iniciar`);
  assert.equal(r.status, 409);
  assert.match(r.body.error.message, /fuera de servicio/);
});

test('VEH-03: los cambios de estado conservan fecha, responsable y observación', async () => {
  const vehiculo = await models.Vehiculo.findOne({ where: { identificador: 'BUS-07' } });
  const { body } = await call('GET', `/admin/vehiculos/${vehiculo.id}/historial`, { as: 1 });
  const h = body.data[0];
  assert.equal(h.estado_nuevo, 'fuera_de_servicio');
  assert.equal(h.estado_anterior, 'operativo');
  assert.equal(h.motivo, 'Falla de frenos');
  assert.equal(h.responsable_nombre, 'Carlos Rojas');
  assert.ok(h.fecha);
});

test('VEH-03: incidencias del vehículo o del recorrido quedan disponibles para el administrador', async () => {
  const { turno } = await crearTurno({ dia: '2026-12-09', vehiculo: 2 });
  assert.equal(
    (
      await call('POST', `/conductor/turnos/${turno}/incidencias`, {
        body: { tipo: 'vehiculo', descripcion: 'x' },
      })
    ).status,
    409,
  ); // turno sin iniciar
  await call('POST', `/conductor/turnos/${turno}/iniciar`, { body: ok });
  poner('2026-12-09T09:15:00Z');
  const inc = await call('POST', `/conductor/turnos/${turno}/incidencias`, {
    body: { tipo: 'recorrido', descripcion: 'Calle cortada por obras' },
  });
  assert.equal(inc.status, 201);
  assert.equal(
    (
      await call('POST', `/conductor/turnos/${turno}/incidencias`, {
        body: { tipo: 'otra', descripcion: 'x' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call('POST', `/conductor/turnos/${turno}/incidencias`, {
        body: { tipo: 'vehiculo', descripcion: '  ' },
      })
    ).status,
    400,
  );
  const lista = await call('GET', `/admin/incidencias?turno_id=${turno}`, { as: 1 });
  assert.equal(lista.body.data.length, 1);
  assert.equal(lista.body.data[0].conductor_nombre, 'Carlos Rojas');
  assert.equal(lista.body.data[0].fecha, '2026-12-09T09:15:00.000Z');
  assert.equal(lista.body.data[0].descripcion, 'Calle cortada por obras');
});

test('VEH-03: atrasos y términos anticipados según el margen; la justificación conserva las horas', async () => {
  const { turno, viajes } = await crearTurno({ dia: '2026-12-10', vehiculo: 8, conductor: 3 });
  poner('2026-12-10T08:12:00Z'); // 12 min tarde (margen 5)
  const ini = await call('POST', `/conductor/turnos/${turno}/iniciar`, {
    as: 3,
    body: { estado_vehiculo: 'operativo_con_observaciones', descripcion: 'Espejo suelto' },
  });
  assert.equal(ini.body.data.evaluacion.inicio.estado, 'atraso');
  assert.equal(ini.body.data.evaluacion.inicio.minutos, 12);

  const just = await call('PUT', `/conductor/turnos/${turno}/justificacion`, {
    as: 3,
    body: { justificacion: 'Tráfico en acceso al terminal' },
  });
  assert.equal(just.body.data.justificacion_atraso, 'Tráfico en acceso al terminal');
  assert.equal(just.body.data.inicio_planificado, '2026-12-10T08:00:00.000Z'); // hora original intacta
  assert.equal(just.body.data.inicio_real, '2026-12-10T08:12:00.000Z');

  poner('2026-12-10T08:30:00Z');
  await call('POST', `/conductor/viajes/${viajes[0]}/iniciar`, { as: 3 });
  poner('2026-12-10T09:20:00Z'); // 40 min antes de lo planificado (10:00)
  const f = await call('POST', `/conductor/viajes/${viajes[0]}/finalizar`, { as: 3 });
  assert.equal(f.body.data.viajes[0].evaluacion.termino.estado, 'termino_anticipado');
  assert.equal(f.body.data.viajes[0].evaluacion.inicio.estado, 'a_tiempo');
  assert.equal(
    (
      await call('PUT', `/conductor/viajes/${viajes[0]}/justificacion`, {
        as: 3,
        body: { justificacion: 'Menos pasajeros' },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call('PUT', `/conductor/viajes/${viajes[0]}/justificacion`, {
        as: 3,
        body: { justificacion: '' },
      })
    ).status,
    400,
  );
});

test('VEH-03: no se justifica lo que no tiene desviación; cada turno usa su propio margen', async () => {
  const { turno } = await crearTurno({ dia: '2026-12-11', vehiculo: 3, conductor: 2, margen: 5 });
  poner('2026-12-11T08:03:00Z');
  await call('POST', `/conductor/turnos/${turno}/iniciar`, { body: ok });
  const r = await call('PUT', `/conductor/turnos/${turno}/justificacion`, {
    body: { justificacion: 'Sin motivo' },
  });
  assert.equal(r.status, 409); // 3 min está dentro del margen de 5

  // El mismo atraso de 3 minutos, en un turno con margen de 1, sí cuenta como atraso
  const estricto = await crearTurno({ dia: '2026-12-14', vehiculo: 3, conductor: 2, margen: 1 });
  poner('2026-12-14T08:03:00Z');
  const ini = await call('POST', `/conductor/turnos/${estricto.turno}/iniciar`, { body: ok });
  assert.equal(ini.body.data.margen_tolerancia_min, 1);
  assert.equal(ini.body.data.evaluacion.inicio.estado, 'atraso');
});

test('VEH-03: no se puede iniciar un turno con vehículo en mantenimiento', async () => {
  const { turno } = await crearTurno({ dia: '2026-12-12', vehiculo: 10 });
  await models.Vehiculo.update({ estado_operativo: 'en_mantenimiento' }, { where: { id: 10 } });
  assert.equal(
    (await call('POST', `/conductor/turnos/${turno}/iniciar`, { body: ok })).status,
    409,
  );
});
