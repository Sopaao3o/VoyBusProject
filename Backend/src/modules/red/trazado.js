// RED-01 / ADM-01: trazado de un recorrido por las calles, pasando por sus paraderos en orden.
// Usa OSRM (motor de rutas libre sobre datos de OpenStreetMap). Por defecto, el servidor de
// demostración público y gratuito; con OSRM_URL se puede usar otro. Respeta los sentidos de
// tránsito, por eso la ida y la vuelta de una línea pueden ir por calles distintas.
//
// Datos de calles © colaboradores de OpenStreetMap (ODbL): https://www.openstreetmap.org/copyright
const { simplificar, distancia } = require('../ubicacion/geo');

const OSRM_URL_POR_DEFECTO = 'https://router.project-osrm.org';
/** Más lejos que esto de una calle, el paradero está mal ubicado (el trazado no pasaría por él). */
const MAXIMO_PARADERO_A_CALLE_M = 50;
/** El servidor público acepta un número limitado de puntos por consulta. */
const MAXIMO_PUNTOS_POR_CONSULTA = 90;

class ErrorTrazado extends Error {
  /** @param {string} mensaje @param {{ codigo: string, detalle?: object }} info */
  constructor(mensaje, { codigo, detalle } = {}) {
    super(mensaje);
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

/**
 * Pide a OSRM la ruta en auto que pasa por `puntos` en orden.
 * @param {{ latitud: number, longitud: number }[]} puntos
 * @returns {Promise<{ coordenadas: number[][], ajustes: number[], pasos: object[], tramos_m: number[] }>}
 *   coordenadas [lat, lng]; ajustes = metros entre cada punto y la calle donde quedó.
 */
async function consultarOsrm(
  puntos,
  { fetch = globalThis.fetch, url = OSRM_URL_POR_DEFECTO, pasos = false, radio = null } = {},
) {
  const coords = puntos.map((p) => `${p.longitud.toFixed(6)},${p.latitud.toFixed(6)}`).join(';');
  // `radio`: hasta cuántos metros puede moverse cada punto para quedar en una calle.
  const radios = radio ? `&radiuses=${puntos.map(() => radio).join(';')}` : '';
  const consulta =
    `${url.replace(/\/$/, '')}/route/v1/driving/${coords}` +
    `?overview=full&geometries=geojson&continue_straight=true&steps=${pasos}${radios}`;
  let respuesta;
  try {
    respuesta = await fetch(consulta, { headers: { 'User-Agent': 'VoyBus (proyecto UCN)' } });
  } catch (err) {
    throw new ErrorTrazado(`No se pudo conectar con el servicio de rutas (${err.message}).`, {
      codigo: 'SIN_CONEXION',
    });
  }
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok || !cuerpo || cuerpo.code !== 'Ok' || !cuerpo.routes?.length) {
    throw new ErrorTrazado(
      `El servicio de rutas no encontró un camino por las calles (${cuerpo?.message ?? cuerpo?.code ?? respuesta.status}).`,
      { codigo: 'SIN_RUTA' },
    );
  }
  const ruta = cuerpo.routes[0];
  return {
    coordenadas: ruta.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    ajustes: cuerpo.waypoints.map((w) => w.distance ?? 0),
    pasos: pasos ? ruta.legs.flatMap((l) => l.steps) : [],
    tramos_m: (ruta.legs ?? []).map((l) => l.distance),
  };
}

/**
 * Trazado por las calles que pasa por los paraderos en orden.
 * @param {{ latitud: number, longitud: number, codigo?: string, nombre?: string }[]} paraderos
 * @param {{ fetch?: typeof fetch, url?: string, maximoAjusteM?: number }} [opciones]
 * @returns {Promise<{ trazado: number[][], largo_m: number }>}
 */
async function trazarPorCalles(paraderos, opciones = {}) {
  const {
    fetch = globalThis.fetch,
    url = process.env.OSRM_URL || OSRM_URL_POR_DEFECTO,
    maximoAjusteM = MAXIMO_PARADERO_A_CALLE_M,
  } = opciones;
  if (paraderos.length < 2) {
    throw new ErrorTrazado('El recorrido necesita al menos 2 paraderos.', { codigo: 'POCOS' });
  }
  // Si hay muchos paraderos, se consulta por partes que comparten el paradero de unión.
  let trazado = [];
  for (let inicio = 0; inicio < paraderos.length - 1; inicio += MAXIMO_PUNTOS_POR_CONSULTA - 1) {
    const parte = paraderos.slice(inicio, inicio + MAXIMO_PUNTOS_POR_CONSULTA);
    const { coordenadas, ajustes } = await consultarOsrm(parte, { fetch, url });
    const lejos = ajustes
      .map((metros, i) => ({ metros, paradero: parte[i] }))
      .filter((a) => a.metros > maximoAjusteM);
    if (lejos.length > 0) {
      const nombres = lejos
        .map(
          (a) =>
            `${a.paradero.nombre ?? a.paradero.codigo ?? 'sin nombre'} (${Math.round(a.metros)} m)`,
        )
        .join(', ');
      throw new ErrorTrazado(
        `Algunos paraderos quedan lejos de una calle: ${nombres}. Muévelos junto a la calle por donde pasa la micro.`,
        { codigo: 'PARADERO_LEJOS', detalle: { paraderos: lejos.map((a) => a.paradero.codigo) } },
      );
    }
    trazado = trazado.concat(trazado.length ? coordenadas.slice(1) : coordenadas);
  }
  const liviano = simplificar(trazado, 2).map(([lat, lng]) => [
    Number(lat.toFixed(6)),
    Number(lng.toFixed(6)),
  ]);
  let largo = 0;
  for (let i = 1; i < liviano.length; i++) {
    largo += distancia(
      { latitud: liviano[i - 1][0], longitud: liviano[i - 1][1] },
      { latitud: liviano[i][0], longitud: liviano[i][1] },
    );
  }
  return { trazado: liviano, largo_m: Math.round(largo) };
}

module.exports = {
  trazarPorCalles,
  consultarOsrm,
  ErrorTrazado,
  OSRM_URL_POR_DEFECTO,
  MAXIMO_PARADERO_A_CALLE_M,
};
