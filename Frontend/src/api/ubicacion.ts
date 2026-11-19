import { api } from './client';
import type { AvanceViaje, UbicacionBody } from './tipos';

// VEH-01: el conductor envía la posición de su teléfono durante un viaje en curso.
export const enviarUbicacion = (viajeId: number, body: UbicacionBody) =>
  api<AvanceViaje>(`/conductor/viajes/${viajeId}/ubicacion`, { method: 'POST', body }).then(
    (r) => r.data,
  );
