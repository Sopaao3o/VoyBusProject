// ADM-01: el administrador genera la red real de Antofagasta desde la app, la carga o vuelve
// a la red de prueba. Aquí con una ciudad de juguete y servicios falsos (sin internet).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');
const { cargarDatosEjemplo, catalogoPrueba } = require('../src/database/seeders/datos-ejemplo');
const { createImportacionRed } = require('../src/modules/red/antofagasta/importacion');
const { crearProyeccion } = require('../src/modules/red/antofagasta/generador');
const { tokenPara } = require('./auth-helpers');

const ZONA = [-23.66, -70.41, -23.64, -70.39];
const proyeccion = crearProyeccion([(ZONA[0] + ZONA[2]) / 2, (ZONA[1] + ZONA[3]) / 2]);
const ll = (x, y) => proyeccion.aLatLng({ x, y });
const calle = (nombre, ...puntos) => ({ nombre, puntos: puntos.map(([x, y]) => ll(x, y)) });

const CALLES = {
  descargado_en: '2026-11-20T12:00:00.000Z',
  vias: [
    calle('Avenida Angamos', [0, -1200], [0, 1200]),
    calle('Avenida Argentina', [600, -1200], [600, 1200]),
    calle('Uribe', [-200, 0], [800, 0]),
  ],
  paradas: [],
};
const DEFINICION = {
  CALLES: { 'Av. Angamos': /\bangamos\b/, Uribe: /\buribe\b/, 'Av. Argentina': /\bargentina\b/ },
  LINEAS: [
    {
      codigo: '900',
      nombre: 'Sur – Norte',
      color: '#1E5FC9',
      ida: {
        inicio: ll(0, -1100),
        fin: ll(600, 1100),
        calles: ['Av. Angamos', 'Uribe', 'Av. Argentina'],
      },
      vuelta: {
        inicio: ll(600, 1100),
        fin: ll(0, -1100),
        calles: ['Av. Argentina', 'Uribe', 'Av. Angamos'],
      },
    },
  ],
  SERVICIO: { dias: 'Lunes a domingo', horarios: '06:00 - 23:00' },
  ZONA,
};

let server, base, sequelize, models, carpeta;
let falla = null;
let descargas = 0;

