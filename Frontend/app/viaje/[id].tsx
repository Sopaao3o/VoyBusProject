import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type MapView from 'react-native-maps';
import { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, textoDeError } from '../../src/api/client';
import type { SolicitudParada } from '../../src/api/tipos';
import { avanzarVehiculo, paraderosDisponibles, solicitarParada } from '../../src/api/viajes';
import { desvincularme } from '../../src/api/vinculacion';
import { Cargando, ErrorMensaje, Vacio } from '../../src/components/Estados';
import { InsigniaLinea } from '../../src/components/Etiquetas';
import { Boton } from '../../src/components/Formulario';
import { BotonFlotante } from '../../src/components/mapa/BotonFlotante';
import { horaConSegundos } from '../../src/components/mapa/FichaVehiculo';
import { Mapa } from '../../src/components/mapa/Mapa';
import { MarcadorParadero } from '../../src/components/mapa/MarcadorParadero';
import { MarcadorVehiculo } from '../../src/components/mapa/MarcadorVehiculo';
import { PanelInferior } from '../../src/components/mapa/PanelInferior';
import { useApi } from '../../src/hooks/useApi';
import { usePantallaMapa } from '../../src/hooks/usePantallaMapa';
import { colors } from '../../src/theme/colors';
import { horaLocal } from '../../src/utils/fechas';
import { caminoDelRecorrido, coordenadasMapa, partirCamino } from '../../src/utils/recorrido';

const SEGUNDOS_ENTRE_ACTUALIZACIONES = 4;
const ALTURAS = [0.34, 0.82];
const GRIS_RECORRIDO = '#9AA5B5';

/** Texto, ícono y color del estado de la solicitud. */
function presentar(s: SolicitudParada) {
  if (s.estado === 'proxima') {
    return {
      texto: 'Tu parada es la próxima',
      icono: 'alert-circle' as const,
      color: colors.accent,
    };
  }
  if (s.estado === 'enviada') {
    return {
      texto: 'Solicitud enviada al conductor',
      icono: 'checkmark-circle' as const,
      color: colors.primary,
    };
  }
  return {
    texto: s.motivo_cierre_texto ?? 'Solicitud cerrada',
    icono: 'close-circle' as const,
    color: colors.textMuted,
  };
}

