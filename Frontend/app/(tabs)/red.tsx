import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { listarLineasAdmin, listarParaderosAdmin } from '../../src/api/redAdmin';
import { Cargando, ErrorMensaje, Vacio } from '../../src/components/Estados';
import { InsigniaLinea } from '../../src/components/Etiquetas';
import { Boton } from '../../src/components/Formulario';
import { useApi } from '../../src/hooks/useApi';
import { colors } from '../../src/theme/colors';
import { ETIQUETA_ESTADO_LINEA } from '../../src/utils/textos';

type Vista = 'lineas' | 'paraderos';

function Estado({ texto, activo }: { texto: string; activo: boolean }) {
  return (
    <Text style={[styles.estado, activo ? styles.estadoActivo : styles.estadoInactivo]}>
      {texto}
    </Text>
  );
}

// ADM-01: el administrador ve todas las líneas y paraderos (también los desactivados) y
// entra a crearlos o editarlos.
export default function RedScreen() {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>('lineas');
  const lineas = useApi(listarLineasAdmin);
  const paraderos = useApi(listarParaderosAdmin);
  const consulta = vista === 'lineas' ? lineas : paraderos;
  const { recargar: recargarLineas } = lineas;
  const { recargar: recargarParaderos } = paraderos;

  // Al volver de editar, las listas se actualizan.
  useFocusEffect(
    useCallback(() => {
      void recargarLineas();
      void recargarParaderos();
    }, [recargarLineas, recargarParaderos]),
  );

  let lista;
  if (consulta.cargando && !consulta.datos) lista = <Cargando />;
  else if (consulta.error) {
    lista = <ErrorMensaje mensaje={consulta.error} onReintentar={consulta.recargar} />;
  } else if (vista === 'lineas') {
    lista = (
      <FlatList
        data={lineas.datos ?? []}
        keyExtractor={(l) => String(l.id)}
        contentContainerStyle={styles.lista}
        refreshControl={<RefreshControl refreshing={false} onRefresh={lineas.recargar} />}
        ListEmptyComponent={<Vacio mensaje="Aún no hay líneas." />}
        renderItem={({ item: l }) => (
          <Pressable
            style={({ pressed }) => [styles.fila, pressed && styles.presionada]}
            onPress={() => router.push(`/admin/linea/${l.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Línea ${l.codigo}, ${l.nombre}, ${ETIQUETA_ESTADO_LINEA[l.estado_servicio]}`}
          >
            <InsigniaLinea linea={l} />
            <View style={styles.textos}>
              <Text style={styles.titulo}>{l.nombre}</Text>
              <Text style={styles.dato}>
                {l.recorridos.length === 0
                  ? 'Sin recorridos'
                  : l.recorridos
                      .map(
                        (r) =>
                          `${r.sentido === 'ida' ? 'Ida' : 'Vuelta'}: ${r.total_paraderos} paraderos${r.activo ? '' : ' (desactivado)'}`,
                      )
                      .join(' · ')}
              </Text>
            </View>
            <Estado
              texto={ETIQUETA_ESTADO_LINEA[l.estado_servicio]}
              activo={l.estado_servicio === 'activa'}
            />
          </Pressable>
        )}
      />
    );
  } else {
    lista = (
      <FlatList
        data={paraderos.datos ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.lista}
        refreshControl={<RefreshControl refreshing={false} onRefresh={paraderos.recargar} />}
        ListEmptyComponent={<Vacio mensaje="Aún no hay paraderos." />}
        renderItem={({ item: p }) => (
          <Pressable
            style={({ pressed }) => [styles.fila, pressed && styles.presionada]}
            onPress={() => router.push(`/admin/paradero/${p.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Paradero ${p.nombre}, código ${p.codigo}`}
          >
            <Ionicons
              name="location"
              size={22}
              color={p.activo ? colors.primary : colors.textMuted}
            />
            <View style={styles.textos}>
              <Text style={styles.titulo}>{p.nombre}</Text>
              <Text style={styles.dato}>
                {p.codigo} · en {p.total_recorridos}{' '}
                {p.total_recorridos === 1 ? 'recorrido' : 'recorridos'}
              </Text>
            </View>
            <Estado texto={p.activo ? 'Activo' : 'Desactivado'} activo={p.activo} />
          </Pressable>
        )}
      />
    );
  }

  return (
    <View style={styles.pantalla}>
      <View style={styles.cabecera}>
        <View style={styles.vistas} accessibilityRole="tablist">
          {(['lineas', 'paraderos'] as const).map((v) => (
            <Pressable
              key={v}
              style={[styles.vista, vista === v && styles.vistaActiva]}
              onPress={() => setVista(v)}
              accessibilityRole="tab"
              accessibilityState={{ selected: vista === v }}
            >
              <Text style={[styles.vistaTexto, vista === v && styles.vistaTextoActiva]}>
                {v === 'lineas' ? 'Líneas' : 'Paraderos'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Boton
          titulo={vista === 'lineas' ? 'Nueva línea' : 'Nuevo paradero'}
          onPress={() =>
            router.push(vista === 'lineas' ? '/admin/linea/nueva' : '/admin/paradero/nuevo')
          }
        />
      </View>
      {lista}
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  cabecera: { padding: 16, paddingBottom: 8, gap: 12 },
  vistas: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vista: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  vistaActiva: { backgroundColor: colors.primary },
  vistaTexto: { fontSize: 15, fontWeight: '600', color: colors.text },
  vistaTextoActiva: { color: colors.surface },
  lista: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  presionada: { opacity: 0.6 },
  textos: { flex: 1, gap: 2 },
  titulo: { fontSize: 16, fontWeight: '600', color: colors.text },
  dato: { fontSize: 13, color: colors.textMuted },
  estado: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  estadoActivo: { backgroundColor: '#E3F4EA', color: '#1F7A45' },
  estadoInactivo: { backgroundColor: colors.warningBg, color: colors.warning },
});
