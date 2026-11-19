// VIA-02: selección de destino y solicitud digital de parada (vista del pasajero).
const { Op, UniqueConstraintError } = require('sequelize');
const { notFound, conflict, badRequest, HttpError } = require('../../utils/httpErrors');
const { actualizarSolicitudes } = require('./solicitudes');

const TEXTO_CIERRE = {
  paradero_superado: 'El vehículo ya superó tu paradero',
  viaje_finalizado: 'El viaje finalizó',
  pasajero_desvinculado: 'Te desvinculaste del vehículo',
};

/**
 * @param {ReturnType<import('../../database/models').initModels>} models
 * @param {{ ahora?: () => Date }} [opciones] `ahora` permite controlar el reloj en las pruebas
 */
function createViajesService(models, { ahora = () => new Date() } = {}) {
  const {
    sequelize,
    Usuario,
    Paradero,
    Recorrido,
    Linea,
    Viaje,
    Turno,
    Vehiculo,
    RecorridoParadero,
    SolicitudParada,
    UbicacionVehiculo,
    Vinculacion,
  } = models;
  const ahoraISO = () => ahora().toISOString();
  const abierta = { [Op.ne]: 'cerrada' };

  async function exigirPasajero(id, transaction) {
    const u = await Usuario.findByPk(id, { transaction });
    if (!u || u.rol !== 'pasajero') throw new HttpError(403, 'Esta acción es solo para pasajeros');
    if (u.estado !== 'habilitado') throw new HttpError(403, 'Tu cuenta no está habilitada');
    return u;
  }

  /** VIA-01: solo quien está vinculado a un viaje puede elegir destino y pedir parada en él. */
  async function exigirVinculado(pasajeroId, viajeId, transaction) {
    const v = await Vinculacion.findOne({
      where: { pasajero_id: pasajeroId, viaje_id: viajeId, terminada_en: { [Op.is]: null } },
      transaction,
    });
    if (!v) {
      throw new HttpError(
        403,
        'Primero vincúlate a esta micro escaneando su código QR o escribiendo su código',
        { code: 'NO_VINCULADO' },
      );
    }
  }

  /** El viaje, solo si está en curso (404 si no existe, 409 si no está en curso). */
  async function viajeEnCurso(viajeId, transaction) {
    const viaje = await Viaje.findByPk(viajeId, {
      include: [{ model: Recorrido, as: 'recorrido', include: [{ model: Linea, as: 'linea' }] }],
      transaction,
    });
    if (!viaje) throw notFound('El viaje no existe');
    if (viaje.estado !== 'en_curso') throw conflict('El viaje no está en curso');
    return viaje;
  }

  const presentarParadero = (paradero, orden) => ({
    orden,
    id: paradero.id,
    codigo: paradero.codigo,
    nombre: paradero.nombre,
    latitud: paradero.latitud,
    longitud: paradero.longitud,
  });

  const presentarSolicitud = (s, paradero, orden) => ({
    id: s.id,
    viaje_id: s.viaje_id,
    estado: s.estado,
    motivo_cierre: s.motivo_cierre,
    motivo_cierre_texto: s.motivo_cierre ? TEXTO_CIERRE[s.motivo_cierre] : null,
    creada_en: s.creada_en,
    cerrada_en: s.cerrada_en,
    paradero: { id: paradero.id, codigo: paradero.codigo, nombre: paradero.nombre, orden },
  });

  /** La solicitud más reciente del pasajero en ese viaje (abierta o cerrada), o null. */
  async function ultimaSolicitud(pasajeroId, viaje, transaction) {
    const s = await SolicitudParada.findOne({
      where: { viaje_id: viaje.id, pasajero_id: pasajeroId },
      include: [{ model: Paradero, as: 'paradero' }],
      order: [['id', 'DESC']],
      transaction,
    });
    if (!s) return null;
    const parada = await RecorridoParadero.findOne({
      where: { recorrido_id: viaje.recorrido_id, paradero_id: s.paradero_id },
      transaction,
    });
    return presentarSolicitud(s, s.paradero, parada?.orden ?? null);
  }

  return {
    /** Paraderos del recorrido que el vehículo todavía no ha superado, en orden. */
    async paraderosDisponibles(pasajeroId, viajeId) {
      return sequelize.transaction(async (transaction) => {
        await exigirPasajero(pasajeroId, transaction);
        const viaje = await viajeEnCurso(viajeId, transaction);
        await exigirVinculado(pasajeroId, viaje.id, transaction);
        const paradas = await RecorridoParadero.findAll({
          where: {
            recorrido_id: viaje.recorrido_id,
            orden: { [Op.gt]: viaje.ultimo_orden_superado },
          },
          include: [{ model: Paradero, as: 'paradero', where: { activo: 1 } }],
          order: [['orden', 'ASC']],
          transaction,
        });
        return {
          viaje: {
            id: viaje.id,
            estado: viaje.estado,
            sentido: viaje.recorrido.sentido,
            linea_codigo: viaje.recorrido.linea.codigo,
            linea_nombre: viaje.recorrido.linea.nombre,
            ultimo_orden_superado: viaje.ultimo_orden_superado,
          },
          paraderos: paradas.map((p) => presentarParadero(p.paradero, p.orden)),
          mi_solicitud: await ultimaSolicitud(pasajeroId, viaje, transaction),
        };
      });
    },

    /** "Solicitar parada": guarda el aviso. Una sola solicitud pendiente por pasajero y viaje. */
    async solicitarParada(pasajeroId, viajeId, { paradero_id: paraderoId }) {
      try {
        return await sequelize.transaction(async (transaction) => {
          await exigirPasajero(pasajeroId, transaction);
          const viaje = await viajeEnCurso(viajeId, transaction);
          await exigirVinculado(pasajeroId, viaje.id, transaction);
          const parada = await RecorridoParadero.findOne({
            where: { recorrido_id: viaje.recorrido_id, paradero_id: paraderoId },
            include: [{ model: Paradero, as: 'paradero', where: { activo: 1 } }],
            transaction,
          });
          if (!parada) throw badRequest('Ese paradero no pertenece al recorrido de este viaje');
          if (parada.orden <= viaje.ultimo_orden_superado)
            throw conflict('El vehículo ya superó ese paradero');
          const pendiente = await SolicitudParada.findOne({
            where: { viaje_id: viajeId, pasajero_id: pasajeroId, estado: abierta },
            transaction,
          });
          if (pendiente)
            throw conflict('Ya tienes una solicitud de parada pendiente en este viaje');

          const solicitud = await SolicitudParada.create(
            {
              viaje_id: viajeId,
              pasajero_id: pasajeroId,
              paradero_id: paraderoId,
              estado: parada.orden === viaje.ultimo_orden_superado + 1 ? 'proxima' : 'enviada',
              creada_en: ahoraISO(),
            },
            { transaction },
          );
          return presentarSolicitud(solicitud, parada.paradero, parada.orden);
        });
      } catch (err) {
        // Dos envíos simultáneos: la base (índice único parcial) deja pasar solo uno.
        if (err instanceof UniqueConstraintError)
          throw conflict('Ya tienes una solicitud de parada pendiente en este viaje');
        throw err;
      }
    },

    /** Mi solicitud en este viaje (la más reciente) o null si no he pedido ninguna. */
    async miSolicitud(pasajeroId, viajeId) {
      return sequelize.transaction(async (transaction) => {
        await exigirPasajero(pasajeroId, transaction);
        const viaje = await Viaje.findByPk(viajeId, { transaction });
        if (!viaje) throw notFound('El viaje no existe');
        return ultimaSolicitud(pasajeroId, viaje, transaction);
      });
    },

    /**
     * SIMULADOR (solo desarrollo): viajes en curso, para pruebas.
     */
    async viajesEnCurso() {
      const viajes = await Viaje.findAll({
        where: { estado: 'en_curso' },
        include: [
          { model: Recorrido, as: 'recorrido', include: [{ model: Linea, as: 'linea' }] },
          { model: Turno, as: 'turno', include: [{ model: Vehiculo, as: 'vehiculo' }] },
        ],
        order: [['id', 'ASC']],
      });
      return viajes.map((v) => ({
        id: v.id,
        linea_codigo: v.recorrido.linea.codigo,
        linea_nombre: v.recorrido.linea.nombre,
        sentido: v.recorrido.sentido,
        vehiculo_identificador: v.turno.vehiculo.identificador,
        ultimo_orden_superado: v.ultimo_orden_superado,
      }));
    },

    /**
     * SIMULADOR (solo desarrollo): el vehículo avanza hasta el siguiente paradero.
     * Reemplaza al GPS real del conductor mientras no exista, y deja la posición registrada.
     */
    async simularAvance(viajeId) {
      return sequelize.transaction(async (transaction) => {
        const viaje = await viajeEnCurso(viajeId, transaction);
        const siguiente = await RecorridoParadero.findOne({
          where: { recorrido_id: viaje.recorrido_id, orden: viaje.ultimo_orden_superado + 1 },
          include: [{ model: Paradero, as: 'paradero' }],
          transaction,
        });
        if (!siguiente) throw conflict('El vehículo ya superó el último paradero del recorrido');
        await viaje.update({ ultimo_orden_superado: siguiente.orden }, { transaction });
        await UbicacionVehiculo.create(
          {
            viaje_id: viajeId,
            latitud: siguiente.paradero.latitud,
            longitud: siguiente.paradero.longitud,
            registrado_en: ahoraISO(),
          },
          { transaction },
        );
        const cerradas = await actualizarSolicitudes(models, viaje, ahoraISO, transaction);
        return {
          viaje_id: viaje.id,
          ultimo_orden_superado: viaje.ultimo_orden_superado,
          paradero_superado: presentarParadero(siguiente.paradero, siguiente.orden),
          solicitudes_cerradas: cerradas,
        };
      });
    },
  };
}

module.exports = { createViajesService };