// VIA-02: el pasajero vinculado ve su micro avanzar en el mapa, elige dónde bajarse (en el
// mapa o en la lista) y envía la solicitud de parada. VIA-03: el estado se actualiza solo y,
// sin ubicación reciente, se avisa que la información puede estar atrasada.
// VIA-01: desde aquí también se baja de la micro (desvincularse).
export default function ViajeScreen() {
  usePantallaMapa();
  const { id } = useLocalSearchParams<{ id: string }>();
  const viajeId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapa = useRef<MapView>(null);
  // Se guarda el error con su código para distinguir "no vinculado" o "viaje terminado".
  const [motivo, setMotivo] = useState<'no_vinculado' | 'terminado' | null>(null);
  const { datos, cargando, error, recargar } = useApi(async () => {
    try {
      const r = await paraderosDisponibles(viajeId);
      setMotivo(null);
      return r;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NO_VINCULADO') setMotivo('no_vinculado');
      else if (e instanceof ApiError && e.status === 409) setMotivo('terminado');
      throw e;
    }
  }, [viajeId]);
  const [bajando, setBajando] = useState(false);
  const [elegido, setElegido] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [indice, setIndice] = useState(0);
  const [alturaPanel, setAlturaPanel] = useState(0);
  const [mapaListo, setMapaListo] = useState(false);
  const [encuadrado, setEncuadrado] = useState(false);

  // El estado se actualiza solo (el vehículo avanza y la solicitud cambia de estado).
  useEffect(() => {
    const t = setInterval(recargar, SEGUNDOS_ENTRE_ACTUALIZACIONES * 1000);
    return () => clearInterval(t);
  }, [recargar]);

  const camino = datos
    ? caminoDelRecorrido(datos.recorrido.paraderos, datos.recorrido.trazado)
    : [];
  const claveCamino = datos ? `${datos.recorrido.id}-${camino.length}` : '';

  // Al abrir, el mapa muestra todo el recorrido sobre el panel (una sola vez).
  useEffect(() => {
    if (!mapaListo || alturaPanel === 0 || encuadrado || !claveCamino) return;
    mapa.current?.fitToCoordinates(coordenadasMapa(camino), {
      edgePadding: { top: insets.top + 90, right: 50, bottom: alturaPanel + 30, left: 50 },
      animated: true,
    });
    // Encuadrar una sola vez es justo lo que se busca: después el pasajero mueve el mapa.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEncuadrado(true);
    // `camino` cambia de identidad en cada consulta; `claveCamino` resume lo que importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapaListo, alturaPanel, encuadrado, claveCamino, insets.top]);

  const volver = (
    <View style={[styles.arriba, { top: insets.top + 12 }]}>
      <BotonFlotante icono="arrow-back" etiqueta="Volver" onPress={() => router.back()} />
    </View>
  );

  if (motivo === 'terminado' || motivo === 'no_vinculado') {
    return (
      <View style={styles.fin}>
        <Stack.Screen options={{ headerShown: true, title: 'Tu viaje' }} />
        <Vacio
          mensaje={
            motivo === 'terminado'
              ? 'Este viaje terminó y tu vinculación con la micro también.'
              : 'Ya no estás vinculado a esta micro. Escanea su código para volver a vincularte.'
          }
        />
        {motivo === 'terminado' ? (
          <Boton titulo="Volver al mapa" onPress={() => router.dismissTo('/')} />
        ) : (
          <Boton titulo="Subir a una micro" onPress={() => router.replace('/viajar')} />
        )}
      </View>
    );
  }
  if (!datos) {
    return (
      <View style={styles.pantalla}>
        <Stack.Screen options={{ headerShown: false }} />
        {cargando ? (
          <Cargando />
        ) : (
          <ErrorMensaje mensaje={error ?? 'No se pudo cargar el viaje.'} onReintentar={recargar} />
        )}
        {volver}
      </View>
    );
  }

  const { viaje, paraderos, mi_solicitud: solicitud, ubicacion_vehiculo: ubicacion } = datos;
  const abierta = solicitud !== null && solicitud.estado !== 'cerrada';
  const destino = paraderos.find((p) => p.id === elegido) ?? null;
  const posicion =
    ubicacion.latitud !== null && ubicacion.longitud !== null
      ? { latitud: ubicacion.latitud, longitud: ubicacion.longitud }
      : null;
  const { recorrido: hecho, falta } = partirCamino(camino, posicion);
  const final = datos.recorrido.paraderos[datos.recorrido.paraderos.length - 1];
  const destinoMarcado = abierta ? solicitud.paradero.id : elegido;
  const faltanParaDestino =
    abierta && solicitud.paradero.orden !== null
      ? solicitud.paradero.orden - viaje.ultimo_orden_superado - 1
      : null;

  function elegir(paraderoId: number) {
    if (abierta || !paraderos.some((p) => p.id === paraderoId)) return;
    setElegido(paraderoId);
  }

  async function enviar() {
    if (!destino) return;
    setEnviando(true);
    try {
      await solicitarParada(viajeId, destino.id);
      setElegido(null);
      setIndice(0);
      await recargar();
    } catch (e) {
      Alert.alert('No se pudo enviar la solicitud', textoDeError(e));
      await recargar();
    } finally {
      setEnviando(false);
    }
  }

  function bajarme() {
    Alert.alert(
      'Bajarme de esta micro',
      abierta
        ? 'Tu solicitud de parada se cancelará y el conductor ya no la verá.'
        : 'Dejarás de estar vinculado a esta micro.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bajarme',
          style: 'destructive',
          onPress: async () => {
            setBajando(true);
            try {
              await desvincularme();
              router.dismissTo('/');
            } catch (e) {
              Alert.alert('No se pudo completar', textoDeError(e));
            } finally {
              setBajando(false);
            }
          },
        },
      ],
    );
  }

  async function avanzar() {
    try {
      await avanzarVehiculo(viajeId);
      await recargar();
    } catch (e) {
      Alert.alert('Simulador', textoDeError(e));
    }
  }

  function centrarEnMicro() {
    if (!posicion) return;
    mapa.current?.animateToRegion(
      {
        latitude: posicion.latitud,
        longitude: posicion.longitud,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      500,
    );
  }

  const estado = solicitud ? presentar(solicitud) : null;
  const micro = {
    viaje_id: viaje.id,
    vehiculo: { identificador: `Línea ${viaje.linea_codigo}` },
    linea: { codigo: viaje.linea_codigo, color: viaje.linea_color },
    ultima_ubicacion: posicion,
    ubicacion_atrasada: ubicacion.informacion_atrasada,
  };

  return (
    <View style={styles.pantalla}>
      <Stack.Screen options={{ headerShown: false, title: `Línea ${viaje.linea_codigo}` }} />
      <Mapa ref={mapa} onMapReady={() => setMapaListo(true)}>
        {/* Lo ya recorrido en gris; lo que falta, con el color de la línea. */}
        {hecho.length > 1 && (
          <Polyline
            coordinates={coordenadasMapa(hecho)}
            strokeColor={GRIS_RECORRIDO}
            strokeWidth={5}
          />
        )}
        {falta.length > 1 && (
          <>
            <Polyline
              coordinates={coordenadasMapa(falta)}
              strokeColor={colors.surface}
              strokeWidth={9}
            />
            <Polyline
              coordinates={coordenadasMapa(falta)}
              strokeColor={viaje.linea_color}
              strokeWidth={5}
            />
          </>
        )}
        {datos.recorrido.paraderos.map((p) => (
          <MarcadorParadero
            key={p.id}
            paradero={p}
            color={p.superado ? GRIS_RECORRIDO : viaje.linea_color}
            destacado={p.id === destinoMarcado}
            onPress={() => elegir(p.id)}
          />
        ))}
        <MarcadorVehiculo vehiculo={micro} seleccionado />
      </Mapa>
      {volver}
      <View style={[styles.derecha, { top: insets.top + 12 }]}>
        {posicion && (
          <BotonFlotante icono="bus" etiqueta="Centrar en la micro" onPress={centrarEnMicro} />
        )}
      </View>

      {/* VIA-03: sin ubicación reciente se mantiene el último estado conocido, avisando. */}
      {ubicacion.informacion_atrasada && (
        <View
          style={[styles.atrasada, { top: insets.top + 72 }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Ionicons name="cloud-offline" size={18} color={colors.warning} />
          <Text style={styles.atrasadaTexto}>
            {ubicacion.registrado_en
              ? `Información atrasada: la micro no envía su ubicación desde las ${horaConSegundos(ubicacion.registrado_en)}.`
              : 'La micro todavía no envía su ubicación.'}
          </Text>
        </View>
      )}

      <PanelInferior
        alturas={ALTURAS}
        indice={indice}
        onIndice={setIndice}
        onAltura={setAlturaPanel}
        encabezado={
          <View style={styles.encabezado}>
            <View style={styles.fila}>
              <InsigniaLinea linea={{ codigo: viaje.linea_codigo, color: viaje.linea_color }} />
              <View style={styles.textos}>
                <Text style={styles.titulo} numberOfLines={1}>
                  Hacia {final?.nombre ?? viaje.linea_nombre}
                </Text>
                <Text style={styles.dato} numberOfLines={1}>
                  {viaje.linea_nombre}
                </Text>
              </View>
            </View>

            {abierta && estado ? (
              <View
                style={[styles.estado, { borderColor: estado.color }]}
                accessibilityLiveRegion="polite"
              >
                <Ionicons name={estado.icono} size={26} color={estado.color} />
                <View style={styles.textos}>
                  <Text style={[styles.estadoTexto, { color: estado.color }]}>{estado.texto}</Text>
                  <Text style={styles.dato}>
                    Bajas en {solicitud.paradero.nombre}
                    {faltanParaDestino !== null && faltanParaDestino > 0
                      ? ` · faltan ${faltanParaDestino} ${faltanParaDestino === 1 ? 'paradero' : 'paraderos'}`
                      : ''}
                  </Text>
                </View>
              </View>
            ) : destino ? (
              <Boton
                titulo={enviando ? 'Enviando…' : `Solicitar parada en ${destino.nombre}`}
                onPress={enviar}
                deshabilitado={enviando}
              />
            ) : (
              <Text style={styles.pregunta}>
                {paraderos.length === 0
                  ? 'La micro ya pasó por todos los paraderos.'
                  : '¿Dónde te bajas? Toca tu paradero en el mapa o elígelo abajo.'}
              </Text>
            )}
            {solicitud && !abierta && estado && (
              <Text style={[styles.dato, { color: estado.color }]}>
                Tu última solicitud: {estado.texto.toLowerCase()} ({solicitud.paradero.nombre},{' '}
                {horaLocal(solicitud.creada_en)}).
              </Text>
            )}
          </View>
        }
      >
        <ScrollView contentContainerStyle={styles.contenido}>
          {!abierta && paraderos.length > 0 && (
            <>
              <Text style={styles.subtitulo}>PARADEROS QUE FALTAN</Text>
              {paraderos.map((p) => {
                const activo = p.id === elegido;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => elegir(p.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: activo }}
                    accessibilityLabel={`Paradero ${p.orden}: ${p.nombre}`}
                    style={({ pressed }) => [
                      styles.paradero,
                      activo && { backgroundColor: viaje.linea_color },
                      pressed && styles.presionado,
                    ]}
                  >
                    <Ionicons
                      name={activo ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={activo ? colors.surface : viaje.linea_color}
                    />
                    <View style={styles.textos}>
                      <Text style={[styles.paraderoNombre, activo && styles.textoActivo]}>
                        {p.nombre}
                      </Text>
                      <Text style={[styles.codigo, activo && styles.textoActivo]}>
                        {p.orden - viaje.ultimo_orden_superado - 1 === 0
                          ? 'Próximo paradero'
                          : `En ${p.orden - viaje.ultimo_orden_superado - 1} paraderos`}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </>
          )}
          {abierta && (
            <Text style={styles.dato}>
              Tienes una solicitud pendiente. Cuando se cierre podrás pedir otra.
            </Text>
          )}

          <View style={styles.acciones}>
            <Boton
              titulo={bajando ? 'Bajando…' : 'Bajarme de esta micro'}
              variante="secundario"
              onPress={bajarme}
              deshabilitado={bajando}
            />
            {__DEV__ && (
              <Boton
                titulo="Simulador: adelantar al siguiente paradero"
                variante="secundario"
                onPress={avanzar}
              />
            )}
          </View>
        </ScrollView>
      </PanelInferior>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  fin: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  arriba: { position: 'absolute', left: 16 },
  derecha: { position: 'absolute', right: 16 },
  atrasada: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.warningBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    elevation: 4,
  },
  atrasadaTexto: { flex: 1, color: colors.warning, fontSize: 13, fontWeight: '600' },
  encabezado: { paddingHorizontal: 16, gap: 12, paddingBottom: 10 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textos: { flex: 1, gap: 2 },
  titulo: { fontSize: 18, fontWeight: '700', color: colors.text },
  dato: { color: colors.textMuted, fontSize: 14 },
  pregunta: { fontSize: 16, fontWeight: '600', color: colors.text },
  estado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderRadius: 14,
    padding: 12,
  },
  estadoTexto: { fontSize: 17, fontWeight: '800' },
  contenido: { paddingHorizontal: 16, paddingBottom: 16, gap: 6 },
  subtitulo: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 2,
  },
  paradero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  presionado: { opacity: 0.7 },
  paraderoNombre: { fontSize: 15, fontWeight: '600', color: colors.text },
  codigo: { fontSize: 12, color: colors.textMuted },
  textoActivo: { color: colors.surface },
  acciones: { gap: 8, marginTop: 12 },
});
