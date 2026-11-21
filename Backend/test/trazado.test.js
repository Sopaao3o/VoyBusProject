// RED-01 / ADM-01 / VEH-01: trazado de los recorridos por las calles.
const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');
const { cargarDatosEjemplo } = require('../src/database/seeders/datos-ejemplo');
const {
  calcularAvance,
  crearRuta,
  distancia,
  puntoEnRecorrido,
  simplificar,
} = require('../src/modules/ubicacion/geo');
const { trazarPorCalles, ErrorTrazado } = require('../src/modules/red/trazado');
const { tokenPara } = require('./auth-helpers');

// ── Geometría ──

// Tres paraderos en "L": A → B hacia el norte y B → C hacia el este (unos 500 m cada tramo).
const A = { orden: 1, latitud: -23.65, longitud: -70.4 };
const B = { orden: 2, latitud: -23.6455, longitud: -70.4 };
const C = { orden: 3, latitud: -23.6455, longitud: -70.3951 };
// Un trazado por las calles que da un rodeo: sube por una calle 200 m al oeste y vuelve.
const RODEO = [
  [A.latitud, A.longitud],
  [A.latitud, -70.402],
  [B.latitud, -70.402],
  [B.latitud, B.longitud],
  [C.latitud, C.longitud],
];

test('geo: sin trazado, la ruta son tramos rectos entre paraderos', () => {
  const ruta = crearRuta([A, B, C]);
  assert.equal(ruta.porCalles, false);
  assert.equal(ruta.posiciones[0], 0);
  assert.ok(Math.abs(ruta.posiciones[1] - distancia(A, B)) < 0.01);
});

test('geo: con trazado, las posiciones de los paraderos se miden por las calles', () => {
  const ruta = crearRuta([A, B, C], RODEO);
  assert.equal(ruta.porCalles, true);
  // El rodeo suma unos 400 m (200 de ida y 200 de vuelta) antes de llegar a B.
  const recto = distancia(A, B);
  assert.ok(ruta.posiciones[1] > recto + 350, `${ruta.posiciones[1]} vs ${recto}`);
  assert.ok(ruta.largo > ruta.posiciones[1]);
  // Acepta el trazado como texto JSON, tal como se guarda en la base.
  assert.equal(crearRuta([A, B, C], JSON.stringify(RODEO)).porCalles, true);
});

test('geo: un trazado que no pasa por los paraderos se ignora', () => {
  const lejos = RODEO.map(([lat, lng]) => [lat + 0.01, lng]);
  assert.equal(crearRuta([A, B, C], lejos).porCalles, false);
  assert.equal(crearRuta([A, B, C], 'no es json').porCalles, false);
  assert.equal(crearRuta([A, B, C], [[1, 2]]).porCalles, false);
});

test('VEH-01: con trazado, una micro en la calle del rodeo cuenta como dentro del recorrido', () => {
  // A mitad de la calle del rodeo: a 200 m de la recta A–B, pero sobre el trazado.
  const enElRodeo = { latitud: -23.648, longitud: -70.402 };
  const sinTrazado = calcularAvance([A, B, C], 0, enElRodeo);
  const conTrazado = calcularAvance([A, B, C], 0, enElRodeo, RODEO);
  assert.ok(sinTrazado.lejania > 150);
  assert.ok(conTrazado.lejania < 1);
  assert.equal(conTrazado.ultimoSuperado, 1); // ya dejó atrás A, todavía no llega a B
  // Pasada la esquina de B hacia C, B queda superado.
  const despuesDeB = puntoEnRecorrido(
    crearRuta([A, B, C], RODEO),
    crearRuta([A, B, C], RODEO).posiciones[1] + 60,
  );
  assert.equal(calcularAvance([A, B, C], 1, despuesDeB, RODEO).ultimoSuperado, 2);
});

test('geo: simplificar quita los puntos que no cambian la forma', () => {
  const recta = Array.from({ length: 50 }, (_, i) => [-23.65 + i * 0.0001, -70.4]);
  const conEsquina = [...recta, [-23.645, -70.395]];
  const simple = simplificar(conEsquina, 2);
  assert.deepEqual(simple, [recta[0], recta[49], [-23.645, -70.395]]);
});

// ── Servicio de rutas (OSRM) ──

