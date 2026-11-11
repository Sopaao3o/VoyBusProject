import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { viajesEnCurso } from '../../src/api/viajes';
import { Cargando, ErrorMensaje, Vacio } from '../../src/components/Estados';
import { useApi } from '../../src/hooks/useApi';
import { useUsuario } from '../../src/session/UsuarioContext';
import { colors } from '../../src/theme/colors';

// VIA-02: elegir el viaje en el que voy.
// PROVISORIO: cuando exista la vinculación por QR (VIA-01), el viaje vendrá del código escaneado
// y esta lista de prueba se reemplaza.
export default function ViajarScreen() {
  const router = useRouter();
  const { usuario } = useUsuario();
  const { datos, cargando, error, recargar } = useApi(viajesEnCurso, [usuario.id]);

  useFocusEffect(
    useCallback(() => {
      recargar();
    }, [recargar]),
  );

  if (usuario.rol !== 'pasajero') {
    return <ErrorMensaje mensaje="Esta sección es solo para pasajeros." />;
  }
  if (cargando && !datos) return <Cargando />;
  if (error) return <ErrorMensaje mensaje={error} onReintentar={recargar} />;

  return (
    <FlatList
      data={datos ?? []}
      keyExtractor={(v) => String(v.id)}
      contentContainerStyle={styles.lista}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} />}
      ListHeaderComponent={
        <Text style={styles.ayuda}>
          Modo de prueba: elige un viaje en curso. Más adelante se vinculará escaneando el QR del
          vehículo.
        </Text>
      }
      ListEmptyComponent={
        <Vacio mensaje="No hay viajes en curso. Un conductor debe iniciar un turno y un viaje." />
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.tarjeta}
          onPress={() => router.push(`/viaje/${item.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`Línea ${item.linea_codigo}, vehículo ${item.vehiculo_identificador}`}
        >
          <View style={styles.fila}>
            <Text style={styles.titulo}>Línea {item.linea_codigo}</Text>
            <Text style={styles.sentido}>{item.sentido === 'ida' ? 'Ida' : 'Vuelta'}</Text>
          </View>
          <Text style={styles.detalle}>{item.linea_nombre}</Text>
          <Text style={styles.detalle}>Vehículo {item.vehiculo_identificador}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  lista: { padding: 16, gap: 10 },
  ayuda: { color: colors.textMuted, marginBottom: 6 },
  tarjeta: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titulo: { fontSize: 17, fontWeight: '700', color: colors.text },
  sentido: { fontWeight: '700', color: colors.primary },
  detalle: { color: colors.textMuted, fontSize: 14 },
});
