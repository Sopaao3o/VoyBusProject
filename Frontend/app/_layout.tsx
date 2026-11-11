import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { UsuarioProvider } from '../src/session/UsuarioContext';
import { colors } from '../src/theme/colors';

export default function RootLayout() {
  return (
    <UsuarioProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.surface,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="linea/[id]" options={{ title: 'Línea' }} />
        <Stack.Screen name="paradero/[id]" options={{ title: 'Paradero' }} />
      </Stack>
    </UsuarioProvider>
  );
}
