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
  const out = { id: l.id, codigo: l.codigo, nombre: l.nombre, color: l.color, estado_servicio: l.estado_servicio };
  if (l.estado_servicio === 'suspendida') out.aviso = AVISO_SUSPENDIDA;
  return out;
}

const paraderoPublico = (p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, latitud: p.latitud, longitud: p.longitud });

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

  return {
    async listarLineas(q) {
      const term = normalizar(q);
      const lineas = await Linea.findAll({ where: lineaVisible, order: [['codigo', 'ASC']] });
      return lineas
        .filter((l) => !term || normalizar(l.codigo).includes(term) || normalizar(l.nombre).includes(term))
        .map(lineaPublica);
    },

    async obtenerLinea(id) {
      const linea = await Linea.findOne({ where: { id, ...lineaVisible } });
      if (!linea) throw noEncontrado('La línea no existe o no está disponible');
      const recorridos = await Recorrido.findAll({ where: { linea_id: id, activo: 1 }, order: [['sentido', 'ASC']] });
      return { ...lineaPublica(linea), recorridos: await recorridosConParadas(recorridos) };
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
        linea: { id: linea.id, codigo: linea.codigo, nombre: linea.nombre, estado_servicio: linea.estado_servicio },
      };
      if (linea.estado_servicio === 'suspendida') out.aviso = AVISO_SUSPENDIDA;
      return out;
    },

    async listarParaderos(q) {
      const term = normalizar(q);
      const paraderos = await Paradero.findAll({ where: { activo: 1 }, order: [['nombre', 'ASC']] });
      return paraderos
        .filter((p) => !term || normalizar(p.nombre).includes(term) || normalizar(p.codigo).includes(term))
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
      const lineas = new Map();
      for (const p of paradas) lineas.set(p.recorrido.linea.id, p.recorrido.linea);
      return {
        ...paraderoPublico(paradero),
        lineas: [...lineas.values()].sort((a, b) => a.codigo.localeCompare(b.codigo)).map(lineaPublica),
      };
    },
  };
}

module.exports = { createRedService, normalizar };