import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useUsuario } from '../../src/session/UsuarioContext';
import { colors } from '../../src/theme/colors';

export default function TabsLayout() {
  const { usuario } = useUsuario();
  const esAdmin = usuario.rol === 'administrador';
  const esConductor = usuario.rol === 'conductor';

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.surface,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Líneas',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bus-outline" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="paraderos"
        options={{
          title: 'Paraderos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="location-outline" color={color as string} size={size} />
          ),
        }}
      />
      {/* ADM-03: solo el administrador ve esta pestaña (href: null la oculta). */}
      <Tabs.Screen
        name="turnos"
        options={{
          title: 'Turnos',
          href: esAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color as string} size={size} />
          ),
        }}
      />
      {/* VEH-03: solo el conductor ve esta pestaña. */}
      <Tabs.Screen
        name="mis-turnos"
        options={{
          title: 'Mis turnos',
          href: esConductor ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="clipboard-outline" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="usuario"
        options={{
          title: 'Usuario',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color as string} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
