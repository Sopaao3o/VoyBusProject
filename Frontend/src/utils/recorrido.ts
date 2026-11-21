// Cálculos sobre un recorrido: el camino que se dibuja en el mapa y que sigue el simulador de
// GPS. Es el trazado por las calles si el recorrido lo tiene, o tramos rectos entre paraderos.
import type { Trazado } from '../api/tipos';

export interface Punto {
  latitud: number;
  longitud: number;
}

const METROS_POR_GRADO_LAT = 110_540;
const METROS_POR_GRADO_LNG_ECUADOR = 111_320;

/** Distancia aproximada en metros entre dos puntos cercanos (dentro de una ciudad). */
export function distanciaMetros(a: Punto, b: Punto) {
  const coseno = Math.cos((a.latitud * Math.PI) / 180);
  const x = (b.longitud - a.longitud) * METROS_POR_GRADO_LNG_ECUADOR * coseno;
  const y = (b.latitud - a.latitud) * METROS_POR_GRADO_LAT;
  return Math.hypot(x, y);
}

/** Largo total del recorrido en metros. */
export function largoRecorrido(puntos: Punto[]) {
  let total = 0;
  for (let i = 1; i < puntos.length; i++) total += distanciaMetros(puntos[i - 1], puntos[i]);
  return total;
}

/** El punto que queda a `metros` del inicio, avanzando por el recorrido. */
export function puntoEnRecorrido(puntos: Punto[], metros: number): Punto {
  if (puntos.length === 0) throw new Error('El recorrido no tiene paraderos');
  let restante = Math.max(metros, 0);
  for (let i = 1; i < puntos.length; i++) {
    const tramo = distanciaMetros(puntos[i - 1], puntos[i]);
    if (restante <= tramo && tramo > 0) {
      const t = restante / tramo;
      return {
        latitud: puntos[i - 1].latitud + (puntos[i].latitud - puntos[i - 1].latitud) * t,
        longitud: puntos[i - 1].longitud + (puntos[i].longitud - puntos[i - 1].longitud) * t,
      };
    }
    restante -= tramo;
  }
  return puntos[puntos.length - 1];
}

/** Los puntos del camino del recorrido: su trazado por las calles o sus paraderos en orden. */
export function caminoDelRecorrido(
  paraderos: (Punto & { orden: number })[],
  trazado?: Trazado | null,
): Punto[] {
  if (trazado && trazado.length >= 2) {
    return trazado.map(([latitud, longitud]) => ({ latitud, longitud }));
  }
  return [...paraderos]
    .sort((a, b) => a.orden - b.orden)
    .map((p) => ({ latitud: p.latitud, longitud: p.longitud }));
}

/** El mismo camino con el formato que usa react-native-maps. */
export function coordenadasMapa(puntos: Punto[]) {
  return puntos.map((p) => ({ latitude: p.latitud, longitude: p.longitud }));
}

/** Parte un camino en lo ya recorrido y lo que falta, según la posición de la micro. */
export function partirCamino(puntos: Punto[], posicion: Punto | null) {
  if (!posicion || puntos.length < 2) return { recorrido: [] as Punto[], falta: puntos };
  let mejor = { indice: 0, t: 0, d: Infinity };
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1];
    const b = puntos[i];
    const dx = b.longitud - a.longitud;
    const dy = b.latitud - a.latitud;
    const l2 = dx * dx + dy * dy;
    const t =
      l2 === 0
        ? 0
        : Math.min(
            Math.max(
              ((posicion.longitud - a.longitud) * dx + (posicion.latitud - a.latitud) * dy) / l2,
              0,
            ),
            1,
          );
    const q = { latitud: a.latitud + t * dy, longitud: a.longitud + t * dx };
    const d = distanciaMetros(q, posicion);
    if (d < mejor.d) mejor = { indice: i, t, d };
  }
  const a = puntos[mejor.indice - 1];
  const b = puntos[mejor.indice];
  const corte = {
    latitud: a.latitud + mejor.t * (b.latitud - a.latitud),
    longitud: a.longitud + mejor.t * (b.longitud - a.longitud),
  };
  return {
    recorrido: [...puntos.slice(0, mejor.indice), corte],
    falta: [corte, ...puntos.slice(mejor.indice)],
  };
}
