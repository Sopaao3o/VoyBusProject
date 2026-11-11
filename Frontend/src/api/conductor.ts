import { api } from './client';
import type { EstadoVehiculoBody, GrupoSolicitudes, TurnoConductor } from './tipos';

// VEH-03: solo conductores habilitados.
const dato = <T>(r: { data: T }) => r.data;

export const misTurnos = () => api<TurnoConductor[]>('/conductor/turnos').then(dato);

export const miTurno = (id: number) => api<TurnoConductor>(`/conductor/turnos/${id}`).then(dato);

export const iniciarTurno = (id: number, body: EstadoVehiculoBody) =>
  api<TurnoConductor>(`/conductor/turnos/${id}/iniciar`, { method: 'POST', body }).then(dato);

export const finalizarTurno = (id: number, body: EstadoVehiculoBody) =>
  api<TurnoConductor>(`/conductor/turnos/${id}/finalizar`, { method: 'POST', body }).then(dato);

export const cambiarEstadoVehiculo = (id: number, body: EstadoVehiculoBody) =>
  api<TurnoConductor>(`/conductor/turnos/${id}/estado-vehiculo`, { method: 'POST', body }).then(
    dato,
  );

export const registrarIncidencia = (
  turnoId: number,
  body: { tipo: 'vehiculo' | 'recorrido'; descripcion: string },
) => api<unknown>(`/conductor/turnos/${turnoId}/incidencias`, { method: 'POST', body }).then(dato);

export const justificarTurno = (id: number, justificacion: string) =>
  api<TurnoConductor>(`/conductor/turnos/${id}/justificacion`, {
    method: 'PUT',
    body: { justificacion },
  }).then(dato);

export const iniciarViaje = (id: number) =>
  api<TurnoConductor>(`/conductor/viajes/${id}/iniciar`, { method: 'POST' }).then(dato);

export const finalizarViaje = (id: number) =>
  api<TurnoConductor>(`/conductor/viajes/${id}/finalizar`, { method: 'POST' }).then(dato);

export const justificarViaje = (id: number, justificacion: string) =>
  api<TurnoConductor>(`/conductor/viajes/${id}/justificacion`, {
    method: 'PUT',
    body: { justificacion },
  }).then(dato);

export const solicitudesDeParada = (viajeId: number) =>
  api<GrupoSolicitudes[]>(`/conductor/viajes/${viajeId}/solicitudes-parada`).then(dato);
