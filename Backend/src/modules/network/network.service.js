// RED-01 (líneas y recorridos) y RED-02 (paraderos): consultas de solo lectura.

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.status = 404;
  }
}

/** Minúsculas y sin tildes, para búsquedas tolerantes ("colon" encuentra "Colón"). */
function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const AVISO_SUSPENDIDA = 'Esta línea está suspendida temporalmente y no presta servicio.';

function lineaPublica(l) {
  const out = { id: l.id, codigo: l.codigo, nombre: l.nombre, color: l.color, estado_servicio: l.estado_servicio };
  if (l.estado_servicio === 'suspendida') out.aviso = AVISO_SUSPENDIDA;
  return out;
}

function createNetworkService(db) {
  const qLineas = db.prepare(`SELECT * FROM lineas WHERE estado_servicio <> 'desactivada' ORDER BY codigo`);
  const qLinea = db.prepare(`SELECT * FROM lineas WHERE id = ? AND estado_servicio <> 'desactivada'`);
  const qRecorridosLinea = db.prepare(`SELECT * FROM recorridos WHERE linea_id = ? AND activo = 1 ORDER BY sentido`);
  const qRecorrido = db.prepare(`
    SELECT r.*, l.codigo AS linea_codigo, l.nombre AS linea_nombre, l.estado_servicio
    FROM recorridos r JOIN lineas l ON l.id = r.linea_id
    WHERE r.id = ? AND r.activo = 1 AND l.estado_servicio <> 'desactivada'`);
  const qParadasRecorrido = db.prepare(`
    SELECT rp.orden, p.id, p.codigo, p.nombre, p.latitud, p.longitud
    FROM recorrido_paraderos rp JOIN paraderos p ON p.id = rp.paradero_id
    WHERE rp.recorrido_id = ? AND p.activo = 1
    ORDER BY rp.orden`);
  const qParaderos = db.prepare(`SELECT * FROM paraderos WHERE activo = 1 ORDER BY nombre`);
  const qParadero = db.prepare(`SELECT * FROM paraderos WHERE id = ? AND activo = 1`);
  const qLineasDeParadero = db.prepare(`
    SELECT DISTINCT l.id, l.codigo, l.nombre, l.color, l.estado_servicio
    FROM recorrido_paraderos rp
    JOIN recorridos r ON r.id = rp.recorrido_id AND r.activo = 1
    JOIN lineas l ON l.id = r.linea_id AND l.estado_servicio <> 'desactivada'
    WHERE rp.paradero_id = ?
    ORDER BY l.codigo`);

  function recorridoConParadas(r) {
    return {
      id: r.id,
      sentido: r.sentido,
      dias_funcionamiento: r.dias_funcionamiento,
      horarios: r.horarios,
      paraderos: qParadasRecorrido.all(r.id),
    };
  }

  return {
    listarLineas(q) {
      const term = normalizar(q);
      return qLineas
        .all()
        .filter((l) => !term || normalizar(l.codigo).includes(term) || normalizar(l.nombre).includes(term))
        .map(lineaPublica);
    },

    obtenerLinea(id) {
      const linea = qLinea.get(id);
      if (!linea) throw new NotFoundError('La línea no existe o no está disponible');
      return { ...lineaPublica(linea), recorridos: qRecorridosLinea.all(id).map(recorridoConParadas) };
    },

    obtenerRecorrido(id) {
      const r = qRecorrido.get(id);
      if (!r) throw new NotFoundError('El recorrido no existe o no está disponible');
      const base = recorridoConParadas(r);
      const out = {
        ...base,
        linea: { id: r.linea_id, codigo: r.linea_codigo, nombre: r.linea_nombre, estado_servicio: r.estado_servicio },
      };
      if (r.estado_servicio === 'suspendida') out.aviso = AVISO_SUSPENDIDA;
      return out;
    },

    listarParaderos(q) {
      const term = normalizar(q);
      return qParaderos
        .all()
        .filter((p) => !term || normalizar(p.nombre).includes(term) || normalizar(p.codigo).includes(term))
        .map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, latitud: p.latitud, longitud: p.longitud }));
    },

    obtenerParadero(id) {
      const p = qParadero.get(id);
      if (!p) throw new NotFoundError('El paradero no existe o no está disponible');
      return {
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        latitud: p.latitud,
        longitud: p.longitud,
        lineas: qLineasDeParadero.all(id).map(lineaPublica),
      };
    },
  };
}

module.exports = { createNetworkService, NotFoundError, normalizar };
