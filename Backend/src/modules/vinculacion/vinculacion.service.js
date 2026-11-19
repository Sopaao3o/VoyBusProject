// VIA-01: vinculación del pasajero (registrado o invitado) con el vehículo en que viaja,
// escaneando el QR del vehículo o escribiendo su código. Una sola vinculación activa a la vez.
const { Op, UniqueConstraintError } = require('sequelize');
const { notFound, conflict, HttpError } = require('../../utils/httpErrors');

/**
 * El código impreso en el vehículo es su identificador (ej. "BUS-01"). El QR contiene
 * "voybus://vehiculo/BUS-01"; se acepta cualquiera de las dos formas, con o sin mayúsculas.
 */
function normalizarCodigo(texto) {
  const limpio = String(texto).trim();
  const ultimo = limpio.split('/').filter(Boolean).pop() ?? '';
  return ultimo.replace(/\s+/g, '').toUpperCase();
}

/**
 * @param {ReturnType<import('../../database/models').initModels>} models
 * @param {{ ahora?: () => Date }} [opciones]
 */
function createVinculacionService(models, { ahora = () => new Date() } = {}) {
  const {
    sequelize,
    Usuario,
    Vehiculo,
    Turno,
    Viaje,
    Recorrido,
    Linea,
    RecorridoParadero,
    Paradero,
    SolicitudParada,
    Vinculacion,
  } = models;
  const ahoraISO = () => ahora().toISOString();

  async function exigirPasajero(id, transaction) {
    const u = await Usuario.findByPk(id, { transaction });
    if (!u || u.rol !== 'pasajero') throw new HttpError(403, 'Esta acción es solo para pasajeros');
    if (u.estado !== 'habilitado') throw new HttpError(403, 'Tu cuenta no está habilitada');
  }

  /** Lo que el pasajero ve para confirmar: vehículo, línea y sentido. */
  async function presentar(viaje, transaction) {
    const recorrido = await Recorrido.findByPk(viaje.recorrido_id, {
      include: [{ model: Linea, as: 'linea' }],
      transaction,
    });
    const turno = await Turno.findByPk(viaje.turno_id, {
      include: [{ model: Vehiculo, as: 'vehiculo' }],
      transaction,
    });
    const ultima = await RecorridoParadero.findOne({
      where: { recorrido_id: recorrido.id },
      include: [{ model: Paradero, as: 'paradero' }],
      order: [['orden', 'DESC']],
      transaction,
    });
    return {
      viaje_id: viaje.id,
      vehiculo: { id: turno.vehiculo.id, identificador: turno.vehiculo.identificador },
      linea: {
        id: recorrido.linea.id,
        codigo: recorrido.linea.codigo,
        nombre: recorrido.linea.nombre,
        color: recorrido.linea.color,
      },
      recorrido: { id: recorrido.id, sentido: recorrido.sentido },
      destino: ultima?.paradero.nombre ?? null,
    };
  }

  /** El viaje en curso del vehículo con ese código, o el motivo por el que no se puede vincular. */
  async function viajeDelVehiculo(codigo, transaction) {
    const identificador = normalizarCodigo(codigo);
    const vehiculo = await Vehiculo.findOne({ where: { identificador }, transaction });
    if (!vehiculo) throw notFound(`No existe un vehículo con el código ${identificador}`);
    const viaje = await Viaje.findOne({
      where: { estado: 'en_curso' },
      include: [{ model: Turno, as: 'turno', where: { vehiculo_id: vehiculo.id } }],
      transaction,
    });
    if (!viaje) {
      throw conflict(`El vehículo ${identificador} no está realizando un viaje en este momento`);
    }
    return viaje;
  }

  /**
   * La vinculación activa del pasajero. Si su viaje ya terminó (por ejemplo, el conductor lo
   * finalizó mientras el pasajero no tenía la app abierta), se cierra en ese momento.
   */
  async function activa(pasajeroId, transaction) {
    const v = await Vinculacion.findOne({
      where: { pasajero_id: pasajeroId, terminada_en: { [Op.is]: null } },
      include: [{ model: Viaje, as: 'viaje' }],
      transaction,
    });
    if (v && v.viaje.estado !== 'en_curso') {
      await v.update(
        { terminada_en: ahoraISO(), motivo_termino: 'viaje_finalizado' },
        { transaction },
      );
      return null;
    }
    return v;
  }

  const conDatos = async (v, transaction) => ({
    id: v.id,
    creada_en: v.creada_en,
    ...(await presentar(v.viaje, transaction)),
  });

  return {
    normalizarCodigo,

    /** Consulta el vehículo antes de confirmar (no vincula). */
    async consultar(pasajeroId, codigo) {
      return sequelize.transaction(async (transaction) => {
        await exigirPasajero(pasajeroId, transaction);
        const viaje = await viajeDelVehiculo(codigo, transaction);
        return presentar(viaje, transaction);
      });
    },

    /** Vincula al pasajero con el viaje en curso del vehículo. */
    async vincular(pasajeroId, codigo) {
      try {
        return await sequelize.transaction(async (transaction) => {
          await exigirPasajero(pasajeroId, transaction);
          const viaje = await viajeDelVehiculo(codigo, transaction);
          const actual = await activa(pasajeroId, transaction);
          if (actual) {
            if (actual.viaje_id === viaje.id)
              return { ...(await conDatos(actual, transaction)), nueva: false };
            const datos = await presentar(actual.viaje, transaction);
            throw conflict(
              `Ya estás vinculado a la micro ${datos.vehiculo.identificador} (línea ${datos.linea.codigo}). Termina esa vinculación antes de cambiar de vehículo.`,
            );
          }
          const nueva = await Vinculacion.create(
            { pasajero_id: pasajeroId, viaje_id: viaje.id, creada_en: ahoraISO() },
            { transaction },
          );
          nueva.viaje = viaje;
          return { ...(await conDatos(nueva, transaction)), nueva: true };
        });
      } catch (err) {
        // Dos peticiones a la vez: el índice único deja pasar solo una.
        if (err instanceof UniqueConstraintError) {
          throw conflict(
            'Ya tienes una vinculación activa. Termina esa antes de cambiar de vehículo.',
          );
        }
        throw err;
      }
    },

    /** La vinculación activa del pasajero, o null. */
    async actual(pasajeroId) {
      return sequelize.transaction(async (transaction) => {
        await exigirPasajero(pasajeroId, transaction);
        const v = await activa(pasajeroId, transaction);
        return v ? conDatos(v, transaction) : null;
      });
    },

    /**
     * El pasajero se desvincula ("me bajé" o "me equivoqué de micro"). Su solicitud de parada
     * pendiente en ese viaje se cierra, para que el conductor no se detenga por nadie.
     */
    async desvincular(pasajeroId) {
      return sequelize.transaction(async (transaction) => {
        await exigirPasajero(pasajeroId, transaction);
        const v = await activa(pasajeroId, transaction);
        if (!v) throw notFound('No estás vinculado a ninguna micro');
        await v.update(
          { terminada_en: ahoraISO(), motivo_termino: 'desvinculado' },
          { transaction },
        );
        await SolicitudParada.update(
          { estado: 'cerrada', motivo_cierre: 'pasajero_desvinculado', cerrada_en: ahoraISO() },
          {
            where: {
              viaje_id: v.viaje_id,
              pasajero_id: pasajeroId,
              estado: { [Op.ne]: 'cerrada' },
            },
            transaction,
          },
        );
        return { viaje_id: v.viaje_id, terminada_en: v.terminada_en };
      });
    },
  };
}

module.exports = { createVinculacionService, normalizarCodigo };
