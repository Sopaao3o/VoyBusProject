import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type MapView from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  detenerFlotaSimulada,
  iniciarFlotaSimulada,
  monitoreo as consultarMonitoreo,
} from '../../api/circulacion';
import { textoDeError } from '../../api/client';
import type { VehiculoMonitoreo } from '../../api/tipos';
import { useEnVivo } from '../../hooks/useEnVivo';
import { usePantallaMapa } from '../../hooks/usePantallaMapa';
import { colors } from '../../theme/colors';
import { rangoHoras } from '../../utils/fechas';
import { etiquetaEstadoVehiculo } from '../../utils/textos';
import { Cargando, ErrorMensaje, Vacio } from '../Estados';
import { InsigniaLinea } from '../Etiquetas';
import { BotonFlotante } from '../mapa/BotonFlotante';
import { horaConSegundos, TextoActualizacion } from '../mapa/FichaVehiculo';
import { Mapa } from '../mapa/Mapa';
import { MarcadorVehiculo } from '../mapa/MarcadorVehiculo';
import { PanelInferior } from '../mapa/PanelInferior';

const ALTURAS = [170, 0.45, 0.88];

// ADM-04: el administrador ve en el mapa los vehículos en circulación y, al tocar uno,
// su conductor y turno, línea y sentido, última ubicación, solicitudes, estado e incidencias.
export function Monitoreo() {
  usePantallaMapa();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapa = useRef<MapView>(null);
  const { datos, cargando, error, recargar } = useEnVivo(consultarMonitoreo);
  const [elegido, setElegido] = useState<number | null>(null);
  const [indice, setIndice] = useState(1);
  const [alturaPanel, setAlturaPanel] = useState(0);
  const [simulando, setSimulando] = useState(false);

  const vehiculos = datos?.vehiculos ?? [];
  const seleccionado = vehiculos.find((v) => v.viaje_id === elegido) ?? null;

  function elegir(v: VehiculoMonitoreo) {
    setElegido(v.viaje_id);
    setIndice(1);
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
  }

  async function alternarFlota(iniciar: boolean) {
    setSimulando(true);
    try {
      await (iniciar ? iniciarFlotaSimulada() : detenerFlotaSimulada());
      await recargar();
    } catch (e) {
      Alert.alert('Simulador de flota', textoDeError(e));
    } finally {
      setSimulando(false);
    }
  }

  const resumen = datos?.resumen;
  let contenido;
  if (cargando && !datos) contenido = <Cargando />;
  else if (error && !datos) contenido = <ErrorMensaje mensaje={error} onReintentar={recargar} />;
  else if (seleccionado)
    contenido = <Detalle v={seleccionado} onVerTurno={(id) => router.push(`/turno/${id}`)} />;
  else {
    contenido = (
      <FlatList
        data={vehiculos}
        keyExtractor={(v) => String(v.viaje_id)}
        contentContainerStyle={styles.lista}
        ListEmptyComponent={<Vacio mensaje="No hay vehículos en circulación en este momento." />}
        ListFooterComponent={
          __DEV__ ? (
            <View style={styles.simulador}>
              <Text style={styles.simuladorTitulo}>Simulador de flota (solo desarrollo)</Text>
              <Text style={styles.dato}>
                Pone BUS-02 a BUS-05 en ruta por las líneas 103 y 107. BUS-04 pierde la señal a
                ratos.
              </Text>
              <View style={styles.filaBotones}>
                <Pressable
                  style={[styles.botonChico, simulando && styles.deshabilitado]}
                  onPress={() => alternarFlota(true)}
                  disabled={simulando}
                  accessibilityRole="button"
                >
                  <Text style={styles.botonChicoTexto}>Iniciar</Text>
                </Pressable>
                <Pressable
                  style={[styles.botonChico, simulando && styles.deshabilitado]}
                  onPress={() => alternarFlota(false)}
                  disabled={simulando}
                  accessibilityRole="button"
                >
                  <Text style={styles.botonChicoTexto}>Detener</Text>
                </Pressable>
              </View>
            </View>
          ) : undefined
        }
        renderItem={({ item: v }) => (
          <Pressable
            style={({ pressed }) => [styles.fila, pressed && styles.presionada]}
            onPress={() => elegir(v)}
            accessibilityRole="button"
            accessibilityLabel={`${v.vehiculo.identificador}, línea ${v.linea.codigo}, ${v.conductor.nombre}`}
          >
            <InsigniaLinea linea={v.linea} />
            <View style={styles.textos}>
              <Text style={styles.titulo}>
                {v.vehiculo.identificador} · {v.conductor.nombre}
              </Text>
              <TextoActualizacion vehiculo={v} />
              {(v.solicitudes_pendientes.length > 0 || v.incidencias.length > 0) && (
                <Text style={styles.dato}>
                  {v.solicitudes_pendientes.reduce((n, s) => n + s.total, 0)} solicitudes ·{' '}
                  {v.incidencias.length} incidencias
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      />
    );
  }

  return (
    <View style={styles.pantalla}>
      <Mapa
        ref={mapa}
        mapPadding={{ top: insets.top + 64, right: 0, bottom: alturaPanel, left: 0 }}
        onPress={() => setElegido(null)}
      >
        {vehiculos.map((v) => (
          <MarcadorVehiculo
            key={v.viaje_id}
            vehiculo={v}
            seleccionado={v.viaje_id === elegido}
            onPress={() => elegir(v)}
          />
        ))}
      </Mapa>

      <View style={[styles.arriba, { top: insets.top + 12 }]}>
        <BotonFlotante icono="person" etiqueta="Tu cuenta" onPress={() => router.push('/cuenta')} />
        {resumen && (
          <View style={styles.resumen} accessibilityRole="summary">
            <Text style={styles.resumenTexto}>{resumen.en_circulacion} en ruta</Text>
            <Text
              style={[styles.resumenTexto, resumen.con_ubicacion_atrasada > 0 && styles.alerta]}
            >
              {resumen.con_ubicacion_atrasada} sin señal
            </Text>
            <Text style={[styles.resumenTexto, resumen.con_incidencias > 0 && styles.peligro]}>
              {resumen.con_incidencias} con incidencias
            </Text>
          </View>
        )}
      </View>

      <PanelInferior
        alturas={ALTURAS}
        indice={indice}
        onIndice={setIndice}
        onAltura={setAlturaPanel}
        encabezado={
          <View style={styles.encabezado}>
            {seleccionado ? (
              <Pressable
                style={styles.volver}
                onPress={() => setElegido(null)}
                accessibilityRole="button"
              >
                <Ionicons name="arrow-back" size={20} color={colors.primary} />
                <Text style={styles.volverTexto}>Todos los vehículos</Text>
              </Pressable>
            ) : (
              <>
                <Text style={styles.encabezadoTitulo}>Operación en vivo</Text>
                <Text style={styles.dato}>
                  {resumen?.solicitudes_pendientes ?? 0} solicitudes de parada pendientes · se
                  actualiza cada 5 s
                </Text>
              </>
            )}
          </View>
        }
      >
        {contenido}
      </PanelInferior>
    </View>
  );
}

function Detalle({ v, onVerTurno }: { v: VehiculoMonitoreo; onVerTurno: (id: number) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.detalle}>
      <View style={styles.filaSimple}>
        <InsigniaLinea linea={v.linea} />
        <View style={styles.textos}>
          <Text style={styles.titulo}>
            {v.vehiculo.identificador} · {v.recorrido.sentido === 'ida' ? 'Ida' : 'Vuelta'}
          </Text>
          <Text style={styles.dato}>
            {v.linea.nombre}
            {v.recorrido.destino ? ` · hacia ${v.recorrido.destino}` : ''}
          </Text>
        </View>
      </View>

      <Seccion titulo="CONDUCTOR Y TURNO">
        <Text style={styles.valor}>{v.conductor.nombre}</Text>
        <Text style={styles.dato}>
          Turno #{v.turno.id} ·{' '}
          {rangoHoras(v.turno.inicio_planificado, v.turno.termino_planificado)}
        </Text>
      </Seccion>

      <Seccion titulo="UBICACIÓN">
        <TextoActualizacion vehiculo={v} />
        {v.ubicacion_atrasada && (
          <Text style={styles.dato}>
            Se muestra la última posición conocida. Sin señal, el viaje sigue en curso.
          </Text>
        )}
        {v.siguiente_paradero && (
          <Text style={styles.dato}>
            Próximo paradero: {v.siguiente_paradero.nombre} ({v.siguiente_paradero.codigo})
          </Text>
        )}
      </Seccion>

      <Seccion titulo="SOLICITUDES DE PARADA PENDIENTES">
        {v.solicitudes_pendientes.length === 0 ? (
          <Text style={styles.dato}>Ninguna.</Text>
        ) : (
          v.solicitudes_pendientes.map((s) => (
            <Text key={s.paradero.id} style={styles.valor}>
              {s.paradero.orden}. {s.paradero.nombre} · {s.total}{' '}
              {s.total === 1 ? 'solicitud' : 'solicitudes'}
            </Text>
          ))
        )}
      </Seccion>

      <Seccion titulo="ESTADO DEL VEHÍCULO E INCIDENCIAS">
        <Text style={styles.valor}>{etiquetaEstadoVehiculo(v.estado_vehiculo)}</Text>
        {v.incidencias.length === 0 ? (
          <Text style={styles.dato}>Sin incidencias en este turno.</Text>
        ) : (
          v.incidencias.map((i) => (
            <Text key={i.id} style={styles.dato}>
              {horaConSegundos(i.fecha).slice(0, 5)} ·{' '}
              {i.tipo === 'vehiculo' ? 'Del vehículo' : 'Del recorrido'}: {i.descripcion}
            </Text>
          ))
        )}
      </Seccion>

      <Pressable
        style={({ pressed }) => [styles.boton, pressed && styles.presionada]}
        onPress={() => onVerTurno(v.turno.id)}
        accessibilityRole="button"
      >
        <Text style={styles.botonTexto}>Ver el turno completo</Text>
      </Pressable>
    </ScrollView>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View style={styles.seccion}>
      <Text style={styles.seccionTitulo}>{titulo}</Text>
      {children}
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
    alignItems: 'center',
    gap: 10,
  },
  resumen: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 6,
    shadowColor: '#0F2A4A',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  resumenTexto: { fontSize: 13, fontWeight: '700', color: colors.text },
  alerta: { color: colors.warning },
  peligro: { color: colors.accent },
  encabezado: { paddingHorizontal: 16, paddingBottom: 8, gap: 2 },
  encabezadoTitulo: { fontSize: 18, fontWeight: '700', color: colors.text },
  volver: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  volverTexto: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  lista: { paddingHorizontal: 16, paddingBottom: 16 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filaSimple: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  presionada: { opacity: 0.6 },
  textos: { flex: 1, gap: 2 },
  titulo: { fontSize: 16, fontWeight: '700', color: colors.text },
  dato: { fontSize: 14, color: colors.textMuted },
  valor: { fontSize: 15, color: colors.text, fontWeight: '500' },
  detalle: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  seccion: { gap: 4 },
  seccionTitulo: { fontSize: 12, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 },
  boton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonTexto: { color: colors.surface, fontWeight: '700', fontSize: 15 },
  simulador: {
    marginTop: 16,
    backgroundColor: colors.warningBg,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  simuladorTitulo: { fontSize: 14, fontWeight: '700', color: colors.warning },
  filaBotones: { flexDirection: 'row', gap: 10 },
  botonChico: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonChicoTexto: { color: colors.warning, fontWeight: '700' },
  deshabilitado: { opacity: 0.5 },
});
