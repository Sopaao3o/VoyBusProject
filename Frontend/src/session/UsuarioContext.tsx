import * as SecureStore from 'expo-secure-store';
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
  /** true mientras se recupera la sesión guardada al abrir la app. */
  cargando: boolean;
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

// La sesión se guarda cifrada en el teléfono (expo-secure-store) para no pedir la contraseña
// cada vez que se abre la app. Si el almacén falla, la app sigue funcionando solo en memoria.
const CLAVE_TOKEN = 'voybus_token';
const CLAVE_USUARIO = 'voybus_usuario';

async function guardar(clave: string, valor: string | null) {
  try {
    if (valor === null) await SecureStore.deleteItemAsync(clave);
    else await SecureStore.setItemAsync(clave, valor);
  } catch {
    // Sin almacén seguro (por ejemplo en la versión web) la sesión dura hasta cerrar la app.
  }
}

async function leerSesionGuardada(): Promise<{ usuario: UsuarioSesion; token: string } | null> {
  try {
    const [token, usuario] = await Promise.all([
      SecureStore.getItemAsync(CLAVE_TOKEN),
      SecureStore.getItemAsync(CLAVE_USUARIO),
    ]);
    if (!token || !usuario) return null;
    return { token, usuario: JSON.parse(usuario) as UsuarioSesion };
  } catch {
    return null;
  }
}

export function UsuarioProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [cargando, setCargando] = useState(true);

  // Al abrir la app se recupera la sesión guardada. Si el token ya no sirve, el servidor
  // responde 401 en la primera consulta privada y la sesión se descarta (ver olvidarSesion).
  useEffect(() => {
    let vigente = true;
    leerSesionGuardada().then((sesion) => {
      if (!vigente) return;
      if (sesion) {
        fijarToken(sesion.token);
        setUsuario(sesion.usuario);
      }
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const iniciarSesion = useCallback((sesion: { usuario: UsuarioSesion; token: string }) => {
    fijarToken(sesion.token);
    setUsuario(sesion.usuario);
    guardar(CLAVE_TOKEN, sesion.token);
    guardar(CLAVE_USUARIO, JSON.stringify(sesion.usuario));
  }, []);

  const renovarToken = useCallback((token: string) => {
    fijarToken(token);
    guardar(CLAVE_TOKEN, token);
  }, []);

  const actualizarUsuario = useCallback((nuevo: UsuarioSesion) => {
    setUsuario(nuevo);
    guardar(CLAVE_USUARIO, JSON.stringify(nuevo));
  }, []);

  // ACC-03: retira del dispositivo el acceso a la información privada de la cuenta.
  const olvidarSesion = useCallback(() => {
    fijarToken(null);
    setUsuario(null);
    guardar(CLAVE_TOKEN, null);
    guardar(CLAVE_USUARIO, null);
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
    () => ({ usuario, cargando, iniciarSesion, renovarToken, actualizarUsuario, cerrarSesion }),
    [usuario, cargando, iniciarSesion, renovarToken, actualizarUsuario, cerrarSesion],
  );
  return <UsuarioContext.Provider value={valor}>{children}</UsuarioContext.Provider>;
}

export function useUsuario() {
  const ctx = useContext(UsuarioContext);
  if (!ctx) throw new Error('useUsuario debe usarse dentro de UsuarioProvider');
  return ctx;
}