/** Un fetch falso que responde como OSRM: une los puntos pedidos en línea recta. */
function osrmFalso({ alejamiento = 3 } = {}) {
  const consultas = [];
  const fetch = async (url) => {
    consultas.push(url);
    const coords = url
      .split('/driving/')[1]
      .split('?')[0]
      .split(';')
      .map((par) => par.split(',').map(Number));
    return {
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [{ geometry: { coordinates: coords }, legs: [] }],
        waypoints: coords.map(() => ({ distance: alejamiento })),
      }),
    };
  };
  return { fetch, consultas };
}

test('trazado: pide a OSRM la ruta por los paraderos en orden y la devuelve como [lat, lng]', async () => {
  const { fetch, consultas } = osrmFalso();
  const r = await trazarPorCalles([A, B, C], { fetch, url: 'http://osrm.test' });
  assert.equal(consultas.length, 1);
  assert.match(consultas[0], /^http:\/\/osrm\.test\/route\/v1\/driving\/-70\.400000,-23\.650000;/);
  assert.deepEqual(r.trazado[0], [A.latitud, A.longitud]);
  assert.deepEqual(r.trazado[r.trazado.length - 1], [C.latitud, C.longitud]);
  assert.ok(r.largo_m > 900 && r.largo_m < 1100);
});

test('trazado: un paradero lejos de cualquier calle se informa por su nombre', async () => {
  const { fetch } = osrmFalso({ alejamiento: 120 });
  await assert.rejects(
    trazarPorCalles([{ ...A, nombre: 'Plaza' }, B], { fetch, url: 'http://osrm.test' }),
    (err) =>
      err instanceof ErrorTrazado && err.codigo === 'PARADERO_LEJOS' && /Plaza/.test(err.message),
  );
});

test('trazado: sin conexión al servicio de rutas se informa claramente', async () => {
  const fetch = async () => {
    throw new Error('getaddrinfo ENOTFOUND');
  };
  await assert.rejects(
    trazarPorCalles([A, B], { fetch, url: 'http://osrm.test' }),
    (err) => err.codigo === 'SIN_CONEXION',
  );
});

test('trazado: con muchos paraderos consulta por partes y las une sin repetir puntos', async () => {
  const { fetch, consultas } = osrmFalso();
  const muchos = Array.from({ length: 120 }, (_, i) => ({
    latitud: -23.7 + i * 0.0009,
    longitud: -70.4 + (i % 2) * 0.0004,
  }));
  const r = await trazarPorCalles(muchos, { fetch, url: 'http://osrm.test' });
  assert.equal(consultas.length, 2);
  assert.equal(r.trazado.length, 120);
});

// ── API ──

let server, base, sequelize, models;
let trazadorFalla = null;

