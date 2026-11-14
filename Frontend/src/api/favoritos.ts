import { api } from './client';
import type { Paradero } from './tipos';

const dato = <T>(r: { data: T }) => r.data;

// RED-02: paraderos favoritos (solo pasajeros registrados). Se guardan en el servidor,
// así que se conservan entre sesiones y dispositivos.
export const listarParaderosFavoritos = () => api<Paradero[]>('/favoritos/paraderos').then(dato);

export const agregarParaderoFavorito = (paraderoId: number) =>
  api<{ favorito: boolean }>(`/favoritos/paraderos/${paraderoId}`, { method: 'PUT' }).then(dato);

export const quitarParaderoFavorito = (paraderoId: number) =>
  api<{ favorito: boolean }>(`/favoritos/paraderos/${paraderoId}`, { method: 'DELETE' }).then(dato);
