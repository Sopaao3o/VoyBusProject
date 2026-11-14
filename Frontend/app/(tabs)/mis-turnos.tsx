import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { misTurnos } from '../../src/api/conductor';
import { Cargando, ErrorMensaje, Vacio } from '../../src/components/Estados';
import { InsigniaEstadoTurno } from '../../src/components/EstadoTurno';
import { useApi } from '../../src/hooks/useApi';
import { useUsuario } from '../../src/session/UsuarioContext';
import { colors } from '../../src/theme/colors';
import { fechaHora, rangoHoras } from '../../src/utils/fechas';

// VEH-03: turnos asignados al conductor.
export default function MisTurnosScreen() {
  const router = useRouter();
  const { usuario } = useUsuario();
  const { datos, cargando, error, recargar } = useApi(misTurnos, [usuario?.id ?? null]);

  useFocusEffect(
    useCallback(() => {
      recargar();
    }, [recargar]),
  );

  if (usuario?.rol !== 'conductor') {
    return <ErrorMensaje mensaje="Esta sección es solo para conductores." />;
  }
  if (cargando && !datos) return <Cargando />;
  if (error) return <ErrorMensaje mensaje={error} onReintentar={recargar} />;

  return (
    <FlatList
      data={datos ?? []}
      keyExtractor={(t) => String(t.id)}
      contentContainerStyle={styles.lista}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} />}
      ListEmptyComponent={<Vacio mensaje="No tienes turnos asignados." />}
      renderItem={({ item }) => (
        <Pressable
          style={styles.tarjeta}
          onPress={() => router.push(`/conductor/turno/${item.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`Turno del ${fechaHora(item.inicio_planificado)}, ${item.estado}`}
        >
          <View style={styles.fila}>
            <Text style={styles.titulo}>{fechaHora(item.inicio_planificado)}</Text>
            <InsigniaEstadoTurno estado={item.estado} />
          </View>
          <Text style={styles.detalle}>
            {rangoHoras(item.inicio_planificado, item.termino_planificado)} · Vehículo{' '}
            {item.vehiculo.identificador}
          </Text>
          <Text style={styles.detalle}>
            {item.viajes.length} {item.viajes.length === 1 ? 'viaje' : 'viajes'}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  lista: { padding: 16, gap: 10 },
  tarjeta: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titulo: { fontSize: 16, fontWeight: '700', color: colors.text },
  detalle: { color: colors.textMuted, fontSize: 14 },
});
