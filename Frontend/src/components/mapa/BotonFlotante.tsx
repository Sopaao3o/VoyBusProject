import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '../../theme/colors';

type Icono = ComponentProps<typeof Ionicons>['name'];

/** Botón redondo que flota sobre el mapa (volver, cuenta, mi ubicación). */
export function BotonFlotante({
  icono,
  texto,
  etiqueta,
  onPress,
}: {
  icono?: Icono;
  /** Texto corto en lugar del ícono, por ejemplo la inicial del nombre. */
  texto?: string;
  etiqueta: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.boton, pressed && styles.presionado]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      hitSlop={6}
    >
      {texto ? (
        <Text style={styles.texto}>{texto}</Text>
      ) : (
        <Ionicons name={icono ?? 'ellipse'} size={22} color={colors.text} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F2A4A',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  presionado: { opacity: 0.75 },
  texto: { fontSize: 18, fontWeight: '700', color: colors.primary },
});
