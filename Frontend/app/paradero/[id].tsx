import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { textoDeError } from '../../src/api/client';
import { agregarParaderoFavorito, quitarParaderoFavorito } from '../../src/api/favoritos';
import { obtenerParadero } from '../../src/api/red';
import { Cargando, ErrorMensaje } from '../../src/components/Estados';
import { Aviso, InsigniaLinea } from '../../src/components/Etiquetas';
import { useApi } from '../../src/hooks/useApi';
import { useFavoritos } from '../../src/hooks/useFavoritos';
import { colors } from '../../src/theme/colors';

// RED-02: un paradero con su ubicación, las líneas que pasan por él y en qué sentidos.
// Los pasajeros registrados pueden guardarlo como favorito.
export default function ParaderoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const paraderoId = Number(id);
  const router = useRouter();
  const {
    datos: paradero,
    cargando,
    error,
    recargar,
  } = useApi(() => obtenerParadero(paraderoId), [paraderoId]);
  const favoritos = useFavoritos();
  const [guardando, setGuardando] = useState(false);

  if (cargando && !paradero) return <Cargando />;
  if (error || !paradero) {
    return (
      <ErrorMensaje mensaje={error ?? 'No se encontró el paradero.'} onReintentar={recargar} />
    );
  }

  const esFavorito = favoritos.ids.has(paraderoId);

  async function alternarFavorito() {
    setGuardando(true);
    try {
      if (esFavorito) await quitarParaderoFavorito(paraderoId);
      else await agregarParaderoFavorito(paraderoId);
      await favoritos.recargar();
    } catch (e) {
      Alert.alert('No se pudo actualizar tus favoritos', textoDeError(e));
    } finally {
      setGuardando(false);
    }
  }

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

      {favoritos.disponible ? (
        <Pressable
          style={[styles.favorito, esFavorito && styles.favoritoActivo]}
          onPress={alternarFavorito}
          disabled={guardando}
          accessibilityRole="switch"
          accessibilityState={{ checked: esFavorito, disabled: guardando }}
          accessibilityLabel="Paradero favorito"
        >
          <Ionicons
            name={esFavorito ? 'star' : 'star-outline'}
            size={20}
            color={esFavorito ? colors.surface : colors.primary}
          />
          <Text style={[styles.favoritoTexto, esFavorito && styles.favoritoTextoActivo]}>
            {esFavorito ? 'En tus favoritos (toca para quitar)' : 'Guardar en favoritos'}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.dato}>
          Con una cuenta de pasajero puedes guardar este paradero en tus favoritos.
        </Text>
      )}

      <Text style={styles.subtitulo}>Líneas que pasan por aquí</Text>
      {paradero.lineas.length === 0 && (
        <Text style={styles.dato}>Ninguna línea activa pasa por este paradero.</Text>
      )}
      {paradero.lineas.map((l) => (
        <View key={l.id} style={styles.linea}>
          <Pressable
            style={styles.fila}
            onPress={() => router.push(`/linea/${l.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Línea ${l.codigo}, ${l.nombre}`}
          >
            <InsigniaLinea linea={l} />
            <Text style={styles.lineaNombre}>{l.nombre}</Text>
          </Pressable>
          {l.aviso && <Aviso texto={l.aviso} />}

          <View style={styles.sentidos}>
            <Text style={styles.dato}>Sentidos:</Text>
            {l.recorridos.map((r) => (
              <Pressable
                key={r.id}
                style={styles.sentido}
                onPress={() =>
                  router.push({ pathname: '/linea/[id]', params: { id: l.id, recorrido: r.id } })
                }
                accessibilityRole="button"
                accessibilityLabel={`Ver el recorrido de ${r.sentido} de la línea ${l.codigo}`}
              >
                <Text style={styles.sentidoTexto}>{r.sentido === 'ida' ? 'Ida' : 'Vuelta'}</Text>
              </Pressable>
            ))}
          </View>
        </View>
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
  favorito: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  favoritoActivo: { backgroundColor: colors.primary },
  favoritoTexto: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  favoritoTextoActivo: { color: colors.surface },
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
  sentidos: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sentido: {
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  sentidoTexto: { color: colors.primary, fontWeight: '600', fontSize: 13 },
});
