import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import { canjearCodigoGoogle } from '../src/api/auth';
import { textoDeError } from '../src/api/client';
import { Cargando } from '../src/components/Estados';
import { pendienteHuerfano, terminarPendiente } from '../src/session/googlePendiente';
import { useUsuario } from '../src/session/UsuarioContext';

// Al terminar el inicio de sesión con Google, el navegador vuelve a la app con un enlace a esta
// ruta. Normalmente lo procesa BotonGoogle y esta pantalla solo se cierra. Si la app se recargó
// al volver (pasa en Android con Expo Go), aquí se retira la sesión que quedó pendiente.
WebBrowser.maybeCompleteAuthSession();

export default function RetornoGoogle() {
  const router = useRouter();
  const { iniciarSesion } = useUsuario();

  useEffect(() => {
    let vigente = true;
    (async () => {
      const codigo = await pendienteHuerfano();
      if (codigo) {
        try {
          const respuesta = await canjearCodigoGoogle(codigo);
          await terminarPendiente();
          if (!vigente) return;
          if ('requiere_2fa' in respuesta) {
            router.replace({ pathname: '/login', params: { desafio: respuesta.desafio } });
          } else {
            iniciarSesion(respuesta);
            router.replace('/');
          }
          return;
        } catch (e) {
          await terminarPendiente();
          if (vigente) Alert.alert('Inicio de sesión con Google', textoDeError(e));
        }
      }
      if (!vigente) return;
      if (router.canGoBack()) router.back();
      else router.replace('/');
    })();
    return () => {
      vigente = false;
    };
  }, [router, iniciarSesion]);

  return <Cargando />;
}
