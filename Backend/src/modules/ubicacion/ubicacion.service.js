// VEH-01: el conductor comparte la ubicación GPS de su teléfono durante un viaje en curso.
// Con cada posición se calcula hasta qué paradero llegó el vehículo y se ponen al día las
// solicitudes de parada de los pasajeros (VIA-03).
const { notFound, conflict, badRequest, HttpError } = require('../../utils/httpErrors');
const { actualizarSolicitudes } = require('../viajes/solicitudes');
const { calcularAvance, MAXIMO_FUERA_DE_RECORRIDO_M } = require('./geo');

/** Una posición con más error que esto se guarda, pero no se usa para calcular el avance. */
const PRECISION_MAXIMA_M = 100;

/**
 * @param {ReturnType<import('../../database/models').initModels>} models
 * @param {{ ahora?: () => Date, permitirSimulacion?: boolean }} [opciones]
 *   `permitirSimulacion` acepta posiciones del simulador (solo en desarrollo).
 */
function createUbicacionService(
  models,
  { ahora = () => new Date(), permitirSimulacion = false } = {},
) {
  const { sequelize, Usuario, Turno, Viaje, Paradero, RecorridoParadero, UbicacionVehiculo } =
    models;
  const ahoraISO = () => ahora().toISOString();

  async function exigirConductor(id, transaction) {
    const u = await Usuario.findByPk(id, { transaction });
    if (!u || u.rol !== 'conductor')
      throw new HttpError(403, 'Esta acción es solo para conductores');
    if (u.estado !== 'habilitado')
      throw new HttpError(403, 'Tu cuenta de conductor no está habilitada');
  }

  /** El viaje solo si es de un turno del conductor (si no, responde como si no existiera). */
  async function viajePropio(conductorId, viajeId, transaction) {
    const viaje = await Viaje.findByPk(viajeId, {
      include: [{ model: Turno, as: 'turno' }],
      transaction,
    });
    if (!viaje || viaje.turno.conductor_id !== conductorId) throw notFound('El viaje no existe');
    return viaje;
  }

  /** Paraderos activos del recorrido, en orden, con sus coordenadas. */
  async function paraderosDelRecorrido(recorridoId, transaction) {
    const paradas = await RecorridoParadero.findAll({
      where: { recorrido_id: recorridoId },
      include: [{ model: Paradero, as: 'paradero' }],
      order: [['orden', 'ASC']],
      transaction,
    });
    return paradas.map((p) => ({
      orden: p.orden,
      id: p.paradero.id,
      codigo: p.paradero.codigo,
      nombre: p.paradero.nombre,
      latitud: p.paradero.latitud,
      longitud: p.paradero.longitud,
    }));
  }

  return {
    /**
     * Guarda una posición del vehículo y actualiza el avance del viaje.
     * @param {{ latitud: number, longitud: number, precision_m?: number, origen?: 'gps'|'simulador' }} posicion
     */
    async registrar(conductorId, viajeId, posicion) {
      const { latitud, longitud, precision_m: precision = null, origen = 'gps' } = posicion;
      if (origen === 'simulador' && !permitirSimulacion) {
        throw badRequest('El simulador de recorrido solo está disponible en desarrollo');
      }
      return sequelize.transaction(async (transaction) => {
        await exigirConductor(conductorId, transaction);
        const viaje = await viajePropio(conductorId, viajeId, transaction);
        if (viaje.estado !== 'en_curso') {
          throw conflict('La ubicación solo se comparte durante un viaje en curso');
        }

        const registradoEn = ahoraISO();
        await UbicacionVehiculo.create(
          {
            viaje_id: viaje.id,
            latitud,
            longitud,
            precision_m: precision,
            origen,
            registrado_en: registradoEn,
          },
          { transaction },
        );

        const paraderos = await paraderosDelRecorrido(viaje.recorrido_id, transaction);
        const precisa = precision === null || precision <= PRECISION_MAXIMA_M;
        const avance = precisa
          ? calcularAvance(paraderos, viaje.ultimo_orden_superado, { latitud, longitud })
          : { ultimoSuperado: viaje.ultimo_orden_superado, lejania: null };

        let cerradas = 0;
        if (avance.ultimoSuperado > viaje.ultimo_orden_superado) {
          await viaje.update({ ultimo_orden_superado: avance.ultimoSuperado }, { transaction });
          cerradas = await actualizarSolicitudes(models, viaje, ahoraISO, transaction);
        }

        const siguiente = paraderos.find((p) => p.orden > viaje.ultimo_orden_superado) ?? null;
        return {
          viaje_id: viaje.id,
          registrado_en: registradoEn,
          origen,
          ultimo_orden_superado: viaje.ultimo_orden_superado,
          siguiente_paradero: siguiente,
          // Se avisa para que el conductor sepa por qué no avanza (GPS impreciso o desvío).
          precision_insuficiente: !precisa,
          fuera_de_recorrido:
            avance.lejania !== null && avance.lejania > MAXIMO_FUERA_DE_RECORRIDO_M,
          solicitudes_cerradas: cerradas,
        };
      });
    },
  };
}

module.exports = { createUbicacionService, PRECISION_MAXIMA_M };
