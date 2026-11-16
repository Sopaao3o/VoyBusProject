import { StyleSheet, TextInput } from 'react-native';

import { colors } from '../theme/colors';

export function Buscador({
  valor,
  onCambio,
  placeholder,
}: {
  valor: string;
  onCambio: (texto: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      style={styles.input}
      value={valor}
      onChangeText={onCambio}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
      accessibilityLabel={placeholder}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    margin: 16,
    marginBottom: 8,
  },
});
