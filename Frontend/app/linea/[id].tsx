import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type MapView from 'react-native-maps';
import { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { vehiculosEnCirculacion } from '../../src/api/circulacion';
import { obtenerLinea } from '../../src/api/red';
import { Cargando, ErrorMensaje } from '../../src/components/Estados';
import { Aviso, InsigniaLinea } from '../../src/components/Etiquetas';
import { BotonFlotante } from '../../src/components/mapa/BotonFlotante';
import { TextoActualizacion } from '../../src/components/mapa/FichaVehiculo';
import { Mapa } from '../../src/components/mapa/Mapa';
import { MarcadorParadero } from '../../src/components/mapa/MarcadorParadero';
import { MarcadorVehiculo } from '../../src/components/mapa/MarcadorVehiculo';
import { PanelInferior } from '../../src/components/mapa/PanelInferior';
import { useApi } from '../../src/hooks/useApi';
import { useEnVivo } from '../../src/hooks/useEnVivo';
import { usePantallaMapa } from '../../src/hooks/usePantallaMapa';
import { colors } from '../../src/theme/colors';
import { caminoDelRecorrido, coordenadasMapa } from '../../src/utils/recorrido';

const ALTURAS = [0.42, 0.88];

// RED-01: una línea. El mapa dibuja el recorrido elegido (ida o vuelta) por las calles, con sus paraderos
// numerados, y el panel muestra días, horarios y paraderos en orden.
// RED-03: también muestra, en vivo, solo las micros de esta línea que tienen un viaje en curso.
// `?recorrido=` permite llegar con un sentido ya elegido, y `?viaje=` con una micro marcada.
export default function LineaScreen() {
  usePantallaMapa();
  const { id, recorrido, viaje } = useLocalSearchParams<{
    id: string;
    recorrido?: string;
    viaje?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapa = useRef<MapView>(null);
  const { datos: linea, cargando, error, recargar } = useApi(() => obtenerLinea(Number(id)), [id]);
  const [elegido, setElegido] = useState<number | null>(recorrido ? Number(recorrido) : null);
  const [indice, setIndice] = useState(0);
  const [alturaPanel, setAlturaPanel] = useState(0);
  const [mapaListo, setMapaListo] = useState(false);
  const [microElegida, setMicroElegida] = useState<number | null>(viaje ? Number(viaje) : null);
  const vehiculos = useEnVivo(() => vehiculosEnCirculacion(Number(id)), [id]);

  // Si no se eligió ninguno (o el elegido ya no existe), se muestra el primero: la ida.
  const actual = linea?.recorridos.find((r) => r.id === elegido) ?? linea?.recorridos[0];
  const paraderos = actual ? [...actual.paraderos].sort((a, b) => a.orden - b.orden) : [];
  // El recorrido se dibuja por las calles si tiene trazado (si no, en tramos rectos).
  const puntos = coordenadasMapa(caminoDelRecorrido(paraderos, actual?.trazado));
  const clavePuntos = JSON.stringify(puntos);

  // Las micros del sentido elegido; las del otro sentido no se muestran para no confundir.
  const micros = (vehiculos.datos ?? []).filter((v) => v.recorrido.id === actual?.id);

  // Al cambiar de recorrido, el mapa se ajusta para que se vea completo sobre el panel.
  useEffect(() => {
    if (!mapaListo || alturaPanel === 0) return;
    const coordenadas = JSON.parse(clavePuntos) as typeof puntos;
    if (coordenadas.length === 0) return;
    mapa.current?.fitToCoordinates(coordenadas, {
      edgePadding: { top: insets.top + 90, right: 60, bottom: alturaPanel + 40, left: 60 },
      animated: true,
    });
  }, [mapaListo, alturaPanel, clavePuntos, insets.top]);

  const volver = (
    <View style={[styles.arriba, { top: insets.top + 12 }]}>
      <BotonFlotante icono="arrow-back" etiqueta="Volver" onPress={() => router.back()} />
    </View>
  );

  if (cargando && !linea) {
    return (
      <View style={styles.pantalla}>
        <Stack.Screen options={{ headerShown: false }} />
        <Cargando />
        {volver}
      </View>
    );
  }
  if (error || !linea) {
    return (
      <View style={styles.pantalla}>
        <Stack.Screen options={{ headerShown: false }} />
        <ErrorMensaje mensaje={error ?? 'No se encontró la línea.'} onReintentar={recargar} />
        {volver}
      </View>
    );
  }

  return (
    <View style={styles.pantalla}>
      <Stack.Screen options={{ headerShown: false, title: `Línea ${linea.codigo}` }} />
      <Mapa ref={mapa} onMapReady={() => setMapaListo(true)}>
        {puntos.length > 1 && (
          <>
            <Polyline coordinates={puntos} strokeColor={colors.surface} strokeWidth={9} />
            <Polyline coordinates={puntos} strokeColor={linea.color} strokeWidth={5} />
          </>
        )}
        {paraderos.map((p) => (
          <MarcadorParadero
            key={p.id}
            paradero={p}
            color={linea.color}
            orden={p.orden}
            onPress={() => router.push(`/paradero/${p.id}`)}
          />
        ))}
        {micros.map((v) => (
          <MarcadorVehiculo
            key={v.viaje_id}
            vehiculo={v}
            seleccionado={v.viaje_id === microElegida}
            onPress={() => setMicroElegida(v.viaje_id)}
          />
        ))}
      </Mapa>
      {volver}

      <PanelInferior
        alturas={ALTURAS}
        indice={indice}
        onIndice={setIndice}
        onAltura={setAlturaPanel}
        encabezado={
          <View style={styles.encabezado}>
            <View style={styles.fila}>
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
            {linea.recorridos.length > 0 && (
              <View style={styles.selector} accessibilityRole="tablist">
                {linea.recorridos.map((r) => {
                  const activo = r.id === actual?.id;
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
            )}
          </View>
        }
      >
        {!actual ? (
          <Text style={[styles.dato, styles.margen]}>Esta línea todavía no tiene recorridos.</Text>
        ) : (
          <ScrollView contentContainerStyle={styles.contenido}>
            <View style={styles.horario}>
              <Ionicons name="time-outline" size={18} color={colors.textMuted} />
              <Text style={styles.dato}>
                {actual.dias_funcionamiento} · {actual.horarios}
              </Text>
            </View>

            <Text style={styles.subtitulo}>MICROS EN CIRCULACIÓN ({micros.length})</Text>
            {micros.length === 0 ? (
              <Text style={styles.dato}>Ninguna micro de este sentido está en ruta ahora.</Text>
            ) : (
              micros.map((v) => (
                <Pressable
                  key={v.viaje_id}
                  style={({ pressed }) => [
                    styles.micro,
                    v.viaje_id === microElegida && styles.microElegida,
                    pressed && styles.presionado,
                  ]}
                  onPress={() => {
                    setMicroElegida(v.viaje_id);
                    if (v.ultima_ubicacion) {
                      mapa.current?.animateToRegion(
                        {
                          latitude: v.ultima_ubicacion.latitud,
                          longitude: v.ultima_ubicacion.longitud,
                          latitudeDelta: 0.03,
                          longitudeDelta: 0.03,
                        },
                        500,
                      );
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Micro ${v.vehiculo.identificador}`}
                >
                  <Ionicons name="bus" size={20} color={linea.color} />
                  <View style={styles.textos}>
                    <Text style={styles.paraderoNombre}>
                      {v.vehiculo.identificador}
                      {v.siguiente_paradero ? ` · próximo: ${v.siguiente_paradero.nombre}` : ''}
                    </Text>
                    <TextoActualizacion vehiculo={v} />
                  </View>
                </Pressable>
              ))
            )}

            <Text style={styles.subtitulo}>PARADEROS</Text>
            {paraderos.map((p, i) => (
              <Pressable
                key={p.id}
                style={({ pressed }) => [styles.paradero, pressed && styles.presionado]}
                onPress={() => router.push(`/paradero/${p.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Paradero ${p.orden}: ${p.nombre}, código ${p.codigo}`}
              >
                <View style={styles.tramo}>
                  <View
                    style={[
                      styles.linea,
                      { backgroundColor: i === 0 ? 'transparent' : linea.color },
                    ]}
                  />
                  <View style={[styles.orden, { borderColor: linea.color }]}>
                    <Text style={[styles.ordenTexto, { color: linea.color }]}>{p.orden}</Text>
                  </View>
                  <View
                    style={[
                      styles.linea,
                      {
                        backgroundColor: i === paraderos.length - 1 ? 'transparent' : linea.color,
                      },
                    ]}
                  />
                </View>
                <View style={styles.textos}>
                  <Text style={styles.paraderoNombre}>{p.nombre}</Text>
                  <Text style={styles.codigo}>{p.codigo}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </PanelInferior>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  arriba: { position: 'absolute', left: 16 },
  encabezado: { paddingHorizontal: 16, gap: 12, paddingBottom: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textos: { flex: 1, gap: 2 },
  nombre: { fontSize: 18, fontWeight: '700', color: colors.text },
  dato: { color: colors.textMuted, fontSize: 14 },
  margen: { padding: 16 },
  selector: {
    flexDirection: 'row',
    backgroundColor: '#F1F4F8',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  opcion: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  opcionActiva: { backgroundColor: colors.surface, elevation: 2 },
  opcionTexto: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  opcionTextoActivo: { color: colors.text },
  contenido: { paddingHorizontal: 16, paddingBottom: 16 },
  horario: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  subtitulo: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 4,
  },
  micro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.background,
    marginBottom: 6,
  },
  microElegida: { borderWidth: 2, borderColor: colors.text },
  paradero: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  presionado: { opacity: 0.6 },
  tramo: { width: 28, alignItems: 'center', alignSelf: 'stretch' },
  linea: { width: 4, flex: 1 },
  orden: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordenTexto: { fontSize: 12, fontWeight: '800' },
  paraderoNombre: { color: colors.text, fontSize: 15, fontWeight: '500' },
  codigo: { color: colors.textMuted, fontSize: 12 },
});
