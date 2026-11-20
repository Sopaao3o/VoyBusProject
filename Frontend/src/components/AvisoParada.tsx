import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAlertasParada } from '../session/AlertasParada';
import { useGpsConductor } from '../session/GpsConductor';
import { colors } from '../theme/colors';

/**
 * VEH-02: franja que aparece arriba de cualquier pantalla del conductor cuando hay
 * solicitudes de parada nuevas. No bloquea lo que está detrás ni pide confirmación:
 * se va sola, o al tocarla se abren las solicitudes del viaje.
 */
export function AvisoParada() {
  const { aviso, cerrarAviso } = useAlertasParada();
  const { viajeId } = useGpsConductor();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  if (!aviso) return null;

  const [primero, ...resto] = aviso.paraderos;
  return (
    <View style={[styles.contenedor, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Pressable
        style={styles.franja}
        onPress={() => {
          cerrarAviso();
          if (viajeId !== null) router.push(`/conductor/viaje/${viajeId}`);
        }}
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        accessibilityLabel={`Parada solicitada en ${primero.paradero.nombre}, ${primero.total} ${
          primero.total === 1 ? 'solicitud' : 'solicitudes'
        }`}
      >
        <Ionicons name="notifications" size={26} color={colors.surface} />
        <View style={styles.textos}>
          <Text style={styles.titulo}>Parada en {primero.paradero.nombre}</Text>
          <Text style={styles.detalle}>
            {primero.total} {primero.total === 1 ? 'solicitud' : 'solicitudes'} en este paradero
            {resto.length > 0
              ? ` · también: ${resto.map((r) => r.paradero.nombre).join(', ')}`
              : ''}
          </Text>
        </View>
        <Pressable
          onPress={cerrarAviso}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Ocultar el aviso"
        >
          <Ionicons name="close" size={22} color={colors.surface} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { position: 'absolute', left: 12, right: 12, zIndex: 100 },
  franja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.accent,
    borderRadius: 16,
    padding: 14,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  textos: { flex: 1, gap: 2 },
  titulo: { color: colors.surface, fontSize: 18, fontWeight: '800' },
  detalle: { color: colors.surface, fontSize: 14 },
});