test.before(async () => {
  sequelize = createDatabase(':memory:');
  await createMigrator(sequelize).up();
  models = initModels(sequelize);
  await cargarDatosEjemplo(models);
  const { fetch } = osrmFalso();
  // Trazador de prueba: el real con un OSRM falso (o un error, si la prueba lo pide).
  const trazador = (paraderos) => {
    if (trazadorFalla) return Promise.reject(trazadorFalla);
    return trazarPorCalles(paraderos, { fetch, url: 'http://osrm.test' });
  };
  server = createApp({ models, trazador }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

test.after(async () => {
  server.close();
  await sequelize.close();
});

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

/** Id del recorrido de ida de la línea 103 (datos de ejemplo). */
async function recorrido103() {
  const linea = await models.Linea.findOne({ where: { codigo: '103' } });
  return models.Recorrido.findOne({ where: { linea_id: linea.id, sentido: 'ida' } });
}

test('ADM-01: solo el administrador genera trazados', async () => {
  const r = await recorrido103();
  assert.equal(
    (await call('POST', `/admin/red/recorridos/${r.id}/trazado`, { as: 2 })).status,
    403,
  );
  assert.equal((await call('POST', `/admin/red/recorridos/9999/trazado`)).status, 404);
});

test('ADM-01: generar el trazado lo guarda y la consulta pública lo entrega', async () => {
  const r = await recorrido103();
  const generado = await call('POST', `/admin/red/recorridos/${r.id}/trazado`);
  assert.equal(generado.status, 200);
  assert.ok(generado.body.data.trazado.length >= 2);
  assert.ok(generado.body.data.trazado_actualizado_en);
  assert.ok(generado.body.data.largo_m > 0);

  const publica = (await call('GET', `/lineas/${r.linea_id}`, { as: null })).body.data;
  const ida = publica.recorridos.find((x) => x.id === r.id);
  assert.deepEqual(ida.trazado, generado.body.data.trazado);
  const vuelta = publica.recorridos.find((x) => x.id !== r.id);
  assert.equal(vuelta.trazado, null); // la vuelta todavía no tiene: se dibuja en tramos rectos
});

test('ADM-01: cambiar los paraderos del recorrido borra su trazado', async () => {
  const r = await recorrido103();
  await call('POST', `/admin/red/recorridos/${r.id}/trazado`);
  const actual = (await call('GET', `/admin/red/recorridos/${r.id}`)).body.data;
  const ids = actual.paraderos.map((p) => p.id);
  // Mismos paraderos: el trazado se conserva.
  const igual = await call('PUT', `/admin/red/recorridos/${r.id}`, { body: { paraderos: ids } });
  assert.ok(igual.body.data.trazado);
  // Otro orden: el trazado ya no sirve.
  const otro = [ids[0], ids[2], ids[1], ...ids.slice(3)];
  const cambiado = await call('PUT', `/admin/red/recorridos/${r.id}`, {
    body: { paraderos: otro },
  });
  assert.equal(cambiado.status, 200);
  assert.equal(cambiado.body.data.trazado, null);
  await call('PUT', `/admin/red/recorridos/${r.id}`, { body: { paraderos: ids } });
});

test('ADM-01: mover un paradero borra el trazado de sus recorridos (salvo una corrección fina)', async () => {
  const r = await recorrido103();
  await call('POST', `/admin/red/recorridos/${r.id}/trazado`);
  const paradero = (await call('GET', `/admin/red/recorridos/${r.id}`)).body.data.paraderos[1];

  await call('PUT', `/admin/red/paraderos/${paradero.id}`, {
    body: { latitud: paradero.latitud + 0.00005 }, // unos 5 m
  });
  assert.ok((await call('GET', `/admin/red/recorridos/${r.id}`)).body.data.trazado);

  await call('PUT', `/admin/red/paraderos/${paradero.id}`, {
    body: { latitud: paradero.latitud + 0.003 }, // unos 330 m
  });
  assert.equal((await call('GET', `/admin/red/recorridos/${r.id}`)).body.data.trazado, null);
  await call('PUT', `/admin/red/paraderos/${paradero.id}`, { body: { latitud: paradero.latitud } });
});

test('ADM-01: se puede quitar el trazado, y no se toca con viajes en curso', async () => {
  const r = await recorrido103();
  await call('POST', `/admin/red/recorridos/${r.id}/trazado`);
  const quitado = await call('DELETE', `/admin/red/recorridos/${r.id}/trazado`);
  assert.equal(quitado.status, 200);
  assert.equal(quitado.body.data.trazado, null);

  await models.Turno.update({ estado: 'finalizado' }, { where: { conductor_id: 2 } });
  const turno = await models.Turno.create({
    conductor_id: 2,
    vehiculo_id: 6,
    estado: 'en_curso',
    inicio_planificado: '2027-06-01T08:00:00.000Z',
    termino_planificado: '2027-06-01T16:00:00.000Z',
  });
  const viaje = await models.Viaje.create({
    turno_id: turno.id,
    recorrido_id: r.id,
    orden_en_turno: 1,
    estado: 'en_curso',
    inicio_planificado: '2027-06-01T08:30:00.000Z',
    termino_planificado: '2027-06-01T10:00:00.000Z',
  });
  const bloqueado = await call('POST', `/admin/red/recorridos/${r.id}/trazado`);
  assert.equal(bloqueado.status, 409);
  assert.match(bloqueado.body.error.message, /viaje en curso/);
  assert.equal((await call('DELETE', `/admin/red/recorridos/${r.id}/trazado`)).status, 409);
  await viaje.update({ estado: 'finalizado' });
  await turno.update({ estado: 'finalizado' });
});

test('ADM-01: los errores del servicio de rutas llegan con un mensaje claro', async () => {
  const r = await recorrido103();
  trazadorFalla = new ErrorTrazado('Algunos paraderos quedan lejos de una calle: X (90 m).', {
    codigo: 'PARADERO_LEJOS',
  });
  const lejos = await call('POST', `/admin/red/recorridos/${r.id}/trazado`);
  assert.equal(lejos.status, 422);
  assert.equal(lejos.body.error.code, 'TRAZADO_PARADERO_LEJOS');

  trazadorFalla = new ErrorTrazado('No se pudo conectar con el servicio de rutas.', {
    codigo: 'SIN_CONEXION',
  });
  const sinRed = await call('POST', `/admin/red/recorridos/${r.id}/trazado`);
  assert.equal(sinRed.status, 503);
  trazadorFalla = null;
});
