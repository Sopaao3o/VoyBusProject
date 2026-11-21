// ADM-01: el administrador cambia la red desde la app.
//  - "generar": el servidor descarga las calles de Antofagasta (OpenStreetMap), traza las
//    líneas reales por las calles (OSRM), guarda el catálogo y lo aplica. Tarda un par de
//    minutos, así que corre en segundo plano y la app consulta el avance.
//  - "archivo": aplica el catálogo ya generado (instantáneo, sin internet).
//  - "prueba": vuelve a la red pequeña de demostración.
// Solo hay una importación a la vez. Nada se borra: lo que no es de la red elegida se desactiva.
const { Op } = require('sequelize');
const { conflict, notFound } = require('../../../utils/httpErrors');
const catalogoAntofagasta = require('./catalogo');

/**
 * @param {ReturnType<import('../../../database/models').initModels>} models
 * @param {object} [opciones]
 * @param {() => Date} [opciones.ahora]
 * @param {() => object} [opciones.catalogoPrueba] la red de prueba (de datos-ejemplo.js)
 * @param {object} [opciones.fuentes] reemplazos para las pruebas (ver generarYGuardar)
 */
function createImportacionRed(models, { ahora = () => new Date(), catalogoPrueba, fuentes } = {}) {
  const leer = () => catalogoAntofagasta.leerCatalogo(fuentes?.rutas?.catalogo);
  let tarea = { estado: 'inactiva' };

  /** Cuál red está activa: la de Antofagasta si hay paraderos suyos activos. */
  async function redActual() {
    const { Paradero } = models;
    const deAntofagasta = await Paradero.count({
      where: { codigo: { [Op.like]: 'AF-%' }, activo: 1 },
    });
    return deAntofagasta > 0 ? 'antofagasta' : 'prueba';
  }

  async function aplicar(catalogo) {
    return catalogoAntofagasta.aplicarCatalogo(models, catalogo, { ahora });
  }

  /** Revisa que se pueda cambiar la red ahora (para no partir una descarga larga en vano). */
  async function exigirSinViajes() {
    const enCurso = await models.Viaje.count({ where: { estado: 'en_curso' } });
    if (enCurso > 0) {
      throw conflict(
        `Hay ${enCurso} ${enCurso === 1 ? 'viaje' : 'viajes'} en curso: la red se podrá cambiar cuando ${enCurso === 1 ? 'termine' : 'terminen'} (si es el simulador de flota, detenlo primero).`,
        { code: 'VIAJES_EN_CURSO' },
      );
    }
  }

  return {
    async estado() {
      return {
        red_actual: await redActual(),
        archivo: catalogoAntofagasta.resumir(leer()),
        tarea,
      };
    },

    /** Genera la red real en segundo plano. Responde de inmediato; el avance se consulta. */
    async generar({ descargar = false } = {}) {
      if (tarea.estado === 'en_curso')
        throw conflict('Ya se está generando la red. Espera a que termine.');
      await exigirSinViajes();
      tarea = {
        estado: 'en_curso',
        fase: 'descargando',
        mensaje: 'Preparando…',
        hechos: 0,
        total: 0,
        avisos: [],
        iniciada_en: ahora().toISOString(),
      };
      const actual = tarea;
      const proceso = (async () => {
        try {
          const { catalogo, avisos } = await catalogoAntofagasta.generarYGuardar({
            descargar,
            fuentes,
            informar: (texto) => {
              actual.mensaje = texto;
            },
            progreso: (hechos, total) => {
              actual.fase = 'trazando';
              actual.hechos = hechos;
              actual.total = total;
            },
          });
          actual.fase = 'aplicando';
          actual.mensaje = 'Cargando la red en la base…';
          const resultado = await aplicar(catalogo);
          Object.assign(actual, {
            estado: 'lista',
            fase: 'lista',
            mensaje: `Red de Antofagasta lista: ${catalogo.lineas.length} líneas y ${catalogo.paraderos.length} paraderos.`,
            avisos,
            resultado,
            terminada_en: ahora().toISOString(),
          });
        } catch (err) {
          Object.assign(actual, {
            estado: 'error',
            mensaje: err.message || 'No se pudo generar la red.',
            terminada_en: ahora().toISOString(),
          });
        }
      })();
      return { tarea: actual, proceso };
    },

    /** Carga el catálogo ya generado. */
    async cargarArchivo() {
      const catalogo = leer();
      if (!catalogo) throw notFound('Todavía no se genera la red de Antofagasta: usa "Generar".');
      if (tarea.estado === 'en_curso')
        throw conflict('Se está generando la red. Espera a que termine.');
      return aplicar(catalogo);
    },

    /** Vuelve a la red de prueba. */
    async volverAPrueba() {
      if (tarea.estado === 'en_curso')
        throw conflict('Se está generando la red. Espera a que termine.');
      return aplicar(catalogoPrueba());
    },
  };
}

module.exports = { createImportacionRed };
