// Catálogo "Antofagasta real": el generador (scripts/antofagasta) y la carga en la base.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { createDatabase } = require('../src/config/database');
const { createMigrator } = require('../src/database/migrator');
const { initModels } = require('../src/database/models');
const {
  cargarDatosEjemplo,
  ARCHIVO_ANTOFAGASTA,
} = require('../src/database/seeders/datos-ejemplo');
const { crearRuta } = require('../src/modules/ubicacion/geo');
const {
  generarCatalogo,
  crearProyeccion,
  cruces,
  segmentos,
  elegirCamino,
} = require('../src/modules/red/antofagasta/generador');
const definicionReal = require('../src/modules/red/antofagasta/lineas');

// Una ciudad de juguete en cuadrícula, en metros alrededor del centro de la zona.
const ZONA = [-23.66, -70.41, -23.64, -70.39];
const proyeccion = crearProyeccion([(ZONA[0] + ZONA[2]) / 2, (ZONA[1] + ZONA[3]) / 2]);
const ll = (x, y) => proyeccion.aLatLng({ x, y });
const calle = (nombre, ...puntos) => ({ nombre, puntos: puntos.map(([x, y]) => ll(x, y)) });

const VIAS = [
  calle('Avenida Angamos', [0, -1200], [0, 0], [0, 1200]),
  calle('Avenida Argentina', [600, -1200], [600, 0], [600, 1200]),
  calle('Uribe', [-200, 0], [0, 0], [600, 0], [800, 0]),
  calle('Maipú', [-200, 500], [0, 500], [600, 500], [800, 500]),
  // Otra calle "Uribe" lejos, en otro sector: el generador no debe confundirse.
  calle('Pasaje Uribe', [3000, 3000], [3200, 3000]),
];
const DEFINICION = {
  CALLES: { 'Av. Angamos': /\bangamos\b/, Uribe: /\buribe\b/, 'Av. Argentina': /\bargentina\b/ },
  LINEAS: [
    {
      codigo: '900',
      nombre: 'Sur – Norte',
      color: '#1E5FC9',
      ida: {
        inicio: ll(30, -1100),
        fin: ll(580, 1100),
        calles: ['Av. Angamos', 'Uribe', 'Av. Argentina'],
      },
      vuelta: {
        inicio: ll(580, 1100),
        fin: ll(30, -1100),
        calles: ['Av. Argentina', 'Uribe', 'Av. Angamos'],
      },
    },
  ],
  SERVICIO: { dias: 'Lunes a viernes', horarios: '07:00 - 21:00' },
  ZONA,
};

/** OSRM de juguete: une los puntos pedidos en línea recta (la cuadrícula ya los alinea). */
const rutear = async (puntos) => ({
  coordenadas: puntos.map((p) => [p.latitud, p.longitud]),
  ajustes: puntos.map(() => 2),
});

test('generador: encuentra el cruce de dos calles y elige el camino más corto', () => {
  const xy = (v) => v.puntos.map((p) => proyeccion.aXY(p));
  const angamos = segmentos([xy(VIAS[0])]);
  const uribe = segmentos([xy(VIAS[2]), xy(VIAS[4])]);
  const c = cruces(angamos, uribe);
  assert.equal(c.length, 1);
  assert.ok(Math.hypot(c[0].x, c[0].y) < 1);
  // Entre dos opciones, la que deja el camino más corto.
  const camino = elegirCamino(
    { x: 0, y: -1000 },
    [
      [
        { x: 0, y: 0 },
        { x: 0, y: 5000 },
      ],
    ],
    { x: 600, y: 0 },
  );
  assert.deepEqual(camino, [{ x: 0, y: 0 }]);
});

