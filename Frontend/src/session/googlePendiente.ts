import * as SecureStore from 'expo-secure-store';

// Inicio de sesión con Google en curso. Normalmente lo termina BotonGoogle al volver del navegador.
// Pero en Android, volver a Expo Go puede recargar la app y perder esa espera: por eso el código
// también se guarda en el teléfono, y la pantalla /google lo retira si nadie más lo está esperando.
const CLAVE = 'voybus_google_pendiente';
let esperandoEnMemoria = false;

export async function guardarPendiente(codigo: string) {
  esperandoEnMemoria = true;
  try {
    await SecureStore.setItemAsync(CLAVE, codigo);
  } catch {
    // Sin almacén seguro solo queda la espera en memoria.
  }
}

export async function terminarPendiente() {
  esperandoEnMemoria = false;
  try {
    await SecureStore.deleteItemAsync(CLAVE);
  } catch {
    // nada que borrar
  }
}

/** Código pendiente que quedó sin dueño (la app se recargó al volver de Google), o null. */
export async function pendienteHuerfano(): Promise<string | null> {
  if (esperandoEnMemoria) return null;
  try {
    return await SecureStore.getItemAsync(CLAVE);
  } catch {
    return null;
  }
}
