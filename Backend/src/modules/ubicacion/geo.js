// VEH-01: cálculos con coordenadas para seguir el avance de un vehículo por su recorrido.
// Las distancias de una ciudad son cortas: se usa una proyección plana local (error < 0,1 %).
//
// Una "ruta" es la línea por donde va el vehículo: el trazado por las calles del recorrido si
// lo tiene, o tramos rectos entre paraderos si no. Cada paradero queda en una posición
// (metros desde el inicio) a lo largo de esa línea.

const METROS_POR_GRADO_LAT = 110_540;
const METROS_POR_GRADO_LNG_ECUADOR = 111_320;

/** Margen para dar un paradero por superado: el vehículo debe quedar esta distancia más allá. */
const MARGEN_SUPERADO_M = 25;
/** Más lejos que esto del recorrido, la posición no se usa para calcular el avance. */
const MAXIMO_FUERA_DE_RECORRIDO_M = 250;
/** Un trazado se usa solo si cada paradero queda a menos de esto de él. */
const MAXIMO_PARADERO_FUERA_DEL_TRAZADO_M = 60;

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

/** Metros desde el primer punto hasta cada punto, en línea recta entre puntos consecutivos. */
function distanciasAcumuladas(puntos) {
  const resultado = [0];
  for (let i = 1; i < puntos.length; i++) {
    resultado.push(resultado[i - 1] + distancia(puntos[i - 1], puntos[i]));
  }
  return resultado;
}

/**
 * Proyecta `punto` sobre la polilínea `puntos` y devuelve a cuántos metros del inicio queda
 * (`avance`), a qué distancia de la línea (`lejania`) y en qué tramo. Solo considera lo que
 * está desde `desdeMetros` en adelante, para que un recorrido que vuelve sobre sus pasos no
 * haga "retroceder" al vehículo.
 */
function proyectarEnPuntos(puntos, acumuladas, punto, desdeMetros = 0) {
  let mejor = null;
  const origen = puntos[0];
  const p = aMetros(punto, origen);
  for (let i = 0; i < puntos.length - 1; i++) {
    if (acumuladas[i + 1] < desdeMetros) continue;
    const a = aMetros(puntos[i], origen);
    const b = aMetros(puntos[i + 1], origen);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const largo2 = dx * dx + dy * dy;
    if (largo2 === 0) continue;
    // Fracción del tramo donde cae la proyección, limitada al tramo (y a `desdeMetros`).
    let t = Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2, 0), 1);
    const largo = Math.sqrt(largo2);
    if (acumuladas[i] + t * largo < desdeMetros) t = (desdeMetros - acumuladas[i]) / largo;
    const lejania = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (!mejor || lejania < mejor.lejania) {
      mejor = { avance: acumuladas[i] + t * largo, lejania, tramo: i };
    }
  }
  return mejor;
}

