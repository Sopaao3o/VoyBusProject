import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { VehiculoCirculacion } from '../../api/tipos';
import { colors } from '../../theme/colors';
import { textoHace } from '../../utils/textos';
import { InsigniaLinea } from '../Etiquetas';

const dos = (n: number) => String(n).padStart(2, '0');
export const horaConSegundos = (iso: string) => {
  const d = new Date(iso);
  return `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
};

/** Línea "Actualizada hace 8 s" o el aviso de ubicación atrasada, con su hora (RED-03, ADM-04). */
export function TextoActualizacion({ vehiculo }: { vehiculo: VehiculoCirculacion }) {
  const u = vehiculo.ultima_ubicacion;
  if (!u) return <Text style={styles.atrasada}>Todavía no envía su ubicación.</Text>;
  if (vehiculo.ubicacion_atrasada) {
    return (
      <Text style={styles.atrasada}>
        Ubicación atrasada · última a las {horaConSegundos(u.registrado_en)}
      </Text>
    );
  }
  return (
    <Text style={styles.dato}>
      Actualizada a las {horaConSegundos(u.registrado_en)} (
      {textoHace(vehiculo.segundos_desde_actualizacion ?? 0)})
    </Text>
  );
}

/** RED-03: lo que se ve al tocar una micro en el mapa. */
export function FichaVehiculo({
  vehiculo,
  onVerLinea,
  onCerrar,
}: {
  vehiculo: VehiculoCirculacion;
  onVerLinea?: () => void;
  onCerrar: () => void;
}) {
  const sentido = vehiculo.recorrido.sentido === 'ida' ? 'Ida' : 'Vuelta';
  return (
    <View style={styles.ficha}>
      <View style={styles.fila}>
        <InsigniaLinea linea={vehiculo.linea} />
        <View style={styles.textos}>
          <Text style={styles.titulo}>
            {vehiculo.vehiculo.identificador} · {sentido}
          </Text>
          <Text style={styles.dato}>
            {vehiculo.linea.nombre}
            {vehiculo.recorrido.destino ? ` · hacia ${vehiculo.recorrido.destino}` : ''}
          </Text>
        </View>
        <Pressable
          onPress={onCerrar}
          accessibilityRole="button"
          accessibilityLabel="Cerrar la ficha de la micro"
          hitSlop={10}
        >
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
      <TextoActualizacion vehiculo={vehiculo} />
      {vehiculo.siguiente_paradero && (
        <Text style={styles.dato}>
          Próximo paradero: {vehiculo.siguiente_paradero.nombre} (
          {vehiculo.siguiente_paradero.codigo})
        </Text>
      )}
      {onVerLinea && (
        <Pressable
          style={({ pressed }) => [styles.boton, pressed && styles.presionado]}
          onPress={onVerLinea}
          accessibilityRole="button"
        >
          <Text style={styles.botonTexto}>
            Ver el recorrido de la línea {vehiculo.linea.codigo}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ficha: { backgroundColor: colors.background, borderRadius: 14, padding: 12, gap: 6 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textos: { flex: 1, gap: 2 },
  titulo: { fontSize: 16, fontWeight: '700', color: colors.text },
  dato: { fontSize: 14, color: colors.textMuted },
  atrasada: { fontSize: 14, color: colors.warning, fontWeight: '700' },
  boton: {
    marginTop: 4,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  presionado: { opacity: 0.7 },
  botonTexto: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
