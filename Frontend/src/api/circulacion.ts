import { api } from './client';
import type {
  EstadoFlotaSimulada,
  MicroProxima,
  Monitoreo,
  ParaderoCercano,
  VehiculoCirculacion,
} from './tipos';

const dato = <T>(r: { data: T }) => r.data;

// RED-03 (públicas): micros en circulación, paraderos cercanos y micros que se acercan.
export const vehiculosEnCirculacion = (lineaId?: number) =>
  api<VehiculoCirculacion[]>(`/vehiculos${lineaId ? `?linea_id=${lineaId}` : ''}`).then(dato);

export const paraderosCercanos = (latitud: number, longitud: number, limite = 1) =>
  api<ParaderoCercano[]>(
    `/paraderos/cercanos?latitud=${latitud}&longitud=${longitud}&limite=${limite}`,
  ).then(dato);

export const microsProximas = (paraderoId: number) =>
  api<MicroProxima[]>(`/paraderos/${paraderoId}/proximas`).then(dato);

// ADM-04 (administrador).
export const monitoreo = () => api<Monitoreo>('/admin/monitoreo').then(dato);

// Simulador de flota (solo desarrollo).
export const estadoFlotaSimulada = () => api<EstadoFlotaSimulada>('/simulador/flota').then(dato);
export const iniciarFlotaSimulada = () =>
  api<EstadoFlotaSimulada>('/simulador/flota/iniciar', { method: 'POST' }).then(dato);
export const detenerFlotaSimulada = () =>
  api<EstadoFlotaSimulada>('/simulador/flota/detener', { method: 'POST' }).then(dato);
