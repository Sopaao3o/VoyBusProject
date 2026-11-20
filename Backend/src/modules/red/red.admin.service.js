// ADM-01: el administrador crea, edita y activa o desactiva líneas, recorridos y paraderos.
//
// Reglas:
//  - Los códigos de líneas y de paraderos no se repiten (sin distinguir mayúsculas).
//  - Desactivar algo impide usarlo en nuevas asignaciones (los turnos ya lo validan) y lo
//    oculta de las consultas públicas.
//  - Los cambios no alteran los viajes en curso: mientras un recorrido tenga viajes en curso
//    no se cambian sus paraderos, y un paradero en uso no se mueve ni se desactiva.
//    Días, horarios, nombres y colores sí se pueden cambiar en cualquier momento.
const { Op, fn, col, where: condicion } = require('sequelize');
const { notFound, conflict, badRequest } = require('../../utils/httpErrors');

/**
 * Ojo: con una sola conexión SQLite, toda consulta dentro de una transacción lleva `{ transaction }`.
 * @param {ReturnType<import('../../database/models').initModels>} models
 */
function createRedAdminService(models) {
  const { sequelize, Linea, Recorrido, Paradero, RecorridoParadero, Viaje } = models;

  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  /** ¿Existe otro registro con este código? (sin distinguir mayúsculas) */
  async function codigoOcupado(Modelo, codigo, excepto, transaction) {
    const otro = await Modelo.findOne({
      where: {
        [Op.and]: [
          condicion(fn('upper', col('codigo')), codigo.toUpperCase()),
          ...(excepto ? [{ id: { [Op.ne]: excepto } }] : []),
        ],
      },
      transaction,
    });
    return Boolean(otro);
  }

  const viajesEnCursoDeRecorrido = (recorridoId, transaction) =>
    Viaje.count({ where: { recorrido_id: recorridoId, estado: 'en_curso' }, transaction });

  async function viajesEnCursoConParadero(paraderoId, transaction) {
    const usos = await RecorridoParadero.findAll({
      where: { paradero_id: paraderoId },
      transaction,
    });
    if (usos.length === 0) return 0;
    return Viaje.count({
      where: { recorrido_id: { [Op.in]: usos.map((u) => u.recorrido_id) }, estado: 'en_curso' },
      transaction,
    });
  }

  /** Comprueba que los paraderos existan y estén activos; devuelve los ids en el orden dado. */
  async function validarParaderos(ids, transaction) {
    const encontrados = await Paradero.findAll({ where: { id: { [Op.in]: ids } }, transaction });
    const porId = new Map(encontrados.map((p) => [p.id, p]));
    const faltan = ids.filter((id) => !porId.has(id));
    if (faltan.length > 0) throw badRequest(`No existen los paraderos: ${faltan.join(', ')}`);
    const inactivos = ids.map((id) => porId.get(id)).filter((p) => !p.activo);
    if (inactivos.length > 0) {
      throw badRequest(
        `No se pueden usar paraderos desactivados: ${inactivos.map((p) => p.codigo).join(', ')}`,
      );
    }
    return ids;
  }

  async function guardarParadas(recorridoId, ids, transaction) {
    await RecorridoParadero.destroy({ where: { recorrido_id: recorridoId }, transaction });
    await RecorridoParadero.bulkCreate(
      ids.map((paraderoId, i) => ({
        recorrido_id: recorridoId,
        orden: i + 1,
        paradero_id: paraderoId,
      })),
      { transaction },
    );
  }

  async function paradasDe(recorridoId, transaction) {
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
      activo: Boolean(p.paradero.activo),
    }));
  }

  async function presentarRecorrido(r, transaction) {
    return {
      id: r.id,
      linea_id: r.linea_id,
      sentido: r.sentido,
      dias_funcionamiento: r.dias_funcionamiento,
      horarios: r.horarios,
      activo: Boolean(r.activo),
      viajes_en_curso: await viajesEnCursoDeRecorrido(r.id, transaction),
      paraderos: await paradasDe(r.id, transaction),
    };
  }

  const presentarLinea = (l) => ({
    id: l.id,
    codigo: l.codigo,
    nombre: l.nombre,
    color: l.color,
    estado_servicio: l.estado_servicio,
  });

  async function lineaCompleta(id, transaction) {
    const linea = await Linea.findByPk(id, { transaction });
    if (!linea) throw notFound('La línea no existe');
    const recorridos = await Recorrido.findAll({
      where: { linea_id: id },
      order: [['sentido', 'ASC']],
      transaction,
    });
    const lista = [];
    for (const r of recorridos) lista.push(await presentarRecorrido(r, transaction));
    return { ...presentarLinea(linea), recorridos: lista };
  }

  async function paraderoCompleto(p, transaction) {
    const usos = await RecorridoParadero.findAll({
      where: { paradero_id: p.id },
      include: [{ model: Recorrido, as: 'recorrido', include: [{ model: Linea, as: 'linea' }] }],
      transaction,
    });
    return {
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      latitud: p.latitud,
      longitud: p.longitud,
      activo: Boolean(p.activo),
      recorridos: usos.map((u) => ({
        id: u.recorrido.id,
        linea_codigo: u.recorrido.linea.codigo,
        sentido: u.recorrido.sentido,
        orden: u.orden,
      })),
      viajes_en_curso: await viajesEnCursoConParadero(p.id, transaction),
    };
  }

  return {
    // ── Líneas ──

    /** Todas las líneas, también las desactivadas, con un resumen de sus recorridos. */
    async listarLineas() {
      const lineas = await Linea.findAll({ order: [['codigo', 'ASC']] });
      const recorridos = await Recorrido.findAll();
      const conteos = await RecorridoParadero.findAll({
        attributes: ['recorrido_id', [fn('count', col('paradero_id')), 'total']],
        group: ['recorrido_id'],
        raw: true,
      });
      const totalDe = new Map(conteos.map((c) => [c.recorrido_id, Number(c.total)]));
      return lineas.map((l) => ({
        ...presentarLinea(l),
        recorridos: recorridos
          .filter((r) => r.linea_id === l.id)
          .sort((a, b) => a.sentido.localeCompare(b.sentido))
          .map((r) => ({
            id: r.id,
            sentido: r.sentido,
            activo: Boolean(r.activo),
            total_paraderos: totalDe.get(r.id) ?? 0,
          })),
      }));
    },

    obtenerLinea: (id) => sequelize.transaction((t) => lineaCompleta(id, t)),

    async crearLinea(datos) {
      return sequelize.transaction(async (transaction) => {
        if (await codigoOcupado(Linea, datos.codigo, null, transaction)) {
          throw conflict(`Ya existe una línea con el código ${datos.codigo}`);
        }
        const linea = await Linea.create(
          {
            ...datos,
            color: datos.color.toUpperCase(),
            estado_servicio: datos.estado_servicio ?? 'activa',
          },
          { transaction },
        );
        return lineaCompleta(linea.id, transaction);
      });
    },

    /** Cambiar nombre, color o estado no afecta a los viajes en curso (siguen su recorrido). */
    async editarLinea(id, cambios) {
      return sequelize.transaction(async (transaction) => {
        const linea = await Linea.findByPk(id, { transaction });
        if (!linea) throw notFound('La línea no existe');
        if (cambios.codigo && (await codigoOcupado(Linea, cambios.codigo, id, transaction))) {
          throw conflict(`Ya existe una línea con el código ${cambios.codigo}`);
        }
        await linea.update(
          { ...cambios, ...(cambios.color ? { color: cambios.color.toUpperCase() } : {}) },
          { transaction },
        );
        return lineaCompleta(id, transaction);
      });
    },

    // ── Recorridos ──

    async crearRecorrido(lineaId, datos) {
      return sequelize.transaction(async (transaction) => {
        const linea = await Linea.findByPk(lineaId, { transaction });
        if (!linea) throw notFound('La línea no existe');
        const existe = await Recorrido.findOne({
          where: { linea_id: lineaId, sentido: datos.sentido },
          transaction,
        });
        if (existe) {
          throw conflict(`La línea ${linea.codigo} ya tiene un recorrido de ${datos.sentido}`);
        }
        const ids = await validarParaderos(datos.paraderos, transaction);
        const recorrido = await Recorrido.create(
          {
            linea_id: lineaId,
            sentido: datos.sentido,
            dias_funcionamiento: datos.dias_funcionamiento,
            horarios: datos.horarios,
            activo: datos.activo === false ? 0 : 1,
          },
          { transaction },
        );
        await guardarParadas(recorrido.id, ids, transaction);
        return presentarRecorrido(recorrido, transaction);
      });
    },

    obtenerRecorrido: (id) =>
      sequelize.transaction(async (transaction) => {
        const r = await Recorrido.findByPk(id, { transaction });
        if (!r) throw notFound('El recorrido no existe');
        return presentarRecorrido(r, transaction);
      }),

    async editarRecorrido(id, cambios) {
      return sequelize.transaction(async (transaction) => {
        const recorrido = await Recorrido.findByPk(id, { transaction });
        if (!recorrido) throw notFound('El recorrido no existe');

        const { paraderos, activo, ...resto } = cambios;
        if (paraderos) {
          const actuales = (await paradasDe(id, transaction)).map((p) => p.id);
          const iguales =
            actuales.length === paraderos.length &&
            actuales.every((pid, i) => pid === paraderos[i]);
          if (!iguales) {
            const enCurso = await viajesEnCursoDeRecorrido(id, transaction);
            if (enCurso > 0) {
              throw conflict(
                `Este recorrido tiene ${plural(enCurso, 'viaje', 'viajes')} en curso: sus paraderos se podrán cambiar cuando ${enCurso === 1 ? 'termine' : 'terminen'}, para no alterar a los pasajeros que van en ${enCurso === 1 ? 'él' : 'ellos'}.`,
              );
            }
            await guardarParadas(id, await validarParaderos(paraderos, transaction), transaction);
          }
        }
        await recorrido.update(
          { ...resto, ...(activo === undefined ? {} : { activo: activo ? 1 : 0 }) },
          { transaction },
        );
        return presentarRecorrido(recorrido, transaction);
      });
    },

    // ── Paraderos ──

    /** Todos los paraderos, también los desactivados, con los recorridos que los usan. */
    async listarParaderos() {
      const paraderos = await Paradero.findAll({ order: [['codigo', 'ASC']] });
      const usos = await RecorridoParadero.findAll({
        attributes: ['paradero_id', [fn('count', col('recorrido_id')), 'total']],
        group: ['paradero_id'],
        raw: true,
      });
      const totalDe = new Map(usos.map((u) => [u.paradero_id, Number(u.total)]));
      return paraderos.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        latitud: p.latitud,
        longitud: p.longitud,
        activo: Boolean(p.activo),
        total_recorridos: totalDe.get(p.id) ?? 0,
      }));
    },

    obtenerParadero: (id) =>
      sequelize.transaction(async (transaction) => {
        const p = await Paradero.findByPk(id, { transaction });
        if (!p) throw notFound('El paradero no existe');
        return paraderoCompleto(p, transaction);
      }),

    async crearParadero(datos) {
      return sequelize.transaction(async (transaction) => {
        const codigo = datos.codigo.toUpperCase();
        if (await codigoOcupado(Paradero, codigo, null, transaction)) {
          throw conflict(`Ya existe un paradero con el código ${codigo}`);
        }
        const p = await Paradero.create(
          { ...datos, codigo, activo: datos.activo === false ? 0 : 1 },
          { transaction },
        );
        return paraderoCompleto(p, transaction);
      });
    },

    async editarParadero(id, cambios) {
      return sequelize.transaction(async (transaction) => {
        const p = await Paradero.findByPk(id, { transaction });
        if (!p) throw notFound('El paradero no existe');
        const codigo = cambios.codigo?.toUpperCase();
        if (codigo && (await codigoOcupado(Paradero, codigo, id, transaction))) {
          throw conflict(`Ya existe un paradero con el código ${codigo}`);
        }
        const seMueve =
          (cambios.latitud !== undefined && cambios.latitud !== p.latitud) ||
          (cambios.longitud !== undefined && cambios.longitud !== p.longitud);
        const seDesactiva = cambios.activo === false && Boolean(p.activo);
        if (seMueve || seDesactiva) {
          const enCurso = await viajesEnCursoConParadero(id, transaction);
          if (enCurso > 0) {
            throw conflict(
              `Hay ${plural(enCurso, 'viaje', 'viajes')} en curso que ${enCurso === 1 ? 'pasa' : 'pasan'} por este paradero: podrás ${seDesactiva ? 'desactivarlo' : 'moverlo'} cuando ${enCurso === 1 ? 'termine' : 'terminen'}.`,
            );
          }
        }
        const { activo, ...resto } = cambios;
        await p.update(
          {
            ...resto,
            ...(codigo ? { codigo } : {}),
            ...(activo === undefined ? {} : { activo: activo ? 1 : 0 }),
          },
          { transaction },
        );
        return paraderoCompleto(p, transaction);
      });
    },
  };
}

module.exports = { createRedAdminService };
