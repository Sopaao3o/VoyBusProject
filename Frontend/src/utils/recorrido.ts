// Cálculos sobre un recorrido (tramos rectos entre paraderos), usados por el simulador de GPS.

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
