import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { obtenerLinea } from '../../src/api/red';
import { Cargando, ErrorMensaje } from '../../src/components/Estados';
import { Aviso, InsigniaLinea } from '../../src/components/Etiquetas';
import { useApi } from '../../src/hooks/useApi';
import { colors } from '../../src/theme/colors';

// RED-01: una línea. Se elige un recorrido (ida o vuelta) y se muestran sus días, horarios
// y paraderos en orden. `?recorrido=` permite llegar con un sentido ya elegido.
export default function LineaScreen() {
  const { id, recorrido } = useLocalSearchParams<{ id: string; recorrido?: string }>();
  const router = useRouter();
  const { datos: linea, cargando, error, recargar } = useApi(() => obtenerLinea(Number(id)), [id]);
  const [elegido, setElegido] = useState<number | null>(recorrido ? Number(recorrido) : null);

  if (cargando && !linea) return <Cargando />;
  if (error || !linea) {
    return <ErrorMensaje mensaje={error ?? 'No se encontró la línea.'} onReintentar={recargar} />;
  }

  // Si no se eligió ninguno (o el elegido ya no existe), se muestra el primero: la ida.
  const actual = linea.recorridos.find((r) => r.id === elegido) ?? linea.recorridos[0];

  return (
    <ScrollView contentContainerStyle={styles.contenido}>
      <Stack.Screen options={{ title: `Línea ${linea.codigo}` }} />
      <View style={styles.encabezado}>
        <InsigniaLinea linea={linea} />
        <View style={styles.textos}>
          <Text style={styles.nombre}>{linea.nombre}</Text>
          {linea.punto_inicio && linea.punto_termino && (
            <Text style={styles.dato}>
              {linea.punto_inicio} → {linea.punto_termino}
            </Text>
          )}
        </View>
      </View>
      {linea.aviso && <Aviso texto={linea.aviso} />}

      {!actual ? (
        <Text style={styles.dato}>Esta línea todavía no tiene recorridos.</Text>
      ) : (
        <>
          <View style={styles.selector} accessibilityRole="tablist">
            {linea.recorridos.map((r) => {
              const activo = r.id === actual.id;
              return (
                <Pressable
                  key={r.id}
                  style={[styles.opcion, activo && styles.opcionActiva]}
                  onPress={() => setElegido(r.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: activo }}
                >
                  <Text style={[styles.opcionTexto, activo && styles.opcionTextoActivo]}>
                    {r.sentido === 'ida' ? 'Ida' : 'Vuelta'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.recorrido}>
            {actual.paraderos.length > 0 && (
              <Text style={styles.sentido}>
                {actual.paraderos[0].nombre} →{' '}
                {actual.paraderos[actual.paraderos.length - 1].nombre}
              </Text>
            )}
            <Text style={styles.dato}>Días: {actual.dias_funcionamiento}</Text>
            <Text style={styles.dato}>Horarios: {actual.horarios}</Text>
            {actual.paraderos.map((p) => (
              <Pressable
                key={p.id}
                style={styles.paradero}
                onPress={() => router.push(`/paradero/${p.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Paradero ${p.orden}: ${p.nombre}, código ${p.codigo}`}
              >
                <Text style={styles.orden}>{p.orden}</Text>
                <View style={styles.textos}>
                  <Text style={styles.paraderoNombre}>{p.nombre}</Text>
                  <Text style={styles.codigo}>{p.codigo}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 14 },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textos: { flex: 1, gap: 2 },
  nombre: { fontSize: 18, fontWeight: '700', color: colors.text },
  selector: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  opcion: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  opcionActiva: { backgroundColor: colors.primary },
  opcionTexto: { fontSize: 15, fontWeight: '600', color: colors.text },
  opcionTextoActivo: { color: colors.surface },
  recorrido: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  sentido: { fontSize: 16, fontWeight: '700', color: colors.primary },
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
  paraderoNombre: { color: colors.text, fontSize: 15 },
  codigo: { color: colors.textMuted, fontSize: 12 },
});
