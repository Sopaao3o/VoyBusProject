import { api } from './client';
import type {
  Configuracion,
  ConductorOpcion,
  TurnoDetalle,
  TurnoNuevo,
  TurnoResumen,
  VehiculoOpcion,
} from './tipos';

// ADM-03: solo administrador.
export const listarTurnos = (fecha = '') =>
  api<TurnoResumen[]>(`/admin/turnos${fecha ? `?fecha=${encodeURIComponent(fecha)}` : ''}`).then(
    (r) => r.data,
  );

export const obtenerTurno = (id: number) =>
  api<TurnoDetalle>(`/admin/turnos/${id}`).then((r) => r.data);

export const crearTurno = (turno: TurnoNuevo) =>
  api<TurnoDetalle>('/admin/turnos', { method: 'POST', body: turno }).then((r) => r.data);

export const modificarTurno = (id: number, turno: TurnoNuevo) =>
  api<TurnoDetalle>(`/admin/turnos/${id}`, { method: 'PUT', body: turno }).then((r) => r.data);

export const listarConductores = () =>
  api<ConductorOpcion[]>('/admin/conductores').then((r) => r.data);

export const listarVehiculos = () => api<VehiculoOpcion[]>('/admin/vehiculos').then((r) => r.data);

export const obtenerConfiguracion = () =>
  api<Configuracion>('/admin/configuracion').then((r) => r.data);

export const actualizarMargen = (margen_tolerancia_min: number) =>
  api<Configuracion>('/admin/configuracion', {
    method: 'PUT',
    body: { margen_tolerancia_min },
  }).then((r) => r.data);
