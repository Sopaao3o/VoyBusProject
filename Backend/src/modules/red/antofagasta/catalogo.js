// Catálogo "Antofagasta real": generarlo (calles de OpenStreetMap + OSRM), guardarlo y
// aplicarlo a la base. Lo usan el script `npm run catalogo:antofagasta` y el botón del
// administrador en la app.
const fs = require('node:fs');
const path = require('node:path');
const { Op } = require('sequelize');

const definicionReal = require('./lineas');
const { generarCatalogo } = require('./generador');
const { descargarCalles, crearRuteador } = require('./fuentes');
const { crearRuta } = require('../../ubicacion/geo');
const { conflict } = require('../../../utils/httpErrors');

const RAIZ = path.join(__dirname, '..', '..', '..', '..');
const RUTAS = {
  catalogo: path.join(RAIZ, 'src', 'database', 'seeders', 'antofagasta.json'),
  cache: path.join(RAIZ, 'data', 'osm-antofagasta-calles.json'),
  vista: path.join(RAIZ, 'data', 'antofagasta-vista-previa.geojson'),
};

const FUENTE = {
  itinerarios:
    'Letreros Únicos de Recorrido, Perímetro de Exclusión de Antofagasta (DTPR, Ministerio de Transportes)',
  calles: '© colaboradores de OpenStreetMap (ODbL) — https://www.openstreetmap.org/copyright',
  trazado: 'OSRM (Open Source Routing Machine)',
  nota: 'Trazados y paraderos generados automáticamente a partir de los itinerarios oficiales: son aproximados. Días, horarios y colores son de demostración.',
};

/** Cada recorrido debe pasar por sus paraderos (si no, la app lo dibujaría en tramos rectos). */
function revisarCatalogo(catalogo) {
  const avisos = [];
  const coordenadas = new Map(
    catalogo.paraderos.map(([c, , lat, lng]) => [c, { latitud: lat, longitud: lng }]),
  );
  for (const l of catalogo.lineas) {
    for (const [sentido, r] of Object.entries(l.recorridos)) {
      const ruta = crearRuta(
        r.paraderos.map((c) => coordenadas.get(c)),
        r.trazado,
      );
      if (!ruta.porCalles) {
        avisos.push(`Línea ${l.codigo} ${sentido}: el trazado no pasa por todos sus paraderos.`);
      }
    }
  }
  return avisos;
}

/**
 * Descarga (o toma de la copia guardada) las calles, genera el catálogo y lo guarda.
 * @param {object} [opciones]
 * @param {boolean} [opciones.descargar] vuelve a descargar las calles aunque haya copia
 * @param {(texto: string) => void} [opciones.informar] mensajes de avance
 * @param {(hechos: number, total: number) => void} [opciones.progreso] recorridos trazados
 * @param {object} [opciones.fuentes] reemplazos para las pruebas: { descargar, rutear, definicion, rutas }
 */
async function generarYGuardar({
  descargar = false,
  informar = () => {},
  progreso = () => {},
  fuentes = {},
} = {}) {
  const definicion = fuentes.definicion ?? definicionReal;
  const rutas = { ...RUTAS, ...fuentes.rutas };
  let calles;
  if (!descargar && fs.existsSync(rutas.cache)) {
    calles = JSON.parse(fs.readFileSync(rutas.cache, 'utf8'));
    informar(`Usando las calles descargadas el ${calles.descargado_en}.`);
  } else {
    calles = await (fuentes.descargar ?? descargarCalles)(definicion.ZONA, { informar });
    fs.mkdirSync(path.dirname(rutas.cache), { recursive: true });
    fs.writeFileSync(rutas.cache, JSON.stringify(calles));
  }
  informar(
    `${calles.vias.length} tramos de calles y ${calles.paradas.length} paraderos de OpenStreetMap.`,
  );

  const total = definicion.LINEAS.length * 2;
  let hechos = 0;
  progreso(0, total);
  const { catalogo, avisos, vistaPrevia } = await generarCatalogo({
    vias: calles.vias,
    paradas: calles.paradas,
    definicion,
    rutear: fuentes.rutear ?? crearRuteador(),
    informar: (t) => {
      hechos += 1;
      progreso(hechos, total);
      informar(t);
    },
  });
  avisos.push(...revisarCatalogo(catalogo));

  const salida = { fuente: FUENTE, generado_en: new Date().toISOString(), ...catalogo };
  fs.mkdirSync(path.dirname(rutas.catalogo), { recursive: true });
  fs.writeFileSync(rutas.catalogo, `${JSON.stringify(salida)}\n`);
  fs.mkdirSync(path.dirname(rutas.vista), { recursive: true });
  fs.writeFileSync(rutas.vista, JSON.stringify(vistaPrevia));
  return { catalogo: salida, avisos };
}

