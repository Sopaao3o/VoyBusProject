import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { listarParaderos } from '../../src/api/red';
import { Buscador } from '../../src/components/Buscador';
import { Cargando, ErrorMensaje, Vacio } from '../../src/components/Estados';
import { useRetraso } from '../../src/hooks/useBusqueda';
import { useApi } from '../../src/hooks/useApi';
import { useFavoritos } from '../../src/hooks/useFavoritos';
import { colors } from '../../src/theme/colors';

// RED-02: lista de paraderos con búsqueda por nombre o código.
// Los pasajeros registrados pueden ver solo sus favoritos.
export default function ParaderosScreen() {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const q = useRetraso(texto);
  const { datos, cargando, error, recargar } = useApi(() => listarParaderos(q), [q]);
  const favoritos = useFavoritos();
  const [soloFavoritos, setSoloFavoritos] = useState(false);

  const filtrando = favoritos.disponible && soloFavoritos;
  const visibles = (datos ?? []).filter((p) => !filtrando || favoritos.ids.has(p.id));

  function actualizar() {
    recargar();
    favoritos.recargar();
  }

  return (
    <View style={styles.pantalla}>
      <Buscador
        valor={texto}
        onCambio={setTexto}
        placeholder="Buscar paradero por nombre o código"
      />
      {favoritos.disponible && (
        <View style={styles.filtros} accessibilityRole="tablist">
          {[
            { valor: false, titulo: 'Todos' },
            { valor: true, titulo: `Favoritos (${favoritos.ids.size})` },
          ].map((f) => {
            const activo = f.valor === soloFavoritos;
            return (
              <Pressable
                key={f.titulo}
                style={[styles.filtro, activo && styles.filtroActivo]}
                onPress={() => setSoloFavoritos(f.valor)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activo }}
              >
                <Text style={[styles.filtroTexto, activo && styles.filtroTextoActivo]}>
                  {f.titulo}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {cargando && !datos ? (
        <Cargando />
      ) : error ? (
        <ErrorMensaje mensaje={error} onReintentar={actualizar} />
      ) : (
        <FlatList
          data={visibles}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.lista}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={actualizar} />}
          ListEmptyComponent={
            <Vacio
              mensaje={
                filtrando
                  ? 'Aún no tienes paraderos favoritos. Abre un paradero y guárdalo con la estrella.'
                  : 'No se encontraron paraderos.'
              }
            />
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.tarjeta}
              onPress={() => router.push(`/paradero/${item.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Paradero ${item.nombre}, código ${item.codigo}${
                favoritos.ids.has(item.id) ? ', favorito' : ''
              }`}
            >
              <View style={styles.textos}>
                <Text style={styles.nombre}>{item.nombre}</Text>
                <Text style={styles.detalle}>
                  Código {item.codigo} · {item.latitud.toFixed(4)}, {item.longitud.toFixed(4)}
                </Text>
              </View>
              {favoritos.ids.has(item.id) && (
                <Ionicons name="star" size={20} color={colors.primary} />
              )}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  filtros: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  filtro: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  filtroActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  filtroTexto: { color: colors.text, fontWeight: '600', fontSize: 13 },
  filtroTextoActivo: { color: colors.surface },
  lista: { padding: 16, paddingTop: 8, gap: 10 },
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 14,
  },
  textos: { flex: 1, gap: 4 },
  nombre: { fontSize: 16, color: colors.text, fontWeight: '500' },
  detalle: { fontSize: 13, color: colors.textMuted },
});
