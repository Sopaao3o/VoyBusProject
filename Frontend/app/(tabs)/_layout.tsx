import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors } from '../../src/theme/colors';

export default function TabsLayout() {
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