/** Convierte el trazado guardado (texto JSON o lista de [lat, lng]) en puntos, o null. */
function leerTrazado(trazado) {
  let lista = trazado;
  if (typeof trazado === 'string') {
    try {
      lista = JSON.parse(trazado);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(lista) || lista.length < 2) return null;
  const puntos = [];
  for (const par of lista) {
    if (!Array.isArray(par) || !Number.isFinite(par[0]) || !Number.isFinite(par[1])) return null;
    puntos.push({ latitud: par[0], longitud: par[1] });
  }
  return puntos;
}

/**
 * Arma la ruta de un recorrido. Si el trazado no pasa cerca de todos sus paraderos (por
 * ejemplo, porque se movió un paradero), se ignora y se usan tramos rectos.
 * @param {{ latitud: number, longitud: number }[]} paraderos en orden
 * @param {string | number[][] | null} [trazado]
 * @returns {{ puntos: object[], acumuladas: number[], posiciones: number[], largo: number, porCalles: boolean }}
 */
function crearRuta(paraderos, trazado = null) {
  const puntosTrazado = paraderos.length >= 2 ? leerTrazado(trazado) : null;
  if (puntosTrazado) {
    const acumuladas = distanciasAcumuladas(puntosTrazado);
    const posiciones = [];
    let desde = 0;
    let valido = true;
    for (const paradero of paraderos) {
      const proyeccion = proyectarEnPuntos(puntosTrazado, acumuladas, paradero, desde);
      if (!proyeccion || proyeccion.lejania > MAXIMO_PARADERO_FUERA_DEL_TRAZADO_M) {
        valido = false;
        break;
      }
      posiciones.push(proyeccion.avance);
      desde = proyeccion.avance;
    }
    if (valido) {
      return {
        puntos: puntosTrazado,
        acumuladas,
        posiciones,
        largo: acumuladas[acumuladas.length - 1],
        porCalles: true,
      };
    }
  }
  const acumuladas = distanciasAcumuladas(paraderos);
  return {
    puntos: paraderos,
    acumuladas,
    posiciones: acumuladas,
    largo: acumuladas[acumuladas.length - 1] ?? 0,
    porCalles: false,
  };
}

/**
 * El trazado listo para enviar a la app ([lat, lng][]), o null si no hay o ya no pasa por los
 * paraderos (en ese caso la app dibuja tramos rectos entre ellos).
 */
function trazadoUtilizable(paraderos, trazado) {
  const ruta = crearRuta(paraderos, trazado);
  return ruta.porCalles ? ruta.puntos.map((p) => [p.latitud, p.longitud]) : null;
}

/**
 * Proyecta `punto` sobre la ruta, desde la posición del paradero de índice `desdeIndice`.
 * @returns {{ avance: number, lejania: number } | null}
 */
function proyectarEnRuta(ruta, punto, desdeIndice = 0) {
  if (ruta.puntos.length < 2) return null;
  const desde = ruta.posiciones[Math.max(desdeIndice, 0)] ?? 0;
  return proyectarEnPuntos(ruta.puntos, ruta.acumuladas, punto, desde);
}

/** Compatibilidad: proyección sobre tramos rectos entre paraderos (desde el tramo indicado). */
function proyectar(paraderos, punto, desdeTramo = 0, trazado = null) {
  return proyectarEnRuta(crearRuta(paraderos, trazado), punto, desdeTramo);
}

/**
 * Nuevo "último paradero superado" (su `orden`) según una posición del vehículo.
 * Nunca retrocede. Si la posición está lejos del recorrido, no cambia nada: pasar cerca
 * de un paradero no prueba que el vehículo se detuvo, y un GPS impreciso no debe cerrar
 * solicitudes de parada antes de tiempo.
 * @param {{ orden: number, latitud: number, longitud: number }[]} paraderos en orden
 * @param {number} ultimoSuperado orden del último paradero superado (0 = ninguno)
 * @param {object} punto
 * @param {string | number[][] | null | object} [trazadoORuta] trazado del recorrido o una ruta ya armada
 */
function calcularAvance(paraderos, ultimoSuperado, punto, trazadoORuta = null) {
  if (paraderos.length < 2) return { ultimoSuperado, lejania: null };
  const ruta =
    trazadoORuta && trazadoORuta.posiciones ? trazadoORuta : crearRuta(paraderos, trazadoORuta);
  const indiceUltimo = paraderos.findIndex((p) => p.orden === ultimoSuperado);
  const proyeccion = proyectarEnRuta(ruta, punto, Math.max(indiceUltimo, 0));
  if (!proyeccion || proyeccion.lejania > MAXIMO_FUERA_DE_RECORRIDO_M) {
    return { ultimoSuperado, lejania: proyeccion?.lejania ?? null };
  }
  let nuevo = ultimoSuperado;
  // El último paradero no se "supera": el viaje termina ahí y se cierra al finalizar el viaje.
  for (let i = 0; i < paraderos.length - 1; i++) {
    if (paraderos[i].orden > nuevo && proyeccion.avance >= ruta.posiciones[i] + MARGEN_SUPERADO_M) {
      nuevo = paraderos[i].orden;
    }
  }
  return { ultimoSuperado: nuevo, lejania: proyeccion.lejania, avance: proyeccion.avance };
}

/** El punto que queda a `metros` del inicio, avanzando por la ruta (o por los puntos dados). */
function puntoEnRecorrido(rutaOPuntos, metros) {
  const puntos = Array.isArray(rutaOPuntos) ? rutaOPuntos : rutaOPuntos.puntos;
  let restante = Math.max(metros, 0);
  for (let i = 1; i < puntos.length; i++) {
    const tramo = distancia(puntos[i - 1], puntos[i]);
    if (restante <= tramo && tramo > 0) {
      const t = restante / tramo;
      const a = puntos[i - 1];
      const b = puntos[i];
      return {
        latitud: a.latitud + (b.latitud - a.latitud) * t,
        longitud: a.longitud + (b.longitud - a.longitud) * t,
      };
    }
    restante -= tramo;
  }
  const ultimo = puntos[puntos.length - 1];
  return { latitud: ultimo.latitud, longitud: ultimo.longitud };
}

/**
 * Simplifica una polilínea (Douglas-Peucker): quita puntos que se desvían menos de
 * `toleranciaM` metros de la línea entre sus vecinos. Para guardar trazados livianos.
 * @param {number[][]} lista puntos [latitud, longitud]
 */
function simplificar(lista, toleranciaM = 3) {
  if (lista.length <= 2) return lista.slice();
  const origen = { latitud: lista[0][0], longitud: lista[0][1] };
  const m = lista.map(([latitud, longitud]) => aMetros({ latitud, longitud }, origen));
  const conservar = new Uint8Array(lista.length);
  conservar[0] = 1;
  conservar[lista.length - 1] = 1;
  const pendientes = [[0, lista.length - 1]];
  while (pendientes.length > 0) {
    const [ini, fin] = pendientes.pop();
    const a = m[ini];
    const b = m[fin];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const largo2 = dx * dx + dy * dy;
    let peor = -1;
    let indicePeor = -1;
    for (let i = ini + 1; i < fin; i++) {
      const p = m[i];
      let d;
      if (largo2 === 0) d = Math.hypot(p.x - a.x, p.y - a.y);
      else {
        const t = Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2, 0), 1);
        d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
      }
      if (d > peor) {
        peor = d;
        indicePeor = i;
      }
    }
    if (peor > toleranciaM) {
      conservar[indicePeor] = 1;
      pendientes.push([ini, indicePeor], [indicePeor, fin]);
    }
  }
  return lista.filter((_, i) => conservar[i]);
}

module.exports = {
  distancia,
  distanciasAcumuladas,
  crearRuta,
  leerTrazado,
  trazadoUtilizable,
  proyectar,
  proyectarEnRuta,
  calcularAvance,
  puntoEnRecorrido,
  simplificar,
  MARGEN_SUPERADO_M,
  MAXIMO_FUERA_DE_RECORRIDO_M,
  MAXIMO_PARADERO_FUERA_DEL_TRAZADO_M,
};
