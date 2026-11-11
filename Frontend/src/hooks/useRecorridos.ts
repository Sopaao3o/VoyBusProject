import { useApi } from './useApi';
import { listarLineas, obtenerLinea } from '../api/red';

export interface RecorridoOpcion {
  id: number;
  linea: string;
  sentido: 'ida' | 'vuelta';
  titulo: string; // "103 · Ida"
  detalle: string; // nombre de la línea
}

/** Todos los recorridos de todas las líneas, para elegirlos al armar un turno. */
export function useRecorridos() {
  return useApi<RecorridoOpcion[]>(async () => {
    const lineas = await listarLineas();
    const detalles = await Promise.all(lineas.map((l) => obtenerLinea(l.id)));
    return detalles.flatMap((l) =>
      l.recorridos.map((r) => ({
        id: r.id,
        linea: l.codigo,
        sentido: r.sentido,
        titulo: `${l.codigo} · ${r.sentido === 'ida' ? 'Ida' : 'Vuelta'}`,
        detalle: l.nombre,
      })),
    );
  });
}
