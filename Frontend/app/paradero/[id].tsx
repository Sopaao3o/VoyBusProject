import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { obtenerParadero } from '../../src/api/red';
import { Cargando, ErrorMensaje } from '../../src/components/Estados';
import { Aviso, InsigniaLinea } from '../../src/components/Etiquetas';
import { useApi } from '../../src/hooks/useApi';
import { colors } from '../../src/theme/colors';

// RED-02: un paradero con sus coordenadas y las líneas que pasan por él.
export default function ParaderoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    datos: paradero,
    cargando,
    error,
    recargar,
  } = useApi(() => obtenerParadero(Number(id)), [id]);

  if (cargando && !paradero) return <Cargando />;
  if (error || !paradero)
    return (
      <ErrorMensaje mensaje={error ?? 'No se encontró el paradero.'} onReintentar={recargar} />
    );

  return (
    <ScrollView contentContainerStyle={styles.contenido}>
      <Stack.Screen options={{ title: paradero.nombre }} />
      <View style={styles.tarjeta}>
        <Text style={styles.nombre}>{paradero.nombre}</Text>
        <Text style={styles.dato}>Código {paradero.codigo}</Text>
        <Text style={styles.dato}>
          Ubicación: {paradero.latitud.toFixed(5)}, {paradero.longitud.toFixed(5)}
        </Text>
      </View>

      <Text style={styles.subtitulo}>Líneas que pasan por aquí</Text>
      {paradero.lineas.length === 0 && (
        <Text style={styles.dato}>Ninguna línea activa pasa por este paradero.</Text>
      )}
      {paradero.lineas.map((l) => (
        <Pressable
          key={l.id}
          style={styles.linea}
          onPress={() => router.push(`/linea/${l.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`Línea ${l.codigo}, ${l.nombre}`}
        >
          <View style={styles.fila}>
            <InsigniaLinea linea={l} />
            <Text style={styles.lineaNombre}>{l.nombre}</Text>
          </View>
          {l.aviso && <Aviso texto={l.aviso} />}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 12 },
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  nombre: { fontSize: 20, fontWeight: '700', color: colors.text },
  dato: { color: colors.textMuted },
  subtitulo: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 8 },
  linea: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineaNombre: { flex: 1, fontSize: 16, color: colors.text, fontWeight: '500' },
});
