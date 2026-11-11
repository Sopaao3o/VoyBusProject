import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { obtenerLinea } from '../../src/api/red';
import { Cargando, ErrorMensaje } from '../../src/components/Estados';
import { Aviso, InsigniaLinea } from '../../src/components/Etiquetas';
import { useApi } from '../../src/hooks/useApi';
import { colors } from '../../src/theme/colors';

// RED-01: una línea con sus recorridos (ida/vuelta), días, horarios y paraderos en orden.
export default function LineaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { datos: linea, cargando, error, recargar } = useApi(() => obtenerLinea(Number(id)), [id]);

  if (cargando && !linea) return <Cargando />;
  if (error || !linea)
    return <ErrorMensaje mensaje={error ?? 'No se encontró la línea.'} onReintentar={recargar} />;

  return (
    <ScrollView contentContainerStyle={styles.contenido}>
      <Stack.Screen options={{ title: `Línea ${linea.codigo}` }} />
      <View style={styles.encabezado}>
        <InsigniaLinea linea={linea} />
        <Text style={styles.nombre}>{linea.nombre}</Text>
      </View>
      {linea.aviso && <Aviso texto={linea.aviso} />}

      {linea.recorridos.map((r) => (
        <View key={r.id} style={styles.recorrido}>
          <Text style={styles.sentido}>{r.sentido === 'ida' ? 'Ida' : 'Vuelta'}</Text>
          <Text style={styles.dato}>Días: {r.dias_funcionamiento}</Text>
          <Text style={styles.dato}>Horarios: {r.horarios}</Text>
          {r.paraderos.map((p) => (
            <Pressable
              key={p.id}
              style={styles.paradero}
              onPress={() => router.push(`/paradero/${p.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Paradero ${p.orden}: ${p.nombre}`}
            >
              <Text style={styles.orden}>{p.orden}</Text>
              <Text style={styles.paraderoNombre}>{p.nombre}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 14 },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nombre: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text },
  recorrido: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  sentido: { fontSize: 17, fontWeight: '700', color: colors.primary },
  dato: { color: colors.textMuted },
  paradero: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  orden: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.secondary,
    color: colors.onSecondary,
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '700',
    overflow: 'hidden',
  },
  paraderoNombre: { flex: 1, color: colors.text, fontSize: 15 },
});
