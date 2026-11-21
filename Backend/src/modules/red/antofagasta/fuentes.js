// Fuentes externas y gratuitas del catálogo de Antofagasta:
//   - OpenStreetMap (API Overpass): las calles con nombre y los paraderos de la zona.
//   - OSRM: el camino por las calles entre los puntos del itinerario.
// Datos de calles © colaboradores de OpenStreetMap (ODbL): https://www.openstreetmap.org/copyright
const { consultarOsrm, OSRM_URL_POR_DEFECTO } = require('../trazado');

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const AGENTE = 'VoyBus (proyecto universitario UCN)';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Descarga de OpenStreetMap las calles con nombre y los paraderos dentro de `zona`.
 * @param {number[]} zona [sur, oeste, norte, este]
 * @returns {Promise<{ descargado_en: string, vias: {nombre: string, puntos: number[][]}[], paradas: {nombre: string|null, lat: number, lng: number}[] }>}
 */
async function descargarCalles(zona, { fetch = globalThis.fetch, informar = () => {} } = {}) {
  const [sur, oeste, norte, este] = zona;
  const caja = `${sur},${oeste},${norte},${este}`;
  const consulta = `[out:json][timeout:180];
(
  way["highway"]["name"](${caja});
  node["highway"="bus_stop"](${caja});
);
out geom;`;
  let ultimo;
  for (const url of OVERPASS) {
    try {
      informar(`Descargando calles de OpenStreetMap (${new URL(url).host})…`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': AGENTE },
        body: `data=${encodeURIComponent(consulta)}`,
      });
      if (!res.ok) throw new Error(`respondió ${res.status}`);
      const r = await res.json();
      return {
        descargado_en: new Date().toISOString(),
        vias: r.elements
          .filter((e) => e.type === 'way' && e.geometry?.length >= 2)
          .map((e) => ({ nombre: e.tags.name, puntos: e.geometry.map((g) => [g.lat, g.lon]) })),
        paradas: r.elements
          .filter((e) => e.type === 'node')
          .map((e) => ({ nombre: e.tags?.name ?? null, lat: e.lat, lng: e.lon })),
      };
    } catch (err) {
      ultimo = err;
      informar(`No se pudo con ${new URL(url).host} (${err.message}). Probando otro servidor…`);
    }
  }
  throw new Error(`No se pudieron descargar las calles de OpenStreetMap: ${ultimo?.message}`);
}

/**
 * Consulta a OSRM respetando su uso justo (una consulta por segundo). Primero pide que cada
 * punto quede a menos de 40 m de una calle; si no hay camino así, prueba sin ese límite.
 */
function crearRuteador({
  url = process.env.OSRM_URL || OSRM_URL_POR_DEFECTO,
  pausaMs = 1100,
} = {}) {
  return async (puntos) => {
    await esperar(pausaMs);
    try {
      return await consultarOsrm(puntos, { url, radio: 40 });
    } catch {
      return consultarOsrm(puntos, { url });
    }
  };
}

module.exports = { descargarCalles, crearRuteador };
