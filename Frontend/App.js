import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from './src/theme/colors';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>VoyBus</Text>
      <Text style={styles.subtitle}>Transporte público en tiempo real</Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.surface,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: colors.background,
    textAlign: 'center',
  },
});
