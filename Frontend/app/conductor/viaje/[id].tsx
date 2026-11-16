import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { solicitudesDeParada } from '../../../src/api/conductor';
import { Cargando, ErrorMensaje } from '../../../src/components/Estados';
import { useApi } from '../../../src/hooks/useApi';
import { colors } from '../../../src/theme/colors';
import { horaLocal } from '../../../src/utils/fechas';

const SEGUNDOS_ENTRE_ACTUALIZACIONES = 5;

// VEH-03 / VIA-02: solicitudes de parada de un viaje, agrupadas por paradero y en orden de recorrido.
export default function SolicitudesViajeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { datos, cargando, error, recargar } = useApi(() => solicitudesDeParada(Number(id)), [id]);

  // Se actualiza sola mientras la pantalla está abierta.
  useEffect(() => {
    const t = setInterval(recargar, SEGUNDOS_ENTRE_ACTUALIZACIONES * 1000);
    return () => clearInterval(t);
  }, [recargar]);

  if (cargando && !datos) return <Cargando />;
  if (error && !datos) return <ErrorMensaje mensaje={error} onReintentar={recargar} />;

  const total = datos?.reduce((n, g) => n + g.total, 0) ?? 0;

  return (
    <ScrollView
      contentContainerStyle={styles.contenido}
      refreshControl={<RefreshControl refreshing={false} onRefresh={recargar} />}
    >
      <Stack.Screen options={{ title: 'Solicitudes de parada' }} />
      <Text style={styles.resumen}>
        {total === 0
          ? 'Aún no hay solicitudes de parada.'
          : `${total} ${total === 1 ? 'solicitud' : 'solicitudes'} en ${datos?.length} ${datos?.length === 1 ? 'paradero' : 'paraderos'}`}
      </Text>
      <Text style={styles.ayuda}>Se actualiza cada {SEGUNDOS_ENTRE_ACTUALIZACIONES} segundos.</Text>

      {datos?.map((g) => (
        <View key={g.paradero.id} style={styles.grupo}>
          <View style={styles.cabecera}>
            <Text style={styles.orden}>{g.paradero.orden}</Text>
            <Text style={styles.paradero}>{g.paradero.nombre}</Text>
            <Text style={styles.total}>{g.total}</Text>
          </View>
          {g.solicitudes.map((s) => (
            <Text key={s.id} style={styles.solicitud}>
              {s.pasajero_nombre} · {horaLocal(s.creada_en)} ·{' '}
              {s.estado === 'proxima' ? 'próxima parada' : 'enviada'}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 12 },
  resumen: { fontSize: 17, fontWeight: '700', color: colors.text },
  ayuda: { fontSize: 12, color: colors.textMuted },
  grupo: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orden: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.secondary,
    color: colors.onSecondary,
    textAlign: 'center',
    lineHeight: 28,
    fontWeight: '700',
    overflow: 'hidden',
  },
  paradero: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  total: { fontSize: 18, fontWeight: '800', color: colors.accent },
  solicitud: { color: colors.textMuted, fontSize: 14, paddingLeft: 38 },
});
