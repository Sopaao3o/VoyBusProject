import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MicroProxima, ParaderoCercano } from '../../api/tipos';
import { colors } from '../../theme/colors';
import { textoDistancia, textoParaderosAntes } from '../../utils/textos';
import { InsigniaLinea } from '../Etiquetas';

interface Props {
  /** null = aún no se sabe; false = sin permiso de ubicación. */
  permitida: boolean | null;
  cargando: boolean;
  paradero: ParaderoCercano | null;
  micros: MicroProxima[];
  onActivarUbicacion: () => void;
  onAbrirParadero: (id: number) => void;
  onAbrirMicro: (micro: MicroProxima) => void;
}

/**
 * Inicio: tu paradero más cercano y las micros que vienen hacia él (RED-02 y RED-03).
 * Responde de entrada "¿qué micro me sirve y cuánto le falta?".
 */
export function TarjetaCercano({
  permitida,
  cargando,
  paradero,
  micros,
  onActivarUbicacion,
  onAbrirParadero,
  onAbrirMicro,
}: Props) {
  if (permitida === false) {
    return (
      <Pressable
        style={({ pressed }) => [styles.tarjeta, styles.fila, pressed && styles.presionada]}
        onPress={onActivarUbicacion}
        accessibilityRole="button"
      >
        <Ionicons name="locate" size={22} color={colors.primary} />
        <Text style={[styles.texto, styles.flex]}>
          Activa tu ubicación para ver tu paradero más cercano y las micros que vienen.
        </Text>
      </Pressable>
    );
  }
  if (permitida === null || (cargando && !paradero)) {
    return (
      <View style={[styles.tarjeta, styles.fila]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.texto}>Buscando tu paradero más cercano…</Text>
      </View>
    );
  }
  if (!paradero) {
    return (
      <View style={styles.tarjeta}>
        <Text style={styles.titulo}>No hay paraderos cerca de ti</Text>
        <Text style={styles.texto}>Busca una línea o un paradero aquí abajo.</Text>
      </View>
    );
  }

  return (
    <View style={styles.tarjeta}>
      <Pressable
        style={({ pressed }) => [styles.fila, pressed && styles.presionada]}
        onPress={() => onAbrirParadero(paradero.id)}
        accessibilityRole="button"
        accessibilityLabel={`Tu paradero más cercano: ${paradero.nombre}, a ${textoDistancia(
          paradero.distancia_m,
        )}`}
      >
        <View style={styles.icono}>
          <Ionicons name="location" size={18} color={colors.surface} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.etiqueta}>TU PARADERO MÁS CERCANO</Text>
          <Text style={styles.titulo}>{paradero.nombre}</Text>
          <Text style={styles.texto}>
            {paradero.codigo} · a {textoDistancia(paradero.distancia_m)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      {micros.length === 0 ? (
        <Text style={styles.texto}>Ninguna micro se acerca a este paradero ahora.</Text>
      ) : (
        micros.slice(0, 2).map((m) => (
          <Pressable
            key={m.viaje_id}
            style={({ pressed }) => [styles.micro, pressed && styles.presionada]}
            onPress={() => onAbrirMicro(m)}
            accessibilityRole="button"
          >
            <InsigniaLinea linea={m.linea} />
            <View style={styles.flex}>
              <Text style={styles.microTitulo}>
                {m.recorrido.destino ? `Hacia ${m.recorrido.destino}` : m.linea.nombre}
              </Text>
              <Text style={[styles.texto, m.ubicacion_atrasada && styles.atrasada]}>
                {textoParaderosAntes(m.paraderos_antes)}
                {m.distancia_m !== null ? ` · ${textoDistancia(m.distancia_m)}` : ''}
                {m.ubicacion_atrasada ? ' · ubicación atrasada' : ''}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: { backgroundColor: colors.background, borderRadius: 16, padding: 12, gap: 10 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, gap: 2 },
  presionada: { opacity: 0.6 },
  icono: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  etiqueta: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 },
  titulo: { fontSize: 17, fontWeight: '700', color: colors.text },
  texto: { fontSize: 14, color: colors.textMuted },
  atrasada: { color: colors.warning, fontWeight: '600' },
  micro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 10,
  },
  microTitulo: { fontSize: 15, fontWeight: '600', color: colors.text },
});
