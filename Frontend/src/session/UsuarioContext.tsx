import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { cerrarSesion as cerrarSesionEnServidor } from '../api/auth';
import { avisarSesionPerdida, fijarToken } from '../api/client';
import type { UsuarioSesion } from '../api/tipos';

interface Contexto {
  /** Cuenta con sesión iniciada, o null si se está navegando sin sesión. */
  usuario: UsuarioSesion | null;
  /** Guarda la sesión que devuelve el servidor (login, verificación de contacto o invitado). */
  iniciarSesion: (sesion: { usuario: UsuarioSesion; token: string }) => void;
  /** Reemplaza el token sin cambiar de cuenta (al cambiar la contraseña). */
  renovarToken: (token: string) => void;
  /** Actualiza los datos de la cuenta (por ejemplo, al activar la verificación en dos pasos). */
  actualizarUsuario: (usuario: UsuarioSesion) => void;
  /** ACC-03: cierra la sesión en el servidor y en la app. */
  cerrarSesion: () => Promise<void>;
}

const UsuarioContext = createContext<Contexto | null>(null);

// La sesión vive en memoria: al cerrar la app hay que iniciar sesión de nuevo.
export function UsuarioProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);

  const iniciarSesion = useCallback((sesion: { usuario: UsuarioSesion; token: string }) => {
    fijarToken(sesion.token);
    setUsuario(sesion.usuario);
  }, []);

  const renovarToken = useCallback((token: string) => fijarToken(token), []);

  const olvidarSesion = useCallback(() => {
    fijarToken(null);
    setUsuario(null);
  }, []);

  const cerrarSesion = useCallback(async () => {
    try {
      await cerrarSesionEnServidor();
    } catch {
      // Sin conexión o con el token ya vencido, igual se cierra la sesión en la app.
    }
    olvidarSesion();
  }, [olvidarSesion]);

  // Si el servidor rechaza el token (expiró o se cerró en otro lado), la app vuelve a "sin sesión".
  useEffect(() => {
    avisarSesionPerdida(olvidarSesion);
    return () => avisarSesionPerdida(null);
  }, [olvidarSesion]);

  const valor = useMemo(
    () => ({
      usuario,
      iniciarSesion,
      renovarToken,
      actualizarUsuario: setUsuario,
      cerrarSesion,
    }),
    [usuario, iniciarSesion, renovarToken, cerrarSesion],
  );
  return <UsuarioContext.Provider value={valor}>{children}</UsuarioContext.Provider>;
}

export function useUsuario() {
  const ctx = useContext(UsuarioContext);
  if (!ctx) throw new Error('useUsuario debe usarse dentro de UsuarioProvider');
  return ctx;
}
