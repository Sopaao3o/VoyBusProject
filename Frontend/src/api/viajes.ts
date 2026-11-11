import { api } from './client';
import type { ParaderosDisponibles, SolicitudParada, ViajeEnCurso } from './tipos';

const dato = <T>(r: { data: T }) => r.data;

// VIA-02: solo pasajeros.
export const paraderosDisponibles = (viajeId: number) =>
  api<ParaderosDisponibles>(`/viajes/${viajeId}/paraderos-disponibles`).then(dato);

export const solicitarParada = (viajeId: number, paraderoId: number) =>
  api<SolicitudParada>(`/viajes/${viajeId}/solicitudes-parada`, {
    method: 'POST',
    body: { paradero_id: paraderoId },
  }).then(dato);

// Solo desarrollo: reemplazan a la vinculación por QR (VIA-01) y al GPS del conductor.
export const viajesEnCurso = () => api<ViajeEnCurso[]>('/simulador/viajes-en-curso').then(dato);

export const avanzarVehiculo = (viajeId: number) =>
  api<{ ultimo_orden_superado: number }>(`/simulador/viajes/${viajeId}/avanzar`, {
    method: 'POST',
  }).then(dato);
