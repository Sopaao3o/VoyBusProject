import type { EstadoLinea, EstadoVehiculo, Puntualidad } from '../api/tipos';

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

/** "350 m" o "1,2 km". */
export function textoDistancia(metros: number) {
  if (metros < 1000) return `${Math.round(metros / 10) * 10} m`;
  return `${(metros / 1000).toFixed(1).replace('.', ',')} km`;
}

/** "hace 8 s", "hace 3 min". */
export function textoHace(segundos: number) {
  if (segundos < 60) return `hace ${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  return minutos < 60 ? `hace ${minutos} min` : `hace ${Math.floor(minutos / 60)} h`;
}

/** "a 2 paraderos", "llega al siguiente paradero". */
export function textoParaderosAntes(paraderos: number) {
  if (paraderos === 0) return 'es su próximo paradero';
  return `a ${paraderos} ${paraderos === 1 ? 'paradero' : 'paraderos'}`;
}

/** ADM-01: estado de servicio de una línea. */
export const ETIQUETA_ESTADO_LINEA: Record<EstadoLinea, string> = {
  activa: 'Activa',
  suspendida: 'Suspendida',
  desactivada: 'Desactivada',
};

/** Minúsculas y sin tildes, para buscar sin importar cómo se escribe ("colon" encuentra "Colón"). */
export function normalizarBusqueda(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
