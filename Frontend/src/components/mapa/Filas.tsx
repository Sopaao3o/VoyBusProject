import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Linea, Paradero } from '../../api/tipos';
import { colors } from '../../theme/colors';
import { Aviso, InsigniaLinea } from '../Etiquetas';

/** Una línea en la lista del panel (RED-01). */
export function FilaLinea({ linea, onPress }: { linea: Linea; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.fila, pressed && styles.presionada]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Línea ${linea.codigo}, ${linea.nombre}`}
    >
      <View style={styles.linea}>
        <InsigniaLinea linea={linea} />
        <View style={styles.textos}>
          <Text style={styles.titulo}>{linea.nombre}</Text>
          {linea.punto_inicio && linea.punto_termino && (
            <Text style={styles.detalle}>
              {linea.punto_inicio} → {linea.punto_termino}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
      {linea.aviso && <Aviso texto={linea.aviso} />}
    </Pressable>
  );
}

/** Un paradero en la lista del panel (RED-02). */
export function FilaParadero({
  paradero,
  favorito,
  onPress,
}: {
  paradero: Paradero;
  favorito: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.fila, pressed && styles.presionada]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Paradero ${paradero.nombre}, código ${paradero.codigo}${
        favorito ? ', favorito' : ''
      }`}
    >
      <View style={styles.linea}>
        <View style={[styles.icono, favorito && styles.iconoFavorito]}>
          <Ionicons
            name={favorito ? 'star' : 'location'}
            size={18}
            color={favorito ? colors.surface : colors.primary}
          />
        </View>
        <View style={styles.textos}>
          <Text style={styles.titulo}>{paradero.nombre}</Text>
          <Text style={styles.detalle}>Código {paradero.codigo}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fila: {
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  presionada: { opacity: 0.6 },
  linea: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textos: { flex: 1, gap: 2 },
  titulo: { fontSize: 16, fontWeight: '600', color: colors.text },
  detalle: { fontSize: 13, color: colors.textMuted },
  icono: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F0FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconoFavorito: { backgroundColor: colors.primary },
});
