import { api } from './client';
import type { Linea, LineaDetalle, Paradero, ParaderoDetalle } from './tipos';

// RED-01 y RED-02: consultas públicas.
export const listarLineas = (q = '') =>
  api<Linea[]>(`/lineas${q ? `?q=${encodeURIComponent(q)}` : ''}`).then((r) => r.data);

export const obtenerLinea = (id: number) => api<LineaDetalle>(`/lineas/${id}`).then((r) => r.data);

export const listarParaderos = (q = '') =>
  api<Paradero[]>(`/paraderos${q ? `?q=${encodeURIComponent(q)}` : ''}`).then((r) => r.data);

export const obtenerParadero = (id: number) =>
  api<ParaderoDetalle>(`/paraderos/${id}`).then((r) => r.data);
