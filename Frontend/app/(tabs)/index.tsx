import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type MapView from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listarLineas, listarParaderos } from '../../src/api/red';
import { Cargando, ErrorMensaje, Vacio } from '../../src/components/Estados';
import { BotonFlotante } from '../../src/components/mapa/BotonFlotante';
import { FilaLinea, FilaParadero } from '../../src/components/mapa/Filas';
import { Mapa } from '../../src/components/mapa/Mapa';
import { MarcadorParadero } from '../../src/components/mapa/MarcadorParadero';
import { PanelInferior } from '../../src/components/mapa/PanelInferior';
import { useApi } from '../../src/hooks/useApi';
import { useRetraso } from '../../src/hooks/useBusqueda';
import { useFavoritos } from '../../src/hooks/useFavoritos';
import { useMiUbicacion } from '../../src/hooks/useMiUbicacion';
import { usePantallaMapa } from '../../src/hooks/usePantallaMapa';
import { useUsuario } from '../../src/session/UsuarioContext';
import { colors } from '../../src/theme/colors';

type Vista = 'lineas' | 'paraderos' | 'favoritos';

// Alturas del panel: el pasajero necesita espacio extra para el botón de subir a una micro.
const ALTURAS_PASAJERO = [250, 0.45, 0.88];
const ALTURAS_PERSONAL = [180, 0.45, 0.88];

const BUSCAR: Record<Vista, string> = {
  lineas: 'Buscar línea por código o nombre',
  paraderos: 'Buscar paradero por nombre o código',
  favoritos: 'Buscar en tus favoritos',
};

