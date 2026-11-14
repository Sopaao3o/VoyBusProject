import { api } from './client';
import type {
  CambioPasswordBody,
  Configuracion2fa,
  InicioSesionBody,
  RegistroPasajeroBody,
  RegistroPasajeroRespuesta,
  Respuesta2fa,
  RespuestaCambioPassword,
  RespuestaInicioSesion,
  RespuestaRecuperacion,
  SesionAutenticada,
  VerificarContactoBody,
} from './tipos';

const dato = <T>(r: { data: T }) => r.data;

// ACC-01: registro público de pasajeros y verificación del contacto.
export const registrarPasajero = (body: RegistroPasajeroBody) =>
  api<RegistroPasajeroRespuesta>('/auth/registro', { method: 'POST', body }).then(dato);

export const verificarContacto = (body: VerificarContactoBody) =>
  api<SesionAutenticada>('/auth/verificar-contacto', { method: 'POST', body }).then(dato);

/** Pide un código nuevo para una cuenta que todavía no verifica su contacto. */
export const reenviarCodigo = (contacto: { correo: string } | { telefono: string }) =>
  api<{ mensaje: string; codigo_desarrollo?: string; expira_en?: string }>(
    '/auth/reenviar-codigo',
    { method: 'POST', body: contacto },
  ).then(dato);

export const entrarComoInvitado = () =>
  api<SesionAutenticada>('/auth/invitado', { method: 'POST' }).then(dato);

// ACC-02: inicio de sesión. Si la cuenta tiene 2FA, responde un desafío en vez de la sesión.
export const iniciarSesion = (body: InicioSesionBody) =>
  api<RespuestaInicioSesion>('/auth/iniciar-sesion', { method: 'POST', body }).then(dato);

export const verificarSegundoFactor = (desafio: string, codigo: string) =>
  api<SesionAutenticada>('/auth/2fa/verificar', {
    method: 'POST',
    body: { desafio, codigo },
  }).then(dato);

// ACC-03: cierre de sesión (el servidor invalida el token).
export const cerrarSesion = () =>
  api<{ sesion_cerrada: boolean }>('/auth/cerrar-sesion', {
    method: 'POST',
    body: { confirmar: true },
  }).then(dato);

// ACC-01: verificación en dos pasos con una aplicación autenticadora.
export const iniciarConfiguracion2fa = () =>
  api<Configuracion2fa>('/auth/2fa/iniciar', { method: 'POST' }).then(dato);

export const confirmar2fa = (codigo: string) =>
  api<Respuesta2fa>('/auth/2fa/confirmar', { method: 'POST', body: { codigo } }).then(dato);

export const desactivar2fa = (password_actual: string, codigo: string) =>
  api<Respuesta2fa>('/auth/2fa/desactivar', {
    method: 'POST',
    body: { password_actual, codigo },
  }).then(dato);

// ACC-04: recuperación y cambio de contraseña.
export const recuperarPassword = (correo: string) =>
  api<RespuestaRecuperacion>('/auth/recuperar-password', {
    method: 'POST',
    body: { correo },
  }).then(dato);

export const restablecerPassword = (token: string, password: string, confirmacion: string) =>
  api<{ mensaje: string }>('/auth/restablecer-password', {
    method: 'POST',
    body: { token, password, confirmacion },
  }).then(dato);

export const cambiarPassword = (body: CambioPasswordBody) =>
  api<RespuestaCambioPassword>('/auth/cambiar-password', { method: 'POST', body }).then(dato);
