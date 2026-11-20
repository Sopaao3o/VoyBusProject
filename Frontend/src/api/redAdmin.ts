import { api } from './client';
import type {
  LineaAdmin,
  LineaAdminDetalle,
  LineaBody,
  ParaderoAdmin,
  ParaderoAdminDetalle,
  ParaderoBody,
  RecorridoAdmin,
  RecorridoBody,
} from './tipos';

// ADM-01: solo administrador.
const dato = <T>(r: { data: T }) => r.data;

export const listarLineasAdmin = () => api<LineaAdmin[]>('/admin/red/lineas').then(dato);
export const obtenerLineaAdmin = (id: number) =>
  api<LineaAdminDetalle>(`/admin/red/lineas/${id}`).then(dato);
export const crearLinea = (body: LineaBody) =>
  api<LineaAdminDetalle>('/admin/red/lineas', { method: 'POST', body }).then(dato);
export const editarLinea = (id: number, body: Partial<LineaBody>) =>
  api<LineaAdminDetalle>(`/admin/red/lineas/${id}`, { method: 'PUT', body }).then(dato);

export const obtenerRecorridoAdmin = (id: number) =>
  api<RecorridoAdmin>(`/admin/red/recorridos/${id}`).then(dato);
export const crearRecorrido = (lineaId: number, body: RecorridoBody) =>
  api<RecorridoAdmin>(`/admin/red/lineas/${lineaId}/recorridos`, { method: 'POST', body }).then(
    dato,
  );
export const editarRecorrido = (id: number, body: Partial<Omit<RecorridoBody, 'sentido'>>) =>
  api<RecorridoAdmin>(`/admin/red/recorridos/${id}`, { method: 'PUT', body }).then(dato);

export const listarParaderosAdmin = () => api<ParaderoAdmin[]>('/admin/red/paraderos').then(dato);
export const obtenerParaderoAdmin = (id: number) =>
  api<ParaderoAdminDetalle>(`/admin/red/paraderos/${id}`).then(dato);
export const crearParadero = (body: ParaderoBody) =>
  api<ParaderoAdminDetalle>('/admin/red/paraderos', { method: 'POST', body }).then(dato);
export const editarParadero = (id: number, body: Partial<ParaderoBody>) =>
  api<ParaderoAdminDetalle>(`/admin/red/paraderos/${id}`, { method: 'PUT', body }).then(dato);
