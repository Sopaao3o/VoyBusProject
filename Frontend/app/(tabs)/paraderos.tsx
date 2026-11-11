import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { listarParaderos } from '../../src/api/red';
import { Buscador } from '../../src/components/Buscador';
import { Cargando, ErrorMensaje, Vacio } from '../../src/components/Estados';
import { useRetraso } from '../../src/hooks/useBusqueda';
import { useApi } from '../../src/hooks/useApi';
import { colors } from '../../src/theme/colors';

// RED-02: lista de paraderos con búsqueda por nombre o código.
export default function ParaderosScreen() {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const q = useRetraso(texto);
  const { datos, cargando, error, recargar } = useApi(() => listarParaderos(q), [q]);

  return (
    <View style={styles.pantalla}>
      <Buscador
        valor={texto}
        onCambio={setTexto}
        placeholder="Buscar paradero por nombre o código"
      />
      {cargando && !datos ? (
        <Cargando />
      ) : error ? (
        <ErrorMensaje mensaje={error} onReintentar={recargar} />
      ) : (
        <FlatList
          data={datos ?? []}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.lista}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} />}
          ListEmptyComponent={<Vacio mensaje="No se encontraron paraderos." />}
          renderItem={({ item }) => (
            <Pressable
              style={styles.tarjeta}
              onPress={() => router.push(`/paradero/${item.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Paradero ${item.nombre}, código ${item.codigo}`}
            >
              <Text style={styles.nombre}>{item.nombre}</Text>
              <Text style={styles.detalle}>
                Código {item.codigo} · {item.latitud.toFixed(4)}, {item.longitud.toFixed(4)}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  lista: { padding: 16, paddingTop: 8, gap: 10 },
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  nombre: { fontSize: 16, color: colors.text, fontWeight: '500' },
  detalle: { fontSize: 13, color: colors.textMuted },
});