// Inicio: el mapa con los paraderos (RED-02) y un panel para buscar líneas (RED-01) y paraderos.
// Sirve igual con o sin sesión; el pasajero tiene además el acceso para subir a una micro.
export default function InicioScreen() {
  usePantallaMapa();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { usuario } = useUsuario();
  const favoritos = useFavoritos();
  const ubicacion = useMiUbicacion();
  const mapa = useRef<MapView>(null);

  const [vista, setVista] = useState<Vista>('lineas');
  const [texto, setTexto] = useState('');
  const [indice, setIndice] = useState(1);
  const [alturaPanel, setAlturaPanel] = useState(0);
  const q = useRetraso(texto);

  const qLineas = vista === 'lineas' ? q : '';
  const qParaderos = vista === 'lineas' ? '' : q;
  const lineas = useApi(() => listarLineas(qLineas), [qLineas]);
  const paraderos = useApi(() => listarParaderos(qParaderos), [qParaderos]);

  const enFavoritos = vista === 'favoritos' && favoritos.disponible;
  const paraderosVisibles = (paraderos.datos ?? []).filter(
    (p) => !enFavoritos || favoritos.ids.has(p.id),
  );
  const esPersonal = usuario?.rol === 'administrador' || usuario?.rol === 'conductor';
  const alturas = esPersonal ? ALTURAS_PERSONAL : ALTURAS_PASAJERO;

  const vistas: { valor: Vista; titulo: string }[] = [
    { valor: 'lineas', titulo: 'Líneas' },
    { valor: 'paraderos', titulo: 'Paraderos' },
    ...(favoritos.disponible
      ? [{ valor: 'favoritos' as const, titulo: `Favoritos (${favoritos.ids.size})` }]
      : []),
  ];

  async function centrarEnMi() {
    const punto = await ubicacion.obtener();
    if (punto) {
      mapa.current?.animateToRegion({ ...punto, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 600);
    }
  }

  function cambiarVista(nueva: Vista) {
    setVista(nueva);
    setTexto('');
  }

  const consulta = vista === 'lineas' ? lineas : paraderos;
  let lista;
  if (consulta.cargando && !consulta.datos) {
    lista = <Cargando />;
  } else if (consulta.error) {
    lista = <ErrorMensaje mensaje={consulta.error} onReintentar={consulta.recargar} />;
  } else if (vista === 'lineas') {
    lista = (
      <FlatList
        data={lineas.datos ?? []}
        keyExtractor={(l) => String(l.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.lista}
        ListEmptyComponent={<Vacio mensaje="No se encontraron líneas." />}
        renderItem={({ item }) => (
          <FilaLinea linea={item} onPress={() => router.push(`/linea/${item.id}`)} />
        )}
      />
    );
  } else {
    lista = (
      <FlatList
        data={paraderosVisibles}
        keyExtractor={(p) => String(p.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.lista}
        ListEmptyComponent={
          <Vacio
            mensaje={
              enFavoritos
                ? 'Aún no tienes paraderos favoritos. Abre un paradero y guárdalo con la estrella.'
                : 'No se encontraron paraderos.'
            }
          />
        }
        renderItem={({ item }) => (
          <FilaParadero
            paradero={item}
            favorito={favoritos.ids.has(item.id)}
            onPress={() => router.push(`/paradero/${item.id}`)}
          />
        )}
      />
    );
  }

  return (
    <View style={styles.pantalla}>
      <Mapa
        ref={mapa}
        showsUserLocation={ubicacion.permitida}
        mapPadding={{ top: insets.top + 64, right: 0, bottom: alturaPanel, left: 0 }}
      >
        {paraderosVisibles.map((p) => (
          <MarcadorParadero
            key={p.id}
            paradero={p}
            favorito={favoritos.ids.has(p.id)}
            onPress={() => router.push(`/paradero/${p.id}`)}
          />
        ))}
      </Mapa>

      <View style={[styles.arriba, { top: insets.top + 12 }]}>
        <BotonFlotante
          texto={usuario ? usuario.nombre.trim().charAt(0).toUpperCase() : undefined}
          icono="person"
          etiqueta={usuario ? `Tu cuenta, ${usuario.nombre}` : 'Iniciar sesión o crear cuenta'}
          onPress={() => router.push('/cuenta')}
        />
        <BotonFlotante icono="locate" etiqueta="Centrar en mi ubicación" onPress={centrarEnMi} />
      </View>

      <PanelInferior
        alturas={alturas}
        indice={indice}
        onIndice={setIndice}
        onAltura={setAlturaPanel}
        encabezado={
          <View style={styles.encabezado}>
            <View style={styles.buscador}>
              <Ionicons name="search" size={20} color={colors.textMuted} />
              <TextInput
                style={styles.input}
                value={texto}
                onChangeText={setTexto}
                onFocus={() => setIndice(alturas.length - 1)}
                placeholder={BUSCAR[vista]}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel={BUSCAR[vista]}
              />
              {texto.length > 0 && (
                <Pressable
                  onPress={() => setTexto('')}
                  accessibilityRole="button"
                  accessibilityLabel="Borrar la búsqueda"
                  hitSlop={10}
                >
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
            <View style={styles.vistas} accessibilityRole="tablist">
              {vistas.map((v) => {
                const activa = v.valor === vista;
                return (
                  <Pressable
                    key={v.valor}
                    style={[styles.vista, activa && styles.vistaActiva]}
                    onPress={() => cambiarVista(v.valor)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: activa }}
                  >
                    <Text style={[styles.vistaTexto, activa && styles.vistaTextoActiva]}>
                      {v.titulo}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {!esPersonal && (
              <Pressable
                style={({ pressed }) => [styles.subir, pressed && styles.subirPresionado]}
                onPress={() => router.push('/viajar')}
                accessibilityRole="button"
              >
                <Ionicons name="bus" size={20} color={colors.surface} />
                <Text style={styles.subirTexto}>Subir a una micro</Text>
              </Pressable>
            )}
          </View>
        }
      >
        {lista}
      </PanelInferior>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  arriba: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  encabezado: { paddingHorizontal: 16, gap: 12, paddingBottom: 8 },
  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#F1F4F8',
  },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 },
  vistas: { flexDirection: 'row', gap: 8 },
  vista: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  vistaActiva: { backgroundColor: colors.primary, borderColor: colors.primary },
  vistaTexto: { fontSize: 14, fontWeight: '600', color: colors.text },
  vistaTextoActiva: { color: colors.surface },
  subir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.text,
  },
  subirPresionado: { opacity: 0.85 },
  subirTexto: { color: colors.surface, fontSize: 16, fontWeight: '700' },
  lista: { paddingHorizontal: 16, paddingBottom: 16 },
});
