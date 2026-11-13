import { api } from './client';
import type {
  RegistroPasajeroBody,
  RegistroPasajeroRespuesta,
  SesionAutenticada,
  VerificarContactoBody,
} from './tipos';

const dato = <T>(r: { data: T }) => r.data;

// ACC-01: registro público de pasajeros (sin Google/Apple ni verificación en dos pasos).
export const registrarPasajero = (body: RegistroPasajeroBody) =>
  api<RegistroPasajeroRespuesta>('/auth/registro', { method: 'POST', body }).then(dato);

export const verificarContacto = (body: VerificarContactoBody) =>
  api<SesionAutenticada>('/auth/verificar-contacto', { method: 'POST', body }).then(dato);

export const entrarComoInvitado = () =>
  api<SesionAutenticada>('/auth/invitado', { method: 'POST' }).then(dato);