/** El catálogo guardado, o null si todavía no se genera. */
function leerCatalogo(archivo = RUTAS.catalogo) {
  if (!fs.existsSync(archivo)) return null;
  return JSON.parse(fs.readFileSync(archivo, 'utf8'));
}

/** Resumen de un catálogo para mostrarlo antes de cargarlo. */
const resumir = (c) =>
  c && {
    generado_en: c.generado_en ?? null,
    lineas: c.lineas.map((l) => l.codigo),
    total_paraderos: c.paraderos.length,
  };

/**
 * Aplica un catálogo a la base, sin borrar nada (hay turnos, viajes y favoritos que apuntan a
 * líneas y paraderos):
 *  - líneas y paraderos del catálogo: se crean o se actualizan por su código;
 *  - cada recorrido queda con los paraderos y el trazado del catálogo;
 *  - con `desactivarOtros`, las líneas y paraderos que no son del catálogo se desactivan.
 * No se hace con viajes en curso (no se alteran los viajes de nadie).
 * @param {{ lineas: object[], paraderos: (string|number)[][] }} catalogo
 */
async function aplicarCatalogo(
  models,
  catalogo,
  { desactivarOtros = true, ahora = () => new Date() } = {},
) {
  const { sequelize, Linea, Recorrido, Paradero, RecorridoParadero, Viaje } = models;
  return sequelize.transaction(async (transaction) => {
    const enCurso = await Viaje.count({ where: { estado: 'en_curso' }, transaction });
    if (enCurso > 0) {
      throw conflict(
        `Hay ${enCurso} ${enCurso === 1 ? 'viaje' : 'viajes'} en curso: la red se podrá cambiar cuando ${enCurso === 1 ? 'termine' : 'terminen'} (si es el simulador de flota, detenlo primero).`,
        { code: 'VIAJES_EN_CURSO' },
      );
    }
    const fecha = ahora().toISOString();
    const r = {
      lineas_creadas: 0,
      lineas_actualizadas: 0,
      lineas_desactivadas: 0,
      paraderos_creados: 0,
      paraderos_actualizados: 0,
      paraderos_desactivados: 0,
    };

    const paraderoId = new Map();
    for (const [codigo, nombre, latitud, longitud, activo = 1] of catalogo.paraderos) {
      const existente = await Paradero.findOne({ where: { codigo }, transaction });
      if (existente) {
        await existente.update({ nombre, latitud, longitud, activo }, { transaction });
        paraderoId.set(codigo, existente.id);
        r.paraderos_actualizados += 1;
      } else {
        const nuevo = await Paradero.create(
          { codigo, nombre, latitud, longitud, activo },
          { transaction },
        );
        paraderoId.set(codigo, nuevo.id);
        r.paraderos_creados += 1;
      }
    }

    const lineaIds = [];
    for (const { recorridos, ...datos } of catalogo.lineas) {
      let linea = await Linea.findOne({ where: { codigo: datos.codigo }, transaction });
      if (linea) {
        await linea.update(datos, { transaction });
        r.lineas_actualizadas += 1;
      } else {
        linea = await Linea.create(datos, { transaction });
        r.lineas_creadas += 1;
      }
      lineaIds.push(linea.id);
      for (const [sentido, rec] of Object.entries(recorridos)) {
        const valores = {
          dias_funcionamiento: rec.dias,
          horarios: rec.horarios,
          activo: 1,
          trazado: rec.trazado ? JSON.stringify(rec.trazado) : null,
          trazado_actualizado_en: rec.trazado ? fecha : null,
        };
        let recorrido = await Recorrido.findOne({
          where: { linea_id: linea.id, sentido },
          transaction,
        });
        if (recorrido) await recorrido.update(valores, { transaction });
        else
          recorrido = await Recorrido.create(
            { linea_id: linea.id, sentido, ...valores },
            { transaction },
          );
        await RecorridoParadero.destroy({ where: { recorrido_id: recorrido.id }, transaction });
        await RecorridoParadero.bulkCreate(
          rec.paraderos.map((c, i) => ({
            recorrido_id: recorrido.id,
            orden: i + 1,
            paradero_id: paraderoId.get(c),
          })),
          { transaction },
        );
      }
    }

    if (desactivarOtros) {
      const [lineas] = await Linea.update(
        { estado_servicio: 'desactivada' },
        {
          where: { id: { [Op.notIn]: lineaIds }, estado_servicio: { [Op.ne]: 'desactivada' } },
          transaction,
        },
      );
      const [paraderos] = await Paradero.update(
        { activo: 0 },
        { where: { id: { [Op.notIn]: [...paraderoId.values()] }, activo: 1 }, transaction },
      );
      r.lineas_desactivadas = lineas;
      r.paraderos_desactivados = paraderos;
    }
    return r;
  });
}

module.exports = {
  generarYGuardar,
  leerCatalogo,
  aplicarCatalogo,
  resumir,
  revisarCatalogo,
  RUTAS,
};
