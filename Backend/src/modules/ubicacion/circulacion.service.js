// RED-03: vehículos en circulación (público). ADM-04: monitoreo de la operación (administrador).
// Ambos se arman con los viajes en curso y la última ubicación que envió cada vehículo (VEH-01).
const { Op } = require('sequelize');
const { notFound } = require('../../utils/httpErrors');
const { distancia, crearRuta, proyectarEnRuta } = require('./geo');

/** Una ubicación más vieja que esto se muestra como atrasada (sin borrarla ni ocultar la micro). */
const UMBRAL_ATRASADA_S = 30;
/** Hasta dónde se buscan paraderos cercanos a una persona. */
const RADIO_CERCANOS_M = 1500;

/**
 * @param {ReturnType<import('../../database/models').initModels>} models
 * @param {{ ahora?: () => Date }} [opciones]
 */
function createCirculacionService(models, { ahora = () => new Date() } = {}) {
  const {
    Usuario,
    Linea,
    Recorrido,
    Paradero,
    RecorridoParadero,
    Vehiculo,
    Turno,
    Viaje,
    Incidencia,
    SolicitudParada,
    UbicacionVehiculo,
  } = models;

  /** Viajes en curso con su recorrido, línea, turno, vehículo y conductor. */
  async function viajesEnCurso({ lineaId } = {}) {
    return Viaje.findAll({
      where: { estado: 'en_curso' },
      include: [
        {
          model: Recorrido,
          as: 'recorrido',
          required: true,
          ...(lineaId ? { where: { linea_id: lineaId } } : {}),
          include: [{ model: Linea, as: 'linea' }],
        },
        {
          model: Turno,
          as: 'turno',
          include: [
            { model: Vehiculo, as: 'vehiculo' },
            { model: Usuario, as: 'conductor' },
          ],
        },
      ],
      order: [['id', 'ASC']],
    });
  }

  /** Paraderos de cada recorrido, en orden (se consulta una vez por recorrido). */
  async function paraderosPorRecorrido(recorridoIds) {
    const paradas = await RecorridoParadero.findAll({
      where: { recorrido_id: { [Op.in]: [...new Set(recorridoIds)] } },
      include: [{ model: Paradero, as: 'paradero' }],
      order: [
        ['recorrido_id', 'ASC'],
        ['orden', 'ASC'],
      ],
    });
    const porRecorrido = new Map();
    for (const p of paradas) {
      if (!porRecorrido.has(p.recorrido_id)) porRecorrido.set(p.recorrido_id, []);
      porRecorrido.get(p.recorrido_id).push({
        orden: p.orden,
        id: p.paradero.id,
        codigo: p.paradero.codigo,
        nombre: p.paradero.nombre,
        latitud: p.paradero.latitud,
        longitud: p.paradero.longitud,
      });
    }
    return porRecorrido;
  }

  /** La ubicación más reciente de cada viaje. */
  async function ultimasUbicaciones(viajeIds) {
    const ultimas = new Map();
    for (const id of viajeIds) {
      const u = await UbicacionVehiculo.findOne({
        where: { viaje_id: id },
        order: [['id', 'DESC']],
      });
      if (u) ultimas.set(id, u);
    }
    return ultimas;
  }

  /** Lo que se muestra de un vehículo en circulación (RED-03). */
  function presentar(viaje, paraderos, ubicacion) {
    const segundos = ubicacion
      ? Math.max(0, Math.round((ahora() - new Date(ubicacion.registrado_en)) / 1000))
      : null;
    const linea = viaje.recorrido.linea;
    return {
      viaje_id: viaje.id,
      vehiculo: { id: viaje.turno.vehiculo.id, identificador: viaje.turno.vehiculo.identificador },
      linea: { id: linea.id, codigo: linea.codigo, nombre: linea.nombre, color: linea.color },
      recorrido: {
        id: viaje.recorrido.id,
        sentido: viaje.recorrido.sentido,
        destino: paraderos.length ? paraderos[paraderos.length - 1].nombre : null,
      },
      ultima_ubicacion: ubicacion
        ? {
            latitud: ubicacion.latitud,
            longitud: ubicacion.longitud,
            registrado_en: ubicacion.registrado_en,
          }
        : null,
      segundos_desde_actualizacion: segundos,
      // Sin datos nuevos se conserva la última posición, avisando que está atrasada.
      ubicacion_atrasada: segundos === null || segundos > UMBRAL_ATRASADA_S,
      ultimo_orden_superado: viaje.ultimo_orden_superado,
      siguiente_paradero: paraderos.find((p) => p.orden > viaje.ultimo_orden_superado) ?? null,
    };
  }

  /** Viajes en curso ya presentados, con lo necesario para cálculos posteriores. */
  async function circulando(filtro) {
    const viajes = await viajesEnCurso(filtro);
    const paraderos = await paraderosPorRecorrido(viajes.map((v) => v.recorrido_id));
    const ubicaciones = await ultimasUbicaciones(viajes.map((v) => v.id));
    return viajes.map((viaje) => ({
      viaje,
      paraderos: paraderos.get(viaje.recorrido_id) ?? [],
      ubicacion: ubicaciones.get(viaje.id) ?? null,
    }));
  }

  return {
    /** RED-03: vehículos con un viaje en curso; con `lineaId`, solo los de esa línea. */
    async enCirculacion({ lineaId } = {}) {
      const lista = await circulando({ lineaId });
      return lista.map(({ viaje, paraderos, ubicacion }) => presentar(viaje, paraderos, ubicacion));
    },

    /**
     * Micros que todavía no pasan por un paradero y se dirigen a él, de la más cercana a la
     * más lejana: cuántos paraderos les faltan y cuántos metros, por el recorrido.
     */
    async proximasAParadero(paraderoId) {
      const paradero = await Paradero.findByPk(paraderoId);
      if (!paradero || !paradero.activo) throw notFound('El paradero no existe');
      const lista = await circulando();
      const proximas = [];
      for (const { viaje, paraderos, ubicacion } of lista) {
        const indice = paraderos.findIndex((p) => p.id === paradero.id);
        if (indice === -1 || paraderos[indice].orden <= viaje.ultimo_orden_superado) continue;
        let metros = null;
        if (ubicacion) {
          const desde = Math.max(
            paraderos.findIndex((p) => p.orden === viaje.ultimo_orden_superado),
            0,
          );
          // Metros por las calles (o en tramos rectos si el recorrido no tiene trazado).
          const ruta = crearRuta(paraderos, viaje.recorrido.trazado);
          const proyeccion = proyectarEnRuta(ruta, ubicacion, desde);
          if (proyeccion) {
            const faltan = ruta.posiciones[indice] - proyeccion.avance;
            metros = Math.max(0, Math.round(faltan));
          }
        }
        proximas.push({
          ...presentar(viaje, paraderos, ubicacion),
          paraderos_antes: paraderos[indice].orden - viaje.ultimo_orden_superado - 1,
          distancia_m: metros,
        });
      }
      return proximas.sort(
        (a, b) =>
          a.paraderos_antes - b.paraderos_antes ||
          (a.distancia_m ?? Infinity) - (b.distancia_m ?? Infinity),
      );
    },

    /** Paraderos activos más cercanos a un punto (hasta 1,5 km), del más cercano al más lejano. */
    async cercanos({ latitud, longitud, limite = 3 }) {
      const paraderos = await Paradero.findAll({ where: { activo: 1 } });
      return paraderos
        .map((p) => ({
          id: p.id,
          codigo: p.codigo,
          nombre: p.nombre,
          latitud: p.latitud,
          longitud: p.longitud,
          distancia_m: Math.round(distancia({ latitud, longitud }, p)),
        }))
        .filter((p) => p.distancia_m <= RADIO_CERCANOS_M)
        .sort((a, b) => a.distancia_m - b.distancia_m)
        .slice(0, limite);
    },

    /**
     * ADM-04: cada vehículo en circulación con su conductor y turno, su ubicación (atrasada o no),
     * los paraderos con solicitudes pendientes, el estado del vehículo y las incidencias del turno.
     * Sin señal no se da por ausente al conductor ni por terminado el viaje: solo se avisa.
     */
    async monitoreo() {
      const lista = await circulando();
      const viajeIds = lista.map((x) => x.viaje.id);
      const turnoIds = lista.map((x) => x.viaje.turno_id);

      const pendientes = await SolicitudParada.findAll({
        where: { viaje_id: { [Op.in]: viajeIds }, estado: { [Op.ne]: 'cerrada' } },
      });
      const incidencias = await Incidencia.findAll({
        where: { turno_id: { [Op.in]: turnoIds } },
        order: [['fecha', 'DESC']],
      });

      const vehiculos = lista.map(({ viaje, paraderos, ubicacion }) => {
        const grupos = new Map();
        for (const s of pendientes.filter((x) => x.viaje_id === viaje.id)) {
          const p = paraderos.find((x) => x.id === s.paradero_id);
          if (!p) continue;
          if (!grupos.has(p.id)) {
            grupos.set(p.id, {
              paradero: { id: p.id, codigo: p.codigo, nombre: p.nombre, orden: p.orden },
              total: 0,
            });
          }
          grupos.get(p.id).total++;
        }
        const { turno } = viaje;
        return {
          ...presentar(viaje, paraderos, ubicacion),
          conductor: { id: turno.conductor.id, nombre: turno.conductor.nombre_visible },
          turno: {
            id: turno.id,
            estado: turno.estado,
            inicio_planificado: turno.inicio_planificado,
            termino_planificado: turno.termino_planificado,
            inicio_real: turno.inicio_real,
          },
          estado_vehiculo: turno.vehiculo.estado_operativo,
          solicitudes_pendientes: [...grupos.values()].sort(
            (a, b) => a.paradero.orden - b.paradero.orden,
          ),
          incidencias: incidencias
            .filter((i) => i.turno_id === turno.id)
            .map((i) => ({ id: i.id, tipo: i.tipo, descripcion: i.descripcion, fecha: i.fecha })),
        };
      });

      return {
        resumen: {
          en_circulacion: vehiculos.length,
          con_ubicacion_atrasada: vehiculos.filter((v) => v.ubicacion_atrasada).length,
          con_incidencias: vehiculos.filter((v) => v.incidencias.length > 0).length,
          solicitudes_pendientes: pendientes.length,
        },
        vehiculos,
      };
    },
  };
}

module.exports = { createCirculacionService, UMBRAL_ATRASADA_S, RADIO_CERCANOS_M };
