import { StyleSheet, Text, View } from 'react-native';

import type { Linea } from '../api/tipos';
import { colors } from '../theme/colors';

/** Código de la línea con su color (ej. "103"). */
export function InsigniaLinea({ linea }: { linea: Pick<Linea, 'codigo' | 'color'> }) {
  return (
    <View style={[styles.insignia, { backgroundColor: linea.color }]}>
      <Text style={styles.insigniaTexto}>{linea.codigo}</Text>
    </View>
  );
}

export function Aviso({ texto }: { texto: string }) {
  return (
    <View style={styles.aviso}>
      <Text style={styles.avisoTexto}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  insignia: {
    minWidth: 52,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  insigniaTexto: { color: '#fff', fontWeight: '700', fontSize: 16 },
  aviso: { backgroundColor: colors.warningBg, borderRadius: 8, padding: 10 },
  avisoTexto: { color: colors.warning, fontSize: 14 },
});
