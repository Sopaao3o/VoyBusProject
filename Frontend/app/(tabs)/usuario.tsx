import { Pressable, StyleSheet, Text, View } from 'react-native';

import { USUARIOS_PRUEBA, useUsuario } from '../../src/session/UsuarioContext';
import { colors } from '../../src/theme/colors';

// Selector de usuario de prueba: reemplaza al login hasta que Daslav lo implemente.
export default function UsuarioScreen() {
  const { usuario, cambiarUsuario } = useUsuario();

  return (
    <View style={styles.pantalla}>
      <Text style={styles.titulo}>Usuario de prueba</Text>
      <Text style={styles.ayuda}>
        Aún no hay inicio de sesión. Elige con qué usuario de ejemplo quieres usar la app.
      </Text>
      {USUARIOS_PRUEBA.map((u) => {
        const activo = u.id === usuario.id;
        return (
          <Pressable
            key={u.id}
            style={[styles.opcion, activo && styles.opcionActiva]}
            onPress={() => cambiarUsuario(u)}
            accessibilityRole="radio"
            accessibilityState={{ selected: activo }}
          >
            <Text style={[styles.nombre, activo && styles.textoActivo]}>{u.nombre}</Text>
            <Text style={[styles.rol, activo && styles.textoActivo]}>{u.rol}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background, padding: 16, gap: 10 },
  titulo: { fontSize: 20, fontWeight: '700', color: colors.text },
  ayuda: { color: colors.textMuted, marginBottom: 6 },
  opcion: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  opcionActiva: { backgroundColor: colors.primary, borderColor: colors.primary },
  nombre: { fontSize: 16, fontWeight: '600', color: colors.text },
  rol: { fontSize: 13, color: colors.textMuted, textTransform: 'capitalize' },
  textoActivo: { color: colors.surface },
});
