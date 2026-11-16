import type { EstadoVehiculo, Puntualidad } from '../api/tipos';

export const ETIQUETA_ESTADO_VEHICULO: Record<EstadoVehiculo, string> = {
  operativo: 'Operativo',
  operativo_con_observaciones: 'Operativo con observaciones',
  en_mantenimiento: 'En mantenimiento',
  fuera_de_servicio: 'Fuera de servicio',
};

export const etiquetaEstadoVehiculo = (estado: string) =>
  ETIQUETA_ESTADO_VEHICULO[estado as EstadoVehiculo] ?? estado;

export const ETIQUETA_ESTADO_VIAJE: Record<string, string> = {
  programado: 'Programado',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
};

/** "A tiempo", "Atraso de 12 min" o "Término anticipado (8 min antes)". Vacío si aún no hay hora real. */
export function textoPuntualidad(p: Puntualidad | null) {
  if (!p) return '';
  if (p.estado === 'atraso') return `Atraso de ${p.minutos} min`;
  if (p.estado === 'termino_anticipado')
    return `Término anticipado (${Math.abs(p.minutos)} min antes)`;
  return 'A tiempo';
}

export const hayDesviacion = (p: Puntualidad | null) => Boolean(p && p.estado !== 'a_tiempo');
