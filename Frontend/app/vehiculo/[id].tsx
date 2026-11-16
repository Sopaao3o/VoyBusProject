import { Stack, useLocalSearchParams } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { historialDeVehiculo, listarIncidencias, listarVehiculos } from '../../src/api/admin';
import { Cargando, ErrorMensaje } from '../../src/components/Estados';
import { TarjetaIncidencia } from '../../src/components/TarjetaIncidencia';
import { useApi } from '../../src/hooks/useApi';
import { colors } from '../../src/theme/colors';
import { fechaHora } from '../../src/utils/fechas';
import { etiquetaEstadoVehiculo } from '../../src/utils/textos';

// VEH-03 (administrador): un vehículo con su historial de cambios de estado (fecha, responsable
// y observación) y las incidencias que los conductores informaron sobre él.
export default function VehiculoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehiculoId = Number(id);
  const { datos, cargando, error, recargar } = useApi(async () => {
    const [vehiculos, historial, incidencias] = await Promise.all([
      listarVehiculos(),
      historialDeVehiculo(vehiculoId),
      listarIncidencias({ vehiculoId }),
    ]);
    return { vehiculo: vehiculos.find((v) => v.id === vehiculoId) ?? null, historial, incidencias };
  }, [vehiculoId]);

  if (cargando && !datos) return <Cargando />;
  if (error || !datos?.vehiculo) {
    return (
      <ErrorMensaje mensaje={error ?? 'No se encontró el vehículo.'} onReintentar={recargar} />
    );
  }
  const { vehiculo, historial, incidencias } = datos;

  return (
    <ScrollView
      contentContainerStyle={styles.contenido}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} />}
    >
      <Stack.Screen options={{ title: vehiculo.identificador }} />
      <View style={styles.tarjeta}>
        <Text style={styles.titulo}>{vehiculo.identificador}</Text>
        <Text style={styles.dato}>
          Patente {vehiculo.patente} · {vehiculo.capacidad} pasajeros
        </Text>
        <Text style={styles.dato}>
          Estado actual: {etiquetaEstadoVehiculo(vehiculo.estado_operativo)}
        </Text>
      </View>

      <Text style={styles.subtitulo}>Cambios de estado</Text>
      {historial.length === 0 && (
        <Text style={styles.dato}>Este vehículo no tiene cambios de estado registrados.</Text>
      )}
      {historial.map((h) => (
        <View key={h.id} style={styles.tarjeta}>
          <Text style={styles.cambio}>
            {etiquetaEstadoVehiculo(h.estado_anterior)} → {etiquetaEstadoVehiculo(h.estado_nuevo)}
          </Text>
          {h.motivo && <Text style={styles.motivo}>{h.motivo}</Text>}
          <Text style={styles.dato}>
            {h.responsable_nombre} · {fechaHora(h.fecha)}
          </Text>
        </View>
      ))}

      <Text style={styles.subtitulo}>Incidencias</Text>
      {incidencias.length === 0 && (
        <Text style={styles.dato}>No hay incidencias informadas para este vehículo.</Text>
      )}
      {incidencias.map((i) => (
        <TarjetaIncidencia key={i.id} incidencia={i} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  tarjeta: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  titulo: { fontSize: 18, fontWeight: '700', color: colors.text },
  subtitulo: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 4 },
  cambio: { fontSize: 15, fontWeight: '600', color: colors.text },
  motivo: { fontSize: 14, color: colors.text },
  dato: { fontSize: 14, color: colors.textMuted },
});
