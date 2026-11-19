import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type MapView from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { textoDeError } from '../../src/api/client';
import { agregarParaderoFavorito, quitarParaderoFavorito } from '../../src/api/favoritos';
import { obtenerParadero } from '../../src/api/red';
import { Cargando, ErrorMensaje } from '../../src/components/Estados';
import { Aviso, InsigniaLinea } from '../../src/components/Etiquetas';
import { BotonFlotante } from '../../src/components/mapa/BotonFlotante';
import { Mapa } from '../../src/components/mapa/Mapa';
import { MarcadorParadero } from '../../src/components/mapa/MarcadorParadero';
import { PanelInferior } from '../../src/components/mapa/PanelInferior';
import { useApi } from '../../src/hooks/useApi';
import { useFavoritos } from '../../src/hooks/useFavoritos';
import { usePantallaMapa } from '../../src/hooks/usePantallaMapa';
import { colors } from '../../src/theme/colors';

const ALTURAS = [0.45, 0.88];

// RED-02: un paradero. El mapa muestra dónde está y el panel, las líneas que pasan por él
// y en qué sentidos. Los pasajeros registrados pueden guardarlo como favorito.
export default function ParaderoScreen() {
  usePantallaMapa();
  const { id } = useLocalSearchParams<{ id: string }>();
  const paraderoId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapa = useRef<MapView>(null);
  const {
    datos: paradero,
    cargando,
    error,
    recargar,
  } = useApi(() => obtenerParadero(paraderoId), [paraderoId]);
  const favoritos = useFavoritos();
  const [guardando, setGuardando] = useState(false);
  const [indice, setIndice] = useState(0);
  const [alturaPanel, setAlturaPanel] = useState(0);
  const [mapaListo, setMapaListo] = useState(false);

  const latitud = paradero?.latitud;
  const longitud = paradero?.longitud;

  // Centra el paradero en la parte del mapa que queda libre sobre el panel.
  useEffect(() => {
    if (!mapaListo || alturaPanel === 0 || latitud === undefined || longitud === undefined) return;
    mapa.current?.fitToCoordinates([{ latitude: latitud, longitude: longitud }], {
      edgePadding: { top: insets.top + 90, right: 80, bottom: alturaPanel + 40, left: 80 },
      animated: true,
    });
  }, [mapaListo, alturaPanel, latitud, longitud, insets.top]);

  const volver = (
    <View style={[styles.arriba, { top: insets.top + 12 }]}>
      <BotonFlotante icono="arrow-back" etiqueta="Volver" onPress={() => router.back()} />
    </View>
  );

  if (cargando && !paradero) {
    return (
      <View style={styles.pantalla}>
        <Stack.Screen options={{ headerShown: false }} />
        <Cargando />
        {volver}
      </View>
    );
  }
  if (error || !paradero) {
    return (
      <View style={styles.pantalla}>
        <Stack.Screen options={{ headerShown: false }} />
        <ErrorMensaje mensaje={error ?? 'No se encontró el paradero.'} onReintentar={recargar} />
        {volver}
      </View>
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
    <View style={styles.pantalla}>
      <Stack.Screen options={{ headerShown: false, title: paradero.nombre }} />
      <Mapa
        ref={mapa}
        onMapReady={() => setMapaListo(true)}
        initialRegion={{
          latitude: paradero.latitud,
          longitude: paradero.longitud,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      >
        <MarcadorParadero paradero={paradero} destacado />
      </Mapa>
      {volver}

      <PanelInferior
        alturas={ALTURAS}
        indice={indice}
        onIndice={setIndice}
        onAltura={setAlturaPanel}
        encabezado={
          <View style={styles.encabezado}>
            <View style={styles.textos}>
              <Text style={styles.nombre}>{paradero.nombre}</Text>
              <Text style={styles.dato}>Paradero {paradero.codigo}</Text>
            </View>
            {favoritos.disponible && (
              <Pressable
                style={[styles.estrella, esFavorito && styles.estrellaActiva]}
                onPress={alternarFavorito}
                disabled={guardando}
                accessibilityRole="switch"
                accessibilityState={{ checked: esFavorito, disabled: guardando }}
                accessibilityLabel={esFavorito ? 'Quitar de favoritos' : 'Guardar en favoritos'}
              >
                <Ionicons
                  name={esFavorito ? 'star' : 'star-outline'}
                  size={22}
                  color={esFavorito ? colors.surface : colors.primary}
                />
              </Pressable>
            )}
          </View>
        }
      >
        <ScrollView contentContainerStyle={styles.contenido}>
          {!favoritos.disponible && (
            <Text style={styles.dato}>
              Con una cuenta de pasajero puedes guardar este paradero en tus favoritos.
            </Text>
          )}

          <Text style={styles.subtitulo}>LÍNEAS QUE PASAN</Text>
          {paradero.lineas.length === 0 && (
            <Text style={styles.dato}>Ninguna línea activa pasa por este paradero.</Text>
          )}
          {paradero.lineas.map((l) => (
            <View key={l.id} style={styles.linea}>
              <View style={styles.fila}>
                <InsigniaLinea linea={l} />
                <Text style={styles.lineaNombre}>{l.nombre}</Text>
              </View>
              {l.aviso && <Aviso texto={l.aviso} />}
              <View style={styles.sentidos}>
                {l.recorridos.map((r) => (
                  <Pressable
                    key={r.id}
                    style={({ pressed }) => [styles.sentido, pressed && styles.presionado]}
                    onPress={() =>
                      router.push({
                        pathname: '/linea/[id]',
                        params: { id: l.id, recorrido: r.id },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Ver el recorrido de ${r.sentido} de la línea ${l.codigo}`}
                  >
                    <Ionicons
                      name={r.sentido === 'ida' ? 'arrow-forward' : 'arrow-back'}
                      size={16}
                      color={colors.primary}
                    />
                    <Text style={styles.sentidoTexto}>
                      {r.sentido === 'ida' ? 'Ida' : 'Vuelta'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </PanelInferior>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  arriba: { position: 'absolute', left: 16 },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  textos: { flex: 1, gap: 2 },
  nombre: { fontSize: 21, fontWeight: '700', color: colors.text },
  dato: { color: colors.textMuted, fontSize: 14 },
  estrella: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  estrellaActiva: { backgroundColor: colors.primary, borderColor: colors.primary },
  contenido: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  subtitulo: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginTop: 4 },
  linea: { backgroundColor: colors.background, borderRadius: 14, padding: 12, gap: 10 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineaNombre: { flex: 1, fontSize: 16, color: colors.text, fontWeight: '600' },
  sentidos: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sentido: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  presionado: { opacity: 0.6 },
  sentidoTexto: { color: colors.primary, fontWeight: '600', fontSize: 14 },
});
