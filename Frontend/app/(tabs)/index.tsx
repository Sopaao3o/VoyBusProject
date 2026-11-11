import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { listarLineas } from '../../src/api/red';
import { Buscador } from '../../src/components/Buscador';
import { Aviso, InsigniaLinea } from '../../src/components/Etiquetas';
import { Cargando, ErrorMensaje, Vacio } from '../../src/components/Estados';
import { useRetraso } from '../../src/hooks/useBusqueda';
import { useApi } from '../../src/hooks/useApi';
import { colors } from '../../src/theme/colors';

// RED-01: lista de líneas con búsqueda por código o nombre.
export default function LineasScreen() {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const q = useRetraso(texto);
  const { datos, cargando, error, recargar } = useApi(() => listarLineas(q), [q]);

  return (
    <View style={styles.pantalla}>
      <Buscador valor={texto} onCambio={setTexto} placeholder="Buscar línea por código o nombre" />
      {cargando && !datos ? (
        <Cargando />
      ) : error ? (
        <ErrorMensaje mensaje={error} onReintentar={recargar} />
      ) : (
        <FlatList
          data={datos ?? []}
          keyExtractor={(l) => String(l.id)}
          contentContainerStyle={styles.lista}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} />}
          ListEmptyComponent={<Vacio mensaje="No se encontraron líneas." />}
          renderItem={({ item }) => (
            <Pressable
              style={styles.tarjeta}
              onPress={() => router.push(`/linea/${item.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Línea ${item.codigo}, ${item.nombre}`}
            >
              <View style={styles.fila}>
                <InsigniaLinea linea={item} />
                <Text style={styles.nombre}>{item.nombre}</Text>
              </View>
              {item.aviso && <Aviso texto={item.aviso} />}
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
    gap: 10,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nombre: { flex: 1, fontSize: 16, color: colors.text, fontWeight: '500' },
});
