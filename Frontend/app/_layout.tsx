import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { UsuarioProvider, useUsuario } from '../src/session/UsuarioContext';
import { colors } from '../src/theme/colors';

// Pantallas que solo se pueden ver con sesión iniciada (ACC-03).
const PANTALLAS_PRIVADAS = ['turno', 'conductor', 'viaje', 'cambiar-password', 'dos-factores'];
const PESTANAS_PRIVADAS = ['turnos', 'mis-turnos', 'viajar'];

function Navegacion() {
  const router = useRouter();
  const segmentos = useSegments() as string[];
  const { usuario, cargando } = useUsuario();
  const [primero, segundo] = segmentos;

  // Sin sesión (se cerró o expiró) no se puede seguir en una pantalla privada ni volver a ella
  // con el botón "atrás": se vacía la pila de pantallas y se abre el inicio de sesión.
  useEffect(() => {
    if (cargando || usuario) return;
    const enPestanaPrivada = primero === '(tabs)' && PESTANAS_PRIVADAS.includes(segundo);
    if (!enPestanaPrivada && !PANTALLAS_PRIVADAS.includes(primero)) return;

    if (enPestanaPrivada) router.navigate('/usuario');
    else if (router.canDismiss()) router.dismissAll();
    router.push('/login');
  }, [cargando, usuario, primero, segundo, router]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.surface,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: 'Iniciar sesión' }} />
      <Stack.Screen name="registro" options={{ title: 'Crear cuenta' }} />
      <Stack.Screen name="verificar" options={{ title: 'Verificar cuenta' }} />
      <Stack.Screen name="recuperar" options={{ title: 'Recuperar contraseña' }} />
      <Stack.Screen name="cambiar-password" options={{ title: 'Cambiar contraseña' }} />
      <Stack.Screen name="dos-factores" options={{ title: 'Verificación en dos pasos' }} />
      <Stack.Screen name="linea/[id]" options={{ title: 'Línea' }} />
      <Stack.Screen name="paradero/[id]" options={{ title: 'Paradero' }} />
      <Stack.Screen name="turno/[id]" options={{ title: 'Turno' }} />
      <Stack.Screen name="turno/formulario" options={{ title: 'Turno' }} />
      <Stack.Screen name="viaje/[id]" options={{ title: 'Viaje' }} />
      <Stack.Screen name="conductor/turno/[id]" options={{ title: 'Turno' }} />
      <Stack.Screen name="conductor/viaje/[id]" options={{ title: 'Viaje' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <UsuarioProvider>
      <StatusBar style="light" />
      <Navegacion />
    </UsuarioProvider>
  );
}
