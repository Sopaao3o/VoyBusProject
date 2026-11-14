import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

interface Regla {
  texto: string;
  cumple: boolean;
  /** Las recomendadas no impiden guardar; solo hacen la contraseña más segura. */
  recomendada?: boolean;
}

/** Reglas del registro (ACC-01) o de una contraseña nueva (ACC-04), marcadas a medida que se cumplen. */
function reglasDe(tipo: 'registro' | 'nueva', password: string, actual?: string): Regla[] {
  const simbolo = /[^\p{L}\p{N}\s]/u.test(password);
  if (tipo === 'registro') {
    return [
      { texto: 'Entre 8 y 15 caracteres', cumple: password.length >= 8 && password.length <= 15 },
      { texto: 'Una letra mayúscula', cumple: /\p{Lu}/u.test(password) },
      { texto: 'Una letra minúscula', cumple: /\p{Ll}/u.test(password) },
      { texto: 'Un número', cumple: /\d/.test(password) },
      { texto: 'Un símbolo (por ejemplo ! # $ %)', cumple: simbolo },
    ];
  }
  return [
    { texto: 'Al menos 8 caracteres', cumple: password.length >= 8 },
    { texto: 'Letras y números', cumple: /\p{L}/u.test(password) && /\d/.test(password) },
    {
      texto: 'Distinta a tu contraseña actual',
      cumple: password.length > 0 && password !== (actual ?? ''),
    },
    { texto: 'Un símbolo (por ejemplo ! # $ %)', cumple: simbolo, recomendada: true },
    { texto: '12 caracteres o más', cumple: password.length >= 12, recomendada: true },
  ];
}

export function ReglasPassword({
  tipo,
  password,
  actual,
}: {
  tipo: 'registro' | 'nueva';
  password: string;
  actual?: string;
}) {
  const reglas = reglasDe(tipo, password, actual);
  return (
    <View style={styles.caja} accessibilityLabel="Recomendaciones para una contraseña segura">
      <Text style={styles.titulo}>Para una contraseña segura</Text>
      {reglas.map((r) => (
        <View key={r.texto} style={styles.fila}>
          <Ionicons
            name={r.cumple ? 'checkmark-circle' : 'ellipse-outline'}
            size={18}
            color={r.cumple ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.texto, r.cumple && styles.cumple]}>
            {r.texto}
            {r.recomendada ? ' (recomendado)' : ''}
          </Text>
        </View>
      ))}
      <Text style={styles.consejo}>
        No uses tu nombre, tu correo ni una contraseña de otro sitio.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  titulo: { fontSize: 13, fontWeight: '700', color: colors.text },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  texto: { flex: 1, fontSize: 13, color: colors.textMuted },
  cumple: { color: colors.text },
  consejo: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
