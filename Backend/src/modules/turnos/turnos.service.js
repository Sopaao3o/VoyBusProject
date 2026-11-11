// ADM-03: gestión de turnos y asignaciones (lógica de negocio).
const { Op } = require('sequelize');
const { badRequest, notFound, conflict } = require('../../utils/httpErrors');
const { turnoCompleto } = require('./turno-detalle');

const VEHICULO_ASIGNABLE = ['operativo', 'operativo_con_observaciones'];

/** @param {ReturnType<import('../../database/models').initModels>} models */
function createTurnosService(models) {
  const { sequelize, Usuario, Vehiculo, Recorrido, Linea, Turno, Viaje, Configuracion } = models;

  /** Reglas que necesitan consultar la base. (Las de formato ya las revisó Zod.) */
  async function validarReglas(d, excluirId, transaction) {
    const conductor = await Usuario.findByPk(d.conductor_id, { transaction });
    if (!conductor || conductor.rol !== 'conductor')
      throw badRequest('El conductor indicado no existe');
    if (conductor.estado !== 'habilitado')
      throw conflict('Solo se pueden asignar conductores habilitados');

    const vehiculo = await Vehiculo.findByPk(d.vehiculo_id, { transaction });
    if (!vehiculo) throw badRequest('El vehículo indicado no existe');
    if (!vehiculo.habilitado || !VEHICULO_ASIGNABLE.includes(vehiculo.estado_operativo)) {
      throw conflict('Solo se pueden asignar vehículos operativos (con o sin observaciones)');
    }

    // Dos turnos se superponen si uno empieza antes de que el otro termine, y viceversa.
    const solapa = (columna, valor) =>
      Turno.findOne({
        where: {
          [columna]: valor,
          id: { [Op.ne]: excluirId },
          inicio_planificado: { [Op.lt]: d.termino_planificado },
          termino_planificado: { [Op.gt]: d.inicio_planificado },
        },
        transaction,
      });
    if (await solapa('conductor_id', d.conductor_id)) {
      throw conflict('El conductor ya tiene un turno que se superpone con ese horario');
    }
    if (await solapa('vehiculo_id', d.vehiculo_id)) {
      throw conflict('El vehículo ya tiene un turno que se superpone con ese horario');
    }

    for (const [i, v] of d.viajes.entries()) {
      const recorrido = await Recorrido.findByPk(v.recorrido_id, {
        include: [{ model: Linea, as: 'linea' }],
        transaction,
      });
      if (!recorrido || !recorrido.activo) throw badRequest(`viajes[${i}]: el recorrido no existe`);
      if (recorrido.linea.estado_servicio !== 'activa')
        throw conflict(`viajes[${i}]: la línea no está activa`);
    }
  }

  const guardarViajes = (turnoId, viajes, transaction) =>
    Viaje.bulkCreate(
      viajes.map((v, i) => ({
        turno_id: turnoId,
        orden_en_turno: i + 1,
        ...v,
      })),
      { transaction },
    );

  return {
    async crear(datos) {
      return sequelize.transaction(async (transaction) => {
        await validarReglas(datos, 0, transaction);
        // Cada turno guarda su propio margen; si no se indica, se usa el valor por defecto del sistema.
        const margen =
          datos.margen_tolerancia_min ??
          (await Configuracion.findByPk(1, { transaction })).margen_tolerancia_min;
        const turno = await Turno.create(
          {
            conductor_id: datos.conductor_id,
            vehiculo_id: datos.vehiculo_id,
            inicio_planificado: datos.inicio_planificado,
            termino_planificado: datos.termino_planificado,
            margen_tolerancia_min: margen,
          },
          { transaction },
        );
        await guardarViajes(turno.id, datos.viajes, transaction);
        return turnoCompleto(models, turno.id, { transaction });
      });
    },

    async modificar(id, datos) {
      return sequelize.transaction(async (transaction) => {
        const turno = await Turno.findByPk(id, { transaction });
        if (!turno) throw notFound('El turno no existe');
        if (turno.estado !== 'programado')
          throw conflict('Solo se pueden modificar turnos que aún no han comenzado');
        await validarReglas(datos, id, transaction);
        await turno.update(
          {
            conductor_id: datos.conductor_id,
            vehiculo_id: datos.vehiculo_id,
            inicio_planificado: datos.inicio_planificado,
            termino_planificado: datos.termino_planificado,
            margen_tolerancia_min: datos.margen_tolerancia_min ?? turno.margen_tolerancia_min,
          },
          { transaction },
        );
        await Viaje.destroy({ where: { turno_id: id }, transaction });
        await guardarViajes(id, datos.viajes, transaction);
        return turnoCompleto(models, id, { transaction });
      });
    },

    async obtener(id) {
      const turno = await turnoCompleto(models, id);
      if (!turno) throw notFound('El turno no existe');
      return turno;
    },

    async listar({ fecha, conductor_id: conductorId } = {}) {
      const where = {};
      if (fecha) where.inicio_planificado = { [Op.like]: `${fecha}%` };
      if (conductorId) where.conductor_id = conductorId;
      const turnos = await Turno.findAll({
        where,
        include: [
          { model: Usuario, as: 'conductor' },
          { model: Vehiculo, as: 'vehiculo' },
        ],
        order: [['inicio_planificado', 'ASC']],
      });
      return turnos.map((t) => ({
        id: t.id,
        conductor_id: t.conductor_id,
        conductor_nombre: t.conductor.nombre_visible,
        vehiculo_id: t.vehiculo_id,
        vehiculo_identificador: t.vehiculo.identificador,
        inicio_planificado: t.inicio_planificado,
        termino_planificado: t.termino_planificado,
        margen_tolerancia_min: t.margen_tolerancia_min,
        estado: t.estado,
      }));
    },

    /** Conductores para asignar turnos (los deshabilitados se indican, no se ocultan). */
    async listarConductores() {
      const conductores = await Usuario.findAll({
        where: { rol: 'conductor' },
        order: [['nombre_visible', 'ASC']],
      });
      return conductores.map((c) => ({
        id: c.id,
        nombre: c.nombre_visible,
        habilitado: c.estado === 'habilitado',
      }));
    },

    /** Vehículos para asignar turnos; `asignable` indica si hoy se puede usar en un turno. */
    async listarVehiculos() {
      const vehiculos = await Vehiculo.findAll({
        order: [['identificador', 'ASC']],
      });
      return vehiculos.map((v) => ({
        id: v.id,
        identificador: v.identificador,
        patente: v.patente,
        capacidad: v.capacidad,
        estado_operativo: v.estado_operativo,
        asignable: Boolean(v.habilitado) && VEHICULO_ASIGNABLE.includes(v.estado_operativo),
      }));
    },

    async obtenerConfiguracion() {
      const c = await Configuracion.findByPk(1);
      return {
        margen_tolerancia_min: c.margen_tolerancia_min,
        actualizado_en: c.actualizado_en,
      };
    },

    /** Cambia el margen por defecto. Solo afecta a los turnos que se creen desde ahora. */
    async actualizarMargen(valor) {
      await Configuracion.update(
        {
          margen_tolerancia_min: valor,
          actualizado_en: new Date().toISOString(),
        },
        { where: { id: 1 } },
      );
      return this.obtenerConfiguracion();
    },
  };
}

module.exports = { createTurnosService };