test.before(async () => {
  sequelize = createDatabase(':memory:');
  await createMigrator(sequelize).up();
  models = initModels(sequelize);
  await cargarDatosEjemplo(models);
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'voybus-red-'));
  const fuentes = {
    definicion: DEFINICION,
    rutas: {
      catalogo: path.join(carpeta, 'antofagasta.json'),
      cache: path.join(carpeta, 'calles.json'),
      vista: path.join(carpeta, 'vista.geojson'),
    },
    descargar: async () => {
      descargas += 1;
      if (falla) throw falla;
      return CALLES;
    },
    rutear: async (puntos) => ({
      coordenadas: puntos.map((p) => [p.latitud, p.longitud]),
      ajustes: puntos.map(() => 1),
    }),
  };
  const importacionRed = createImportacionRed(models, { catalogoPrueba, fuentes });
  server = createApp({ models, importacionRed }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

test.after(async () => {
  server.close();
  await sequelize.close();
  fs.rmSync(carpeta, { recursive: true, force: true });
});

const call = async (method, ruta, { as = 1, body } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (as) headers.Authorization = `Bearer ${tokenPara(as)}`;
  const res = await fetch(base + ruta, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

/** Consulta el avance hasta que la generación termine. */
async function esperarFin() {
  for (let i = 0; i < 100; i++) {
    const { body } = await call('GET', '/admin/red/importacion');
    if (body.data.tarea.estado !== 'en_curso') return body.data;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('La generación no terminó');
}

const lineaPublica = async (codigo) =>
  (await call('GET', '/lineas', { as: null })).body.data.find((l) => l.codigo === codigo);

test('ADM-01: solo el administrador cambia la red', async () => {
  assert.equal((await call('GET', '/admin/red/importacion', { as: 2 })).status, 403);
  assert.equal((await call('POST', '/admin/red/importacion/generar', { as: 5 })).status, 403);
  assert.equal((await call('POST', '/admin/red/importacion/prueba', { as: null })).status, 401);
});

test('ADM-01: al comienzo está la red de prueba y no hay red de Antofagasta generada', async () => {
  const { status, body } = await call('GET', '/admin/red/importacion');
  assert.equal(status, 200);
  assert.equal(body.data.red_actual, 'prueba');
  assert.equal(body.data.archivo, null);
  assert.equal(body.data.tarea.estado, 'inactiva');
  assert.equal((await call('POST', '/admin/red/importacion/archivo')).status, 404);
});

test('ADM-01: generar descarga, traza y aplica la red; lo que no es de ella se desactiva', async () => {
  const r = await call('POST', '/admin/red/importacion/generar', { body: {} });
  assert.equal(r.status, 202);
  assert.equal(r.body.data.tarea.estado, 'en_curso');

  const fin = await esperarFin();
  assert.equal(fin.tarea.estado, 'lista', fin.tarea.mensaje);
  assert.equal(fin.tarea.hechos, 2);
  assert.equal(fin.tarea.total, 2);
  assert.equal(fin.red_actual, 'antofagasta');
  assert.deepEqual(fin.archivo.lineas, ['900']);
  assert.equal(fin.tarea.resultado.lineas_creadas, 1);
  assert.equal(fin.tarea.resultado.lineas_desactivadas, 3); // 103, 107 y 211 (la 305 ya lo estaba)

  // Lo ve el público, con su trazado; las líneas de prueba ya no aparecen.
  const linea = await lineaPublica('900');
  assert.ok(linea);
  assert.equal(await lineaPublica('103'), undefined);
  const detalle = (await call('GET', `/lineas/${linea.id}`, { as: null })).body.data;
  assert.equal(detalle.recorridos.length, 2);
  assert.ok(detalle.recorridos.every((x) => x.trazado && x.trazado.length >= 2));
  assert.ok(detalle.recorridos[0].paraderos.every((p) => p.codigo.startsWith('AF-')));
  // Las calles quedaron guardadas: la próxima vez no se vuelven a descargar.
  assert.ok(fs.existsSync(path.join(carpeta, 'calles.json')));
});

test('ADM-01: volver a la red de prueba y cargar otra vez la ya generada (sin descargar)', async () => {
  const prueba = await call('POST', '/admin/red/importacion/prueba');
  assert.equal(prueba.status, 200);
  assert.equal(prueba.body.data.red_actual, 'prueba');
  assert.ok(await lineaPublica('103'));
  assert.equal((await lineaPublica('211')).estado_servicio, 'suspendida'); // como en la red de prueba
  assert.equal(await lineaPublica('900'), undefined);

  const antes = descargas;
  const archivo = await call('POST', '/admin/red/importacion/archivo');
  assert.equal(archivo.status, 200);
  assert.equal(archivo.body.data.red_actual, 'antofagasta');
  assert.equal(archivo.body.data.resultado.lineas_actualizadas, 1);
  assert.equal(descargas, antes);
  // Aplicarla dos veces no duplica nada.
  await call('POST', '/admin/red/importacion/archivo');
  assert.equal(await models.Linea.count({ where: { codigo: '900' } }), 1);
  await call('POST', '/admin/red/importacion/prueba');
});

test('ADM-01: con viajes en curso la red no se cambia', async () => {
  await models.Turno.update({ estado: 'finalizado' }, { where: { conductor_id: 2 } });
  const turno = await models.Turno.create({
    conductor_id: 2,
    vehiculo_id: 6,
    estado: 'en_curso',
    inicio_planificado: '2027-06-01T08:00:00.000Z',
    termino_planificado: '2027-06-01T16:00:00.000Z',
  });
  const recorrido = await models.Recorrido.findOne();
  const viaje = await models.Viaje.create({
    turno_id: turno.id,
    recorrido_id: recorrido.id,
    orden_en_turno: 1,
    estado: 'en_curso',
    inicio_planificado: '2027-06-01T08:30:00.000Z',
    termino_planificado: '2027-06-01T10:00:00.000Z',
  });
  for (const ruta of ['generar', 'archivo', 'prueba']) {
    const r = await call('POST', `/admin/red/importacion/${ruta}`);
    assert.equal(r.status, 409, ruta);
    assert.match(r.body.error.message, /viaje en curso/);
  }
  await viaje.update({ estado: 'finalizado' });
  await turno.update({ estado: 'finalizado' });
});

test('ADM-01: si falla la descarga, la tarea termina con el error y la red no cambia', async () => {
  falla = new Error('No se pudieron descargar las calles de OpenStreetMap: sin conexión');
  const r = await call('POST', '/admin/red/importacion/generar', { body: { descargar: true } });
  assert.equal(r.status, 202);
  const fin = await esperarFin();
  assert.equal(fin.tarea.estado, 'error');
  assert.match(fin.tarea.mensaje, /sin conexión/);
  assert.equal(fin.red_actual, 'prueba');
  falla = null;
  assert.equal(
    (await call('POST', '/admin/red/importacion/generar', { body: { descargar: 'si' } })).status,
    400,
  );
});