test('generador: arma los recorridos con trazado, paraderos con nombre y datos de la fuente', async () => {
  const { catalogo, avisos } = await generarCatalogo({
    vias: VIAS,
    paradas: [{ nombre: 'Paradero Plaza', lat: ll(5, -600)[0], lng: ll(5, -600)[1] }],
    definicion: DEFINICION,
    rutear,
  });
  assert.deepEqual(avisos, []);
  assert.equal(catalogo.lineas.length, 1);
  const [linea] = catalogo.lineas;
  assert.equal(linea.estado_servicio, 'activa');
  const { ida, vuelta } = linea.recorridos;
  assert.equal(ida.dias, 'Lunes a viernes');

  const nombres = new Map(catalogo.paraderos.map(([c, n]) => [c, n]));
  const nombresIda = ida.paraderos.map((c) => nombres.get(c));
  assert.equal(nombresIda[0], 'Terminal Sur');
  assert.equal(nombresIda[nombresIda.length - 1], 'Terminal Norte');
  assert.ok(nombresIda.includes('Paradero Plaza'), nombresIda.join(' | ')); // de OpenStreetMap
  // Los paraderos de los giros llevan la calle y su cruce.
  assert.ok(
    nombresIda.some((n) => /^Uribe \/ Avenida/.test(n)),
    nombresIda.join(' | '),
  );
  assert.ok(
    nombresIda.some((n) => /^Avenida Argentina \/ Uribe/.test(n)),
    nombresIda.join(' | '),
  );

  // El trazado pasa por todos los paraderos, en ambos sentidos.
  const coord = new Map(
    catalogo.paraderos.map(([c, , lat, lng]) => [c, { latitud: lat, longitud: lng }]),
  );
  for (const r of [ida, vuelta]) {
    assert.ok(r.trazado.length >= 2);
    assert.equal(
      crearRuta(
        r.paraderos.map((c) => coord.get(c)),
        r.trazado,
      ).porCalles,
      true,
    );
    assert.equal(new Set(r.paraderos).size, r.paraderos.length); // sin paraderos repetidos
  }
  // Los paraderos quedan separados al menos unos 300 m dentro de un recorrido.
  const ruta = crearRuta(
    ida.paraderos.map((c) => coord.get(c)),
    ida.trazado,
  );
  for (let i = 1; i < ruta.posiciones.length; i++) {
    assert.ok(ruta.posiciones[i] - ruta.posiciones[i - 1] > 250);
  }
  // Ida y vuelta comparten los paraderos que están en el mismo lugar.
  assert.ok(ida.paraderos.some((c) => vuelta.paraderos.includes(c)));
  // Códigos únicos con el formato de siempre.
  assert.ok(catalogo.paraderos.every(([c]) => /^AF-\d{3}$/.test(c)));
});

test('generador: avisa si una calle del itinerario no existe', async () => {
  const definicion = {
    ...DEFINICION,
    CALLES: { ...DEFINICION.CALLES, Inexistente: /no existe/ },
    LINEAS: [
      {
        ...DEFINICION.LINEAS[0],
        ida: {
          ...DEFINICION.LINEAS[0].ida,
          calles: ['Av. Angamos', 'Inexistente', 'Av. Argentina'],
        },
      },
    ],
  };
  const { avisos } = await generarCatalogo({ vias: VIAS, paradas: [], definicion, rutear });
  assert.ok(
    avisos.some((a) => /No se encontró la calle "Inexistente"/.test(a)),
    avisos.join('\n'),
  );
});

test('lineas.js: cada calle de los itinerarios tiene cómo buscarse en OpenStreetMap', () => {
  const { CALLES, LINEAS } = definicionReal;
  for (const l of LINEAS) {
    for (const sentido of ['ida', 'vuelta']) {
      for (const c of l[sentido].calles) assert.ok(CALLES[c], `Línea ${l.codigo}: falta "${c}"`);
    }
  }
  // El simulador de flota usa las líneas 103 y 107.
  assert.ok(LINEAS.some((l) => l.codigo === '103'));
  assert.ok(LINEAS.some((l) => l.codigo === '107'));
});

test('catálogo antofagasta: se carga en la base y cada recorrido pasa por sus paraderos', async () => {
  const sequelize = createDatabase(':memory:');
  await createMigrator(sequelize).up();
  const models = initModels(sequelize);
  const { catalogo } = await cargarDatosEjemplo(models, { catalogo: 'antofagasta' });
  const existe = fs.existsSync(ARCHIVO_ANTOFAGASTA);
  // Sin el archivo generado se usa la red de prueba (y se avisa en la consola).
  assert.equal(catalogo, existe ? 'antofagasta' : 'prueba');
  if (existe) {
    const recorridos = await models.Recorrido.findAll();
    for (const r of recorridos) {
      const paradas = await models.RecorridoParadero.findAll({
        where: { recorrido_id: r.id },
        include: [{ model: models.Paradero, as: 'paradero' }],
        order: [['orden', 'ASC']],
      });
      assert.ok(paradas.length >= 2);
      const ruta = crearRuta(
        paradas.map((p) => p.paradero),
        r.trazado,
      );
      assert.equal(ruta.porCalles, true, `recorrido ${r.id} sin trazado válido`);
    }
    for (const codigo of ['103', '107']) {
      assert.ok(await models.Linea.findOne({ where: { codigo } }), `falta la línea ${codigo}`);
    }
  }
  await sequelize.close();
});
