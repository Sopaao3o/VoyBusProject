import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useUsuario } from '../../src/session/UsuarioContext';
import { colors } from '../../src/theme/colors';

// El mapa es la pantalla principal. Pasajeros, invitados y personas sin sesión solo ven el mapa
// (sin barra de pestañas); el administrador y el conductor tienen además sus pestañas de trabajo.
export default function TabsLayout() {
  const { usuario } = useUsuario();
  const esAdmin = usuario?.rol === 'administrador';
  const esConductor = usuario?.rol === 'conductor';
  const conPestanas = esAdmin || esConductor;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.surface,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: conPestanas ? undefined : { display: 'none' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          // ADM-04: para el administrador, el mapa es el monitoreo de la operación.
          title: esAdmin ? 'Monitoreo' : 'Mapa',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={esAdmin ? 'pulse-outline' : 'map-outline'}
              color={color as string}
              size={size}
            />
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
      {/* VEH-03: incidencias y estado de los vehículos, solo para el administrador. */}
      <Tabs.Screen
        name="flota"
        options={{
          title: 'Flota',
          href: esAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="construct-outline" color={color as string} size={size} />
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
    </Tabs>
  );
}
