import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

export function Cargando() {
  return (
    <View style={styles.centro}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function ErrorMensaje({
  mensaje,
  onReintentar,
}: {
  mensaje: string;
  onReintentar?: () => void;
}) {
  return (
    <View style={styles.centro}>
      <Text style={styles.error}>{mensaje}</Text>
      {onReintentar && (
        <Pressable style={styles.boton} onPress={onReintentar} accessibilityRole="button">
          <Text style={styles.botonTexto}>Reintentar</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Vacio({ mensaje }: { mensaje: string }) {
  return (
    <View style={styles.centro}>
      <Text style={styles.vacio}>{mensaje}</Text>
    </View>
  );
}

/** Error de un formulario, mostrado sobre el botón de enviar. */
export function CajaError({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null;
  return (
    <Text style={styles.cajaError} accessibilityRole="alert">
      {mensaje}
    </Text>
  );
}

const styles = StyleSheet.create({
  cajaError: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    color: colors.accent,
    fontWeight: '600',
  },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  error: { color: colors.accent, fontSize: 16, textAlign: 'center' },
  vacio: { color: colors.textMuted, fontSize: 16, textAlign: 'center' },
  boton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  botonTexto: { color: colors.surface, fontWeight: '600' },
});
