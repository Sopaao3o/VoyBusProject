import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { textoDeError } from '../../src/api/client';
import type { SolicitudParada } from '../../src/api/tipos';
import { avanzarVehiculo, paraderosDisponibles, solicitarParada } from '../../src/api/viajes';
import { Cargando, ErrorMensaje } from '../../src/components/Estados';
import { Boton } from '../../src/components/Formulario';
import { useApi } from '../../src/hooks/useApi';
import { colors } from '../../src/theme/colors';
import { horaLocal } from '../../src/utils/fechas';

const SEGUNDOS_ENTRE_ACTUALIZACIONES = 4;

/** Texto y color de la tarjeta "Tu solicitud" según su estado. */
function presentar(s: SolicitudParada) {
  if (s.estado === 'proxima') {
    return { texto: 'Tu parada es la próxima', color: colors.accent };
  }
  if (s.estado === 'enviada') {
    return { texto: 'Solicitud enviada al conductor', color: colors.primary };
  }
  return { texto: s.motivo_cierre_texto ?? 'Solicitud cerrada', color: colors.textMuted };
}

// VIA-02: elegir el destino entre los paraderos que faltan y enviar la solicitud de parada.
export default function ViajeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const viajeId = Number(id);
  const { datos, cargando, error, recargar } = useApi(
    () => paraderosDisponibles(viajeId),
    [viajeId],
  );
  const [elegido, setElegido] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);

  // El estado se actualiza solo (el vehículo avanza y la solicitud cambia de estado).
  useEffect(() => {
    const t = setInterval(recargar, SEGUNDOS_ENTRE_ACTUALIZACIONES * 1000);
    return () => clearInterval(t);
  }, [recargar]);

  if (cargando && !datos) return <Cargando />;
  if (error && !datos) return <ErrorMensaje mensaje={error} onReintentar={recargar} />;
  if (!datos) return null;

  const { viaje, paraderos, mi_solicitud: solicitud } = datos;
  const abierta = solicitud !== null && solicitud.estado !== 'cerrada';
  const destino = paraderos.find((p) => p.id === elegido) ?? null;

  async function enviar() {
    if (!destino) return;
    setEnviando(true);
    try {
      await solicitarParada(viajeId, destino.id);
      setElegido(null);
      await recargar();
      Alert.alert('Solicitud enviada', 'Tu solicitud de parada fue enviada al conductor.');
    } catch (e) {
      Alert.alert('No se pudo enviar la solicitud', textoDeError(e));
      await recargar();
    } finally {
      setEnviando(false);
    }
  }

  async function avanzar() {
    try {
      await avanzarVehiculo(viajeId);
      await recargar();
    } catch (e) {
      Alert.alert('Simulador', textoDeError(e));
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.contenido}>
      <Stack.Screen options={{ title: `Línea ${viaje.linea_codigo}` }} />

      <View style={styles.tarjeta}>
        <Text style={styles.titulo}>
          Línea {viaje.linea_codigo} · {viaje.sentido === 'ida' ? 'Ida' : 'Vuelta'}
        </Text>
        <Text style={styles.dato}>{viaje.linea_nombre}</Text>
      </View>

      {solicitud && (
        <View style={[styles.solicitud, { borderColor: presentar(solicitud).color }]}>
          <Text style={styles.solicitudEtiqueta}>Tu solicitud</Text>
          <Text style={[styles.solicitudEstado, { color: presentar(solicitud).color }]}>
            {presentar(solicitud).texto}
          </Text>
          <Text style={styles.dato}>
            Destino: {solicitud.paradero.nombre} · enviada a las {horaLocal(solicitud.creada_en)}
          </Text>
        </View>
      )}

      <Text style={styles.subtitulo}>¿Dónde te bajas?</Text>
      {paraderos.length === 0 ? (
        <Text style={styles.dato}>El vehículo ya superó todos los paraderos del recorrido.</Text>
      ) : abierta ? (
        <Text style={styles.dato}>
          Ya tienes una solicitud pendiente. Cuando se cierre podrás pedir otra.
        </Text>
      ) : (
        paraderos.map((p) => {
          const activo = p.id === elegido;
          return (
            <Pressable
              key={p.id}
              onPress={() => setElegido(p.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: activo }}
              style={[styles.paradero, activo && styles.paraderoActivo]}
            >
              <Text style={[styles.orden, activo && styles.ordenActivo]}>{p.orden}</Text>
              <Text style={[styles.paraderoNombre, activo && styles.textoActivo]}>{p.nombre}</Text>
            </Pressable>
          );
        })
      )}

      {!abierta && paraderos.length > 0 && (
        <Boton
          titulo={destino ? `Solicitar parada en ${destino.nombre}` : 'Elige un paradero'}
          onPress={enviar}
          deshabilitado={!destino || enviando}
        />
      )}

      <View style={styles.simulador}>
        <Text style={styles.simuladorTitulo}>Simulador (solo desarrollo)</Text>
        <Text style={styles.dato}>
          Avanza el vehículo hasta el siguiente paradero, como lo haría el GPS del conductor.
        </Text>
        <Boton titulo="Avanzar el vehículo" variante="secundario" onPress={avanzar} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  tarjeta: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  titulo: { fontSize: 18, fontWeight: '700', color: colors.text },
  dato: { color: colors.textMuted, fontSize: 14 },
  subtitulo: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 4 },
  solicitud: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  solicitudEtiqueta: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  solicitudEstado: { fontSize: 18, fontWeight: '800' },
  paradero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  paraderoActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  paraderoNombre: { flex: 1, fontSize: 15, color: colors.text },
  textoActivo: { color: colors.surface },
  orden: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.secondary,
    color: colors.onSecondary,
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '700',
    overflow: 'hidden',
  },
  ordenActivo: { backgroundColor: colors.surface },
  simulador: {
    borderColor: colors.border,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginTop: 8,
  },
  simuladorTitulo: { fontWeight: '700', color: colors.text },
});
