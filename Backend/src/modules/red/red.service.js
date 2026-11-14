// RED-01 (líneas y recorridos) y RED-02 (paraderos): consultas de solo lectura.
const { Op } = require('sequelize');
const { HttpError } = require('../../utils/httpErrors');

const AVISO_SUSPENDIDA = 'Esta línea está suspendida temporalmente y no presta servicio.';

/** Minúsculas y sin tildes, para búsquedas tolerantes ("colon" encuentra "Colón"). */
function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const noEncontrado = (mensaje) => new HttpError(404, mensaje);

function lineaPublica(l) {
  const out = {
    id: l.id,
    codigo: l.codigo,
    nombre: l.nombre,
    color: l.color,
    estado_servicio: l.estado_servicio,
  };
  if (l.estado_servicio === 'suspendida') out.aviso = AVISO_SUSPENDIDA;
  return out;
}

const paraderoPublico = (p) => ({
  id: p.id,
  codigo: p.codigo,
  nombre: p.nombre,
  latitud: p.latitud,
  longitud: p.longitud,
});

/** @param {ReturnType<import('../../database/models').initModels>} models */
function createRedService({ Linea, Recorrido, Paradero, RecorridoParadero }) {
  const lineaVisible = { estado_servicio: { [Op.ne]: 'desactivada' } };

  /** Arma los recorridos de una línea, cada uno con sus paraderos activos en orden. */
  async function recorridosConParadas(recorridos) {
    if (recorridos.length === 0) return [];
    const paradas = await RecorridoParadero.findAll({
      where: { recorrido_id: recorridos.map((r) => r.id) },
      include: [{ model: Paradero, as: 'paradero', where: { activo: 1 } }],
      order: [['orden', 'ASC']],
    });
    return recorridos.map((r) => ({
      id: r.id,
      sentido: r.sentido,
      dias_funcionamiento: r.dias_funcionamiento,
      horarios: r.horarios,
      paraderos: paradas
        .filter((p) => p.recorrido_id === r.id)
        .map((p) => ({ orden: p.orden, ...paraderoPublico(p.paradero) })),
    }));
  }

  /**
   * Punto de inicio y de término de cada línea: el primer y el último paradero activo de su
   * recorrido de ida. Devuelve un Map con el id de la línea como clave.
   */
  async function extremosDeLineas(lineaIds) {
    const extremos = new Map();
    if (lineaIds.length === 0) return extremos;
    const paradas = await RecorridoParadero.findAll({
      include: [
        { model: Paradero, as: 'paradero', where: { activo: 1 } },
        {
          model: Recorrido,
          as: 'recorrido',
          where: { linea_id: lineaIds, sentido: 'ida', activo: 1 },
        },
      ],
      order: [['orden', 'ASC']],
    });
    for (const p of paradas) {
      const lineaId = p.recorrido.linea_id;
      const actual = extremos.get(lineaId);
      if (!actual) {
        extremos.set(lineaId, {
          punto_inicio: p.paradero.nombre,
          punto_termino: p.paradero.nombre,
        });
      } else {
        actual.punto_termino = p.paradero.nombre;
      }
    }
    return extremos;
  }

  const SIN_EXTREMOS = { punto_inicio: null, punto_termino: null };

  return {
    async listarLineas(q) {
      const term = normalizar(q);
      const lineas = await Linea.findAll({ where: lineaVisible, order: [['codigo', 'ASC']] });
      const visibles = lineas.filter(
        (l) => !term || normalizar(l.codigo).includes(term) || normalizar(l.nombre).includes(term),
      );
      const extremos = await extremosDeLineas(visibles.map((l) => l.id));
      return visibles.map((l) => ({ ...lineaPublica(l), ...(extremos.get(l.id) ?? SIN_EXTREMOS) }));
    },

    async obtenerLinea(id) {
      const linea = await Linea.findOne({ where: { id, ...lineaVisible } });
      if (!linea) throw noEncontrado('La línea no existe o no está disponible');
      const recorridos = await Recorrido.findAll({
        where: { linea_id: id, activo: 1 },
        order: [['sentido', 'ASC']],
      });
      const extremos = await extremosDeLineas([linea.id]);
      return {
        ...lineaPublica(linea),
        ...(extremos.get(linea.id) ?? SIN_EXTREMOS),
        recorridos: await recorridosConParadas(recorridos),
      };
    },

    async obtenerRecorrido(id) {
      const recorrido = await Recorrido.findOne({
        where: { id, activo: 1 },
        include: [{ model: Linea, as: 'linea', where: lineaVisible }],
      });
      if (!recorrido) throw noEncontrado('El recorrido no existe o no está disponible');
      const [completo] = await recorridosConParadas([recorrido]);
      const { linea } = recorrido;
      const out = {
        ...completo,
        linea: {
          id: linea.id,
          codigo: linea.codigo,
          nombre: linea.nombre,
          estado_servicio: linea.estado_servicio,
        },
      };
      if (linea.estado_servicio === 'suspendida') out.aviso = AVISO_SUSPENDIDA;
      return out;
    },

    async listarParaderos(q) {
      const term = normalizar(q);
      const paraderos = await Paradero.findAll({
        where: { activo: 1 },
        order: [['nombre', 'ASC']],
      });
      return paraderos
        .filter(
          (p) =>
            !term || normalizar(p.nombre).includes(term) || normalizar(p.codigo).includes(term),
        )
        .map(paraderoPublico);
    },

    async obtenerParadero(id) {
      const paradero = await Paradero.findOne({ where: { id, activo: 1 } });
      if (!paradero) throw noEncontrado('El paradero no existe o no está disponible');
      const paradas = await RecorridoParadero.findAll({
        where: { paradero_id: id },
        include: [
          {
            model: Recorrido,
            as: 'recorrido',
            where: { activo: 1 },
            include: [{ model: Linea, as: 'linea', where: lineaVisible }],
          },
        ],
      });
      // Por cada línea que pasa por el paradero, en qué sentidos (recorridos) lo hace.
      const lineas = new Map();
      for (const p of paradas) {
        const { linea } = p.recorrido;
        if (!lineas.has(linea.id)) lineas.set(linea.id, { linea, recorridos: [] });
        lineas.get(linea.id).recorridos.push({ id: p.recorrido.id, sentido: p.recorrido.sentido });
      }
      return {
        ...paraderoPublico(paradero),
        lineas: [...lineas.values()]
          .sort((a, b) => a.linea.codigo.localeCompare(b.linea.codigo))
          .map(({ linea, recorridos }) => {
            const ordenados = recorridos.sort((a, b) => a.sentido.localeCompare(b.sentido));
            return {
              ...lineaPublica(linea),
              sentidos: ordenados.map((r) => r.sentido),
              recorridos: ordenados,
            };
          }),
      };
    },
  };
}

module.exports = { createRedService, normalizar };
