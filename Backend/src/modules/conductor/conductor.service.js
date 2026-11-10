// VEH-03: cumplimiento de turnos y registro del estado del vehículo (vista del conductor).
const { notFound, conflict, HttpError } = require('../../utils/httpErrors');
const { turnoCompleto } = require('../turnos/turno-detalle');
const { evaluar } = require('./evaluacion');

/**
 * Ojo con las transacciones: con una sola conexión SQLite, toda consulta que se haga
 * dentro de una transacción debe recibir `{ transaction }`, o se queda esperando.
 * @param {ReturnType<import('../../database/models').initModels>} models
 * @param {{ ahora?: () => Date }} [opciones] `ahora` permite controlar el reloj en las pruebas
 */
function createConductorService(models, { ahora = () => new Date() } = {}) {
  const { sequelize, Usuario, Vehiculo, Turno, Viaje, Incidencia, HistorialEstadoVehiculo } = models;
  const ahoraISO = () => ahora().toISOString();

  /** Comprueba que quien consulta es un conductor habilitado. */
  async function exigirConductor(id, transaction) {
    const u = await Usuario.findByPk(id, { transaction });
    if (!u || u.rol !== 'conductor') throw new HttpError(403, 'Esta acción es solo para conductores');
    if (u.estado !== 'habilitado') throw new HttpError(403, 'Tu cuenta de conductor no está habilitada');
    return u;
  }

  /** Devuelve el turno solo si es del conductor (si no, responde como si no existiera). */
  async function turnoPropio(conductorId, turnoId, transaction) {
    const turno = await Turno.findByPk(turnoId, { transaction });
    if (!turno || turno.conductor_id !== conductorId) throw notFound('El turno no existe');
    return turno;
  }

  async function viajePropio(conductorId, viajeId, transaction) {
    const viaje = await Viaje.findByPk(viajeId, { transaction });
    if (!viaje) throw notFound('El viaje no existe');
    return { viaje, turno: await turnoPropio(conductorId, viaje.turno_id, transaction) };
  }

  const evaluaciones = (fila, margen) => ({
    inicio: evaluar(fila.inicio_planificado, fila.inicio_real, margen, false),
    termino: evaluar(fila.termino_planificado, fila.termino_real, margen, true),
  });

  /** El turno con la evaluación de puntualidad de él y de cada viaje (según el margen del turno). */
  async function detalle(turnoId, transaction) {
    const t = await turnoCompleto(models, turnoId, { transaction });
    const margen = t.margen_tolerancia_min;
    return {
      ...t,
      evaluacion: evaluaciones(t, margen),
      viajes: t.viajes.map((v) => ({ ...v, evaluacion: evaluaciones(v, margen) })),
    };
  }

  /** Registra (y deja en el historial) un cambio de estado del vehículo informado por el conductor. */
  async function cambiarEstadoVehiculo(vehiculoId, conductorId, estado, descripcion, transaction) {
    const vehiculo = await Vehiculo.findByPk(vehiculoId, { transaction });
    const anterior = vehiculo.estado_operativo;
    if (anterior !== estado || estado !== 'operativo') {
      await HistorialEstadoVehiculo.create(
        {
          vehiculo_id: vehiculoId,
          responsable_id: conductorId,
          estado_anterior: anterior,
          estado_nuevo: estado,
          motivo: descripcion || null,
          fecha: ahoraISO(),
        },
        { transaction },
      );
      await vehiculo.update({ estado_operativo: estado }, { transaction });
    }
    return estado;
  }

  /** Justificación de atraso / término anticipado. Las horas originales y reales no se tocan. */
  async function justificar(fila, turnoId, justificacion, transaction) {
    const turno = await Turno.findByPk(turnoId, { transaction });
    const { inicio, termino } = evaluaciones(fila, turno.margen_tolerancia_min);
    if (![inicio, termino].some((e) => e && e.estado !== 'a_tiempo')) {
      throw conflict('No hay atraso ni término anticipado que justificar');
    }
    await fila.update({ justificacion_atraso: justificacion }, { transaction });
    return detalle(turnoId, transaction);
  }

  return {
    async listarTurnos(conductorId, { fecha } = {}) {
      return sequelize.transaction(async (transaction) => {
        await exigirConductor(conductorId, transaction);
        const where = { conductor_id: conductorId };
        const turnos = await Turno.findAll({ where, order: [['inicio_planificado', 'ASC']], transaction });
        const delDia = fecha ? turnos.filter((t) => t.inicio_planificado.startsWith(fecha)) : turnos;
        return Promise.all(delDia.map((t) => detalle(t.id, transaction)));
      });
    },

    async obtenerTurno(conductorId, turnoId) {
      return sequelize.transaction(async (transaction) => {
        await exigirConductor(conductorId, transaction);
        await turnoPropio(conductorId, turnoId, transaction);
        return detalle(turnoId, transaction);
      });
    },

    async iniciarTurno(conductorId, turnoId, { estado_vehiculo: estadoVehiculo, descripcion }) {
      return sequelize.transaction(async (transaction) => {
        await exigirConductor(conductorId, transaction);
        const turno = await turnoPropio(conductorId, turnoId, transaction);
        if (turno.estado !== 'programado') throw conflict('El turno ya fue iniciado o finalizado');
        const otro = await Turno.findOne({ where: { conductor_id: conductorId, estado: 'en_curso' }, transaction });
        if (otro) throw conflict('Ya tienes un turno en curso; finalízalo antes de iniciar otro');
        const vehiculo = await Vehiculo.findByPk(turno.vehiculo_id, { transaction });
        if (!vehiculo.habilitado || vehiculo.estado_operativo === 'en_mantenimiento') {
          throw conflict('El vehículo no está disponible (mantenimiento o deshabilitado). Contacta al administrador');
        }
        await cambiarEstadoVehiculo(turno.vehiculo_id, conductorId, estadoVehiculo, descripcion, transaction);
        await turno.update(
          { estado: 'en_curso', inicio_real: ahoraISO(), estado_vehiculo_recibido: estadoVehiculo },
          { transaction },
        );
        return detalle(turnoId, transaction);
      });
    },

    async finalizarTurno(conductorId, turnoId, { estado_vehiculo: estadoVehiculo, descripcion }) {
      return sequelize.transaction(async (transaction) => {
        await exigirConductor(conductorId, transaction);
        const turno = await turnoPropio(conductorId, turnoId, transaction);
        if (turno.estado !== 'en_curso') throw conflict('Solo se puede finalizar un turno en curso');
        if (await Viaje.findOne({ where: { turno_id: turnoId, estado: 'en_curso' }, transaction })) {
          throw conflict('Hay un viaje en curso; finalízalo antes de cerrar el turno');
        }
        await cambiarEstadoVehiculo(turno.vehiculo_id, conductorId, estadoVehiculo, descripcion, transaction);
        await turno.update(
          { estado: 'finalizado', termino_real: ahoraISO(), estado_vehiculo_entregado: estadoVehiculo },
          { transaction },
        );
        return detalle(turnoId, transaction);
      });
    },

    async iniciarViaje(conductorId, viajeId) {
      return sequelize.transaction(async (transaction) => {
        await exigirConductor(conductorId, transaction);
        const { viaje, turno } = await viajePropio(conductorId, viajeId, transaction);
        if (turno.estado !== 'en_curso') throw conflict('Primero debes iniciar el turno');
        if (viaje.estado !== 'programado') throw conflict('El viaje ya fue iniciado o finalizado');
        const vehiculo = await Vehiculo.findByPk(turno.vehiculo_id, { transaction });
        if (['fuera_de_servicio', 'en_mantenimiento'].includes(vehiculo.estado_operativo)) {
          throw conflict('Un vehículo fuera de servicio no puede iniciar nuevos viajes');
        }
        const anteriores = await Viaje.findAll({ where: { turno_id: turno.id }, order: [['orden_en_turno', 'ASC']], transaction });
        const pendiente = anteriores.find((v) => v.orden_en_turno < viaje.orden_en_turno && v.estado !== 'finalizado');
        if (pendiente) throw conflict(`Primero debes finalizar el viaje ${pendiente.orden_en_turno}`);
        await viaje.update({ estado: 'en_curso', inicio_real: ahoraISO() }, { transaction });
        return detalle(turno.id, transaction);
      });
    },

    async finalizarViaje(conductorId, viajeId) {
      return sequelize.transaction(async (transaction) => {
        await exigirConductor(conductorId, transaction);
        const { viaje, turno } = await viajePropio(conductorId, viajeId, transaction);
        if (viaje.estado !== 'en_curso') throw conflict('Solo se puede finalizar un viaje en curso');
        // Finalizar un viaje NO cierra el turno (el turno puede tener más viajes).
        await viaje.update({ estado: 'finalizado', termino_real: ahoraISO() }, { transaction });
        return detalle(turno.id, transaction);
      });
    },

    async cambiarEstado(conductorId, turnoId, { estado_vehiculo: estadoVehiculo, descripcion }) {
      return sequelize.transaction(async (transaction) => {
        await exigirConductor(conductorId, transaction);
        const turno = await turnoPropio(conductorId, turnoId, transaction);
        if (turno.estado !== 'en_curso') throw conflict('Solo se puede informar el estado durante un turno en curso');
        await cambiarEstadoVehiculo(turno.vehiculo_id, conductorId, estadoVehiculo, descripcion, transaction);
        return detalle(turnoId, transaction);
      });
    },

    async registrarIncidencia(conductorId, turnoId, { tipo, descripcion }) {
      return sequelize.transaction(async (transaction) => {
        await exigirConductor(conductorId, transaction);
        const turno = await turnoPropio(conductorId, turnoId, transaction);
        if (turno.estado !== 'en_curso') throw conflict('Solo se pueden registrar incidencias durante un turno en curso');
        const incidencia = await Incidencia.create(
          { conductor_id: conductorId, vehiculo_id: turno.vehiculo_id, turno_id: turnoId, tipo, descripcion, fecha: ahoraISO() },
          { transaction },
        );
        return incidencia.get({ plain: true });
      });
    },

    async justificarTurno(conductorId, turnoId, { justificacion }) {
      return sequelize.transaction(async (transaction) => {
        await exigirConductor(conductorId, transaction);
        const turno = await turnoPropio(conductorId, turnoId, transaction);
        return justificar(turno, turnoId, justificacion, transaction);
      });
    },

    async justificarViaje(conductorId, viajeId, { justificacion }) {
      return sequelize.transaction(async (transaction) => {
        await exigirConductor(conductorId, transaction);
        const { viaje, turno } = await viajePropio(conductorId, viajeId, transaction);
        return justificar(viaje, turno.id, justificacion, transaction);
      });
    },

    // ── Consultas del administrador ──
    async listarIncidencias({ turno_id: turnoId, vehiculo_id: vehiculoId } = {}) {
      const where = {};
      if (turnoId) where.turno_id = turnoId;
      if (vehiculoId) where.vehiculo_id = vehiculoId;
      const filas = await Incidencia.findAll({
        where,
        include: [
          { model: Usuario, as: 'conductor' },
          { model: Vehiculo, as: 'vehiculo' },
        ],
        order: [['fecha', 'DESC'], ['id', 'DESC']],
      });
      return filas.map((i) => {
        const { conductor, vehiculo, ...datos } = i.get({ plain: true });
        return { ...datos, conductor_nombre: conductor.nombre_visible, vehiculo_identificador: vehiculo.identificador };
      });
    },

    async historialVehiculo(vehiculoId) {
      if (!(await Vehiculo.findByPk(vehiculoId))) throw notFound('El vehículo no existe');
      const filas = await HistorialEstadoVehiculo.findAll({
        where: { vehiculo_id: vehiculoId },
        include: [{ model: Usuario, as: 'responsable' }],
        order: [['fecha', 'DESC'], ['id', 'DESC']],
      });
      return filas.map((h) => {
        const { responsable, ...datos } = h.get({ plain: true });
        return { ...datos, responsable_nombre: responsable.nombre_visible };
      });
    },
  };
}

module.exports = { createConductorService };