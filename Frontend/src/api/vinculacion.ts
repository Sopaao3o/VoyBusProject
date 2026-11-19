import { api } from './client';
import type { MicroParaVincular, Vinculacion } from './tipos';

const dato = <T>(r: { data: T }) => r.data;

// VIA-01: el pasajero (registrado o invitado) se vincula a la micro en que va.
export const consultarMicro = (codigo: string) =>
  api<MicroParaVincular>(`/vinculacion/vehiculos/${encodeURIComponent(codigo)}`).then(dato);

export const vincularme = (codigo: string) =>
  api<Vinculacion>('/vinculacion', { method: 'POST', body: { codigo } }).then(dato);

export const miVinculacion = () => api<Vinculacion | null>('/vinculacion').then(dato);

export const desvincularme = () =>
  api<{ viaje_id: number }>('/vinculacion', { method: 'DELETE' }).then(dato);

/** Texto que lleva el QR pegado en cada micro (lo imprime el administrador). */
export const textoQrDe = (identificador: string) => `voybus://vehiculo/${identificador}`;
