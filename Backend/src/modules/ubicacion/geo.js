// VEH-01: cálculos con coordenadas para seguir el avance de un vehículo por su recorrido.
// Las distancias de una ciudad son cortas: se usa una proyección plana local (error < 0,1 %).

const METROS_POR_GRADO_LAT = 110_540;
const METROS_POR_GRADO_LNG_ECUADOR = 111_320;

/** Margen para dar un paradero por superado: el vehículo debe quedar esta distancia más allá. */
const MARGEN_SUPERADO_M = 25;
/** Más lejos que esto del recorrido, la posición no se usa para calcular el avance. */
const MAXIMO_FUERA_DE_RECORRIDO_M = 250;

/** Convierte coordenadas a metros (x hacia el este, y hacia el norte) respecto de `origen`. */
function aMetros(punto, origen) {
  const coseno = Math.cos((origen.latitud * Math.PI) / 180);
  return {
    x: (punto.longitud - origen.longitud) * METROS_POR_GRADO_LNG_ECUADOR * coseno,
    y: (punto.latitud - origen.latitud) * METROS_POR_GRADO_LAT,
  };
}

/** Distancia en metros entre dos puntos { latitud, longitud }. */
function distancia(a, b) {
  const { x, y } = aMetros(b, a);
  return Math.hypot(x, y);
}

/**
 * Proyecta `punto` sobre el recorrido (tramos rectos entre paraderos consecutivos) y
 * devuelve cuántos metros lleva recorridos desde el primer paradero y a qué distancia
 * del recorrido quedó. Solo considera los tramos desde `desdeTramo` en adelante, para que
 * un recorrido que vuelve sobre sus pasos no haga "retroceder" al vehículo.
 * @param {{ latitud: number, longitud: number }[]} paraderos en orden
 */
function proyectar(paraderos, punto, desdeTramo = 0) {
  let acumulado = 0;
  let mejor = null;
  for (let i = 0; i < paraderos.length - 1; i++) {
    const a = aMetros(paraderos[i], paraderos[0]);
    const b = aMetros(paraderos[i + 1], paraderos[0]);
    const p = aMetros(punto, paraderos[0]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const largo = Math.hypot(dx, dy);
    if (i >= desdeTramo && largo > 0) {
      // Fracción del tramo donde cae la proyección, limitada al tramo.
      const t = Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / (largo * largo), 0), 1);
      const lejania = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
      if (!mejor || lejania < mejor.lejania) {
        mejor = { avance: acumulado + t * largo, lejania, tramo: i };
      }
    }
    acumulado += largo;
  }
  return mejor;
}

/** Metros desde el primer paradero hasta cada paradero, siguiendo el recorrido. */
function distanciasAcumuladas(paraderos) {
  const resultado = [0];
  for (let i = 1; i < paraderos.length; i++) {
    resultado.push(resultado[i - 1] + distancia(paraderos[i - 1], paraderos[i]));
  }
  return resultado;
}

/**
 * Nuevo "último paradero superado" (su `orden`) según una posición del vehículo.
 * Nunca retrocede. Si la posición está lejos del recorrido, no cambia nada: pasar cerca
 * de un paradero no prueba que el vehículo se detuvo, y un GPS impreciso no debe cerrar
 * solicitudes de parada antes de tiempo.
 * @param {{ orden: number, latitud: number, longitud: number }[]} paraderos en orden
 * @param {number} ultimoSuperado orden del último paradero superado (0 = ninguno)
 */
function calcularAvance(paraderos, ultimoSuperado, punto) {
  if (paraderos.length < 2) return { ultimoSuperado, lejania: null };
  const indiceUltimo = paraderos.findIndex((p) => p.orden === ultimoSuperado);
  const desdeTramo = Math.max(indiceUltimo, 0);
  const proyeccion = proyectar(paraderos, punto, desdeTramo);
  if (!proyeccion || proyeccion.lejania > MAXIMO_FUERA_DE_RECORRIDO_M) {
    return { ultimoSuperado, lejania: proyeccion?.lejania ?? null };
  }
  const acumuladas = distanciasAcumuladas(paraderos);
  let nuevo = ultimoSuperado;
  // El último paradero no se "supera": el viaje termina ahí y se cierra al finalizar el viaje.
  for (let i = 0; i < paraderos.length - 1; i++) {
    if (paraderos[i].orden > nuevo && proyeccion.avance >= acumuladas[i] + MARGEN_SUPERADO_M) {
      nuevo = paraderos[i].orden;
    }
  }
  return { ultimoSuperado: nuevo, lejania: proyeccion.lejania };
}

/** El punto que queda a `metros` del primer paradero, avanzando por el recorrido. */
function puntoEnRecorrido(paraderos, metros) {
  let restante = Math.max(metros, 0);
  for (let i = 1; i < paraderos.length; i++) {
    const tramo = distancia(paraderos[i - 1], paraderos[i]);
    if (restante <= tramo && tramo > 0) {
      const t = restante / tramo;
      const a = paraderos[i - 1];
      const b = paraderos[i];
      return {
        latitud: a.latitud + (b.latitud - a.latitud) * t,
        longitud: a.longitud + (b.longitud - a.longitud) * t,
      };
    }
    restante -= tramo;
  }
  const ultimo = paraderos[paraderos.length - 1];
  return { latitud: ultimo.latitud, longitud: ultimo.longitud };
}

module.exports = {
  distancia,
  puntoEnRecorrido,
  proyectar,
  distanciasAcumuladas,
  calcularAvance,
  MARGEN_SUPERADO_M,
  MAXIMO_FUERA_DE_RECORRIDO_M,
};
