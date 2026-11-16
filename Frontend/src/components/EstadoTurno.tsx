import { StyleSheet, Text, View } from 'react-native';

import type { EstadoTurno } from '../api/tipos';
import { colors } from '../theme/colors';

const TEXTO: Record<EstadoTurno, string> = {
  programado: 'Programado',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
};
const COLOR: Record<EstadoTurno, string> = {
  programado: colors.secondary,
  en_curso: colors.primary,
  finalizado: colors.textMuted,
};

export function InsigniaEstadoTurno({ estado }: { estado: EstadoTurno }) {
  return (
    <View style={[styles.insignia, { backgroundColor: COLOR[estado] }]}>
      <Text style={styles.texto}>{TEXTO[estado]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  insignia: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  texto: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
