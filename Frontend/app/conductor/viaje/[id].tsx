import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import type MapView from 'react-native-maps';
import { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { textoDeError } from '../../../src/api/client';
import {
  finalizarViaje,
  registrarIncidencia,
  solicitudesDeParada,
} from '../../../src/api/conductor';
import { obtenerLinea } from '../../../src/api/red';
import { EstadoGps } from '../../../src/components/EstadoGps';
import { Cargando, ErrorMensaje } from '../../../src/components/Estados';
import { InsigniaLinea } from '../../../src/components/Etiquetas';
import { Boton } from '../../../src/components/Formulario';
import { BotonFlotante } from '../../../src/components/mapa/BotonFlotante';
import { Mapa } from '../../../src/components/mapa/Mapa';
import { MarcadorParadero } from '../../../src/components/mapa/MarcadorParadero';
import { MarcadorVehiculo } from '../../../src/components/mapa/MarcadorVehiculo';
import { PanelInferior } from '../../../src/components/mapa/PanelInferior';
import { PanelIncidencia } from '../../../src/components/PanelesConductor';
import { useApi } from '../../../src/hooks/useApi';
import { usePantallaMapa } from '../../../src/hooks/usePantallaMapa';
import { useAlertasParada } from '../../../src/session/AlertasParada';
import { useGpsConductor } from '../../../src/session/GpsConductor';
import { colors } from '../../../src/theme/colors';
import { horaLocal } from '../../../src/utils/fechas';
import { caminoDelRecorrido, coordenadasMapa, partirCamino } from '../../../src/utils/recorrido';

const SEGUNDOS_ENTRE_ACTUALIZACIONES = 5;
const ALTURAS = [0.3, 0.8];
const GRIS_RECORRIDO = '#9AA5B5';

// VEH-01 / VEH-02 / VEH-03: el viaje en ruta para el conductor. El mapa sigue a la micro por
// su recorrido y marca los paraderos donde hay paradas solicitadas; el panel muestra el
// próximo paradero, las paradas pendientes en orden y los botones grandes del viaje.
// Llega con `?linea=`, `?recorrido=` y `?turno=` desde el turno.
export default function ViajeEnRutaScreen() {
  usePantallaMapa();
  const params = useLocalSearchParams<{
    id: string;
    linea?: string;
    recorrido?: string;
    turno?: string;
  }>();
  const viajeId = Number(params.id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapa = useRef<MapView>(null);
  const gps = useGpsConductor();
  const { pendientes } = useAlertasParada();
  const linea = useApi(
    () => (params.linea ? obtenerLinea(Number(params.linea)) : Promise.resolve(null)),
    [params.linea ?? null],
  );
  const solicitudes = useApi(() => solicitudesDeParada(viajeId), [viajeId]);
  const recargarSolicitudes = solicitudes.recargar;
  const [indice, setIndice] = useState(0);
  const [alturaPanel, setAlturaPanel] = useState(0);
  const [seguir, setSeguir] = useState(true);
  const [incidencia, setIncidencia] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Las solicitudes (con el nombre de cada pasajero) se actualizan solas.
  useEffect(() => {
    const t = setInterval(recargarSolicitudes, SEGUNDOS_ENTRE_ACTUALIZACIONES * 1000);
    return () => clearInterval(t);
  }, [recargarSolicitudes]);

  const recorrido = linea.datos?.recorridos.find((r) => r.id === Number(params.recorrido));
  const camino = recorrido ? caminoDelRecorrido(recorrido.paraderos, recorrido.trazado) : [];
  const posicion = gps.viajeId === viajeId ? gps.posicion : null;

  // El mapa sigue a la micro mientras `seguir` esté activo (se apaga al mover el mapa a mano).
  const lat = posicion?.latitud;
  const lng = posicion?.longitud;
  useEffect(() => {
    if (!seguir || lat === undefined || lng === undefined) return;
    mapa.current?.animateCamera(
      { center: { latitude: lat, longitude: lng }, zoom: 16 },
      { duration: 600 },
    );
  }, [seguir, lat, lng]);

  const volver = (
    <View style={[styles.arriba, { top: insets.top + 12 }]}>
      <BotonFlotante icono="arrow-back" etiqueta="Volver al turno" onPress={() => router.back()} />
    </View>
  );

  if (linea.cargando && !linea.datos) {
    return (
      <View style={styles.pantalla}>
        <Stack.Screen options={{ headerShown: false }} />
        <Cargando />
        {volver}
      </View>
    );
  }
  if (!linea.datos || !recorrido) {
    return (
      <View style={styles.pantalla}>
        <Stack.Screen options={{ headerShown: false }} />
        <ErrorMensaje
          mensaje={linea.error ?? 'No se encontró el recorrido de este viaje.'}
          onReintentar={linea.recargar}
        />
        {volver}
      </View>
    );
  }

  const color = linea.datos.color;
  const conParada = new Map(pendientes.map((p) => [p.paradero.id, p.total]));
  const siguiente = gps.avance?.siguiente_paradero ?? null;
  const paradaEnSiguiente = siguiente ? (conParada.get(siguiente.id) ?? 0) : 0;
  const ultimoSuperado = gps.avance?.ultimo_orden_superado ?? 0;
  const { recorrido: hecho, falta } = partirCamino(camino, posicion);
  const final = recorrido.paraderos[recorrido.paraderos.length - 1];
  const turnoId = Number(params.turno);

  function terminar() {
    Alert.alert(
      'Finalizar viaje',
      'Se cerrarán las solicitudes de parada abiertas y se dejará de compartir la ubicación.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          style: 'destructive',
          onPress: async () => {
            setEnviando(true);
            try {
              await finalizarViaje(viajeId);
              if (gps.viajeId === viajeId) gps.detener();
              router.back();
            } catch (e) {
              Alert.alert('No se pudo finalizar', textoDeError(e));
            } finally {
              setEnviando(false);
            }
          },
        },
      ],
    );
  }

  async function enviarIncidencia(tipo: 'vehiculo' | 'recorrido', descripcion: string) {
    setEnviando(true);
    try {
      await registrarIncidencia(turnoId, { tipo, descripcion });
      setIncidencia(false);
      setIndice(0);
      Alert.alert('Listo', 'La incidencia quedó registrada para el administrador.');
    } catch (e) {
      Alert.alert('No se pudo registrar', textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  const micro = {
    viaje_id: viajeId,
    vehiculo: { identificador: 'Tu micro' },
    linea: { codigo: linea.datos.codigo, color },
    ultima_ubicacion: posicion,
    ubicacion_atrasada: gps.estado !== 'activo',
  };

  return (
    <View style={styles.pantalla}>
      <Stack.Screen options={{ headerShown: false, title: 'Viaje en ruta' }} />
      <Mapa
        ref={mapa}
        initialRegion={
          posicion
            ? {
                latitude: posicion.latitud,
                longitude: posicion.longitud,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }
            : undefined
        }
        onPanDrag={() => setSeguir(false)}
      >
        {hecho.length > 1 && (
          <Polyline
            coordinates={coordenadasMapa(hecho)}
            strokeColor={GRIS_RECORRIDO}
            strokeWidth={6}
          />
        )}
        {falta.length > 1 && (
          <>
            <Polyline
              coordinates={coordenadasMapa(falta)}
              strokeColor={colors.surface}
              strokeWidth={11}
            />
            <Polyline coordinates={coordenadasMapa(falta)} strokeColor={color} strokeWidth={6} />
          </>
        )}
        {recorrido.paraderos.map((p) => (
          <MarcadorParadero
            key={p.id}
            paradero={p}
            color={
              p.orden <= ultimoSuperado
                ? GRIS_RECORRIDO
                : conParada.has(p.id)
                  ? colors.accent
                  : color
            }
            orden={conParada.get(p.id)}
            destacado={p.id === siguiente?.id}
          />
        ))}
        <MarcadorVehiculo vehiculo={micro} seleccionado />
      </Mapa>
      {volver}
      <View style={[styles.derecha, { top: insets.top + 12 }]}>
        {!seguir && posicion && (
          <BotonFlotante
            icono="navigate"
            etiqueta="Seguir a la micro"
            onPress={() => setSeguir(true)}
          />
        )}
      </View>

      <PanelInferior
        alturas={ALTURAS}
        indice={indice}
        onIndice={setIndice}
        onAltura={setAlturaPanel}
        encabezado={
          <View style={styles.encabezado}>
            <View style={styles.fila}>
              <InsigniaLinea linea={{ codigo: linea.datos.codigo, color }} />
              <Text style={styles.hacia} numberOfLines={1}>
                Hacia {final?.nombre}
              </Text>
            </View>
            <View
              style={[styles.siguiente, paradaEnSiguiente > 0 && styles.siguienteConParada]}
              accessibilityLiveRegion="polite"
            >
              <Text style={[styles.etiqueta, paradaEnSiguiente > 0 && styles.textoClaro]}>
                PRÓXIMO PARADERO
              </Text>
              <Text
                style={[styles.siguienteNombre, paradaEnSiguiente > 0 && styles.textoClaro]}
                numberOfLines={2}
              >
                {siguiente
                  ? siguiente.nombre
                  : gps.estado === 'inactivo'
                    ? 'Ubicación sin compartir'
                    : 'Buscando…'}
              </Text>
              {paradaEnSiguiente > 0 && (
                <Text style={styles.siguienteParada}>
                  <Ionicons name="hand-left" size={18} color={colors.surface} /> Detente:{' '}
                  {paradaEnSiguiente}{' '}
                  {paradaEnSiguiente === 1 ? 'pasajero baja' : 'pasajeros bajan'}
                </Text>
              )}
            </View>
          </View>
        }
      >
        <ScrollView
          contentContainerStyle={[styles.contenido, { paddingBottom: alturaPanel > 0 ? 24 : 0 }]}
        >
          <EstadoGps />

          <Text style={styles.subtitulo}>PARADAS SOLICITADAS ({pendientes.length})</Text>
          {pendientes.length === 0 ? (
            <Text style={styles.dato}>
              Ninguna por ahora. Te avisaremos con sonido y vibración.
            </Text>
          ) : (
            pendientes.map((p) => {
              const grupo = solicitudes.datos?.find((g) => g.paradero.id === p.paradero.id);
              return (
                <View key={p.paradero.id} style={styles.parada}>
                  <View style={styles.total}>
                    <Text style={styles.totalTexto}>{p.total}</Text>
                  </View>
                  <View style={styles.textos}>
                    <Text style={styles.paradaNombre}>{p.paradero.nombre}</Text>
                    {grupo && (
                      <Text style={styles.dato} numberOfLines={2}>
                        {grupo.solicitudes
                          .map((s) => `${s.pasajero_nombre} (${horaLocal(s.creada_en)})`)
                          .join(', ')}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })
          )}

          {incidencia ? (
            <PanelIncidencia
              enviando={enviando}
              onCancelar={() => setIncidencia(false)}
              onEnviar={enviarIncidencia}
            />
          ) : (
            <View style={styles.acciones}>
              {turnoId > 0 && (
                <Boton
                  titulo="Registrar incidencia"
                  variante="secundario"
                  onPress={() => {
                    setIncidencia(true);
                    setIndice(ALTURAS.length - 1);
                  }}
                />
              )}
              <Boton
                titulo="Finalizar viaje"
                variante="peligro"
                onPress={terminar}
                deshabilitado={enviando}
              />
            </View>
          )}
        </ScrollView>
      </PanelInferior>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  arriba: { position: 'absolute', left: 16 },
  derecha: { position: 'absolute', right: 16 },
  encabezado: { paddingHorizontal: 16, gap: 10, paddingBottom: 10 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hacia: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  siguiente: { backgroundColor: colors.background, borderRadius: 16, padding: 14, gap: 2 },
  siguienteConParada: { backgroundColor: colors.accent },
  etiqueta: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, color: colors.textMuted },
  siguienteNombre: { fontSize: 24, fontWeight: '800', color: colors.text },
  siguienteParada: { fontSize: 18, fontWeight: '800', color: colors.surface, marginTop: 4 },
  textoClaro: { color: colors.surface },
  contenido: { paddingHorizontal: 16, gap: 10 },
  subtitulo: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 6,
  },
  dato: { color: colors.textMuted, fontSize: 14 },
  parada: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
  },
  total: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalTexto: { color: colors.surface, fontSize: 18, fontWeight: '800' },
  textos: { flex: 1, gap: 2 },
  paradaNombre: { fontSize: 17, fontWeight: '700', color: colors.text },
  acciones: { gap: 10, marginTop: 8 },
});
