import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Boton } from '../../src/components/Formulario';
import { useUsuario } from '../../src/session/UsuarioContext';
import { colors } from '../../src/theme/colors';

// Selector de usuario de prueba: reemplaza al login hasta que Daslav lo implemente.
// ACC-01 agrega aquí las cuentas de pasajero creadas en la app.
export default function UsuarioScreen() {
  const router = useRouter();
  const { usuario, usuarios, cambiarUsuario } = useUsuario();

  return (
    <ScrollView contentContainerStyle={styles.pantalla}>
      <Text style={styles.titulo}>Tu cuenta</Text>
      <Text style={styles.ayuda}>
        Aún no hay inicio de sesión. Elige un usuario de ejemplo o crea una cuenta de pasajero.
      </Text>

      <View style={styles.actual}>
        <Text style={styles.actualEtiqueta}>Sesión actual</Text>
        <Text style={styles.actualNombre}>{usuario.nombre}</Text>
        <Text style={styles.rol}>{usuario.rol}</Text>
      </View>

      <Boton titulo="Crear cuenta de pasajero" onPress={() => router.push('/registro')} />

      <Text style={styles.subtitulo}>Cambiar de usuario</Text>
      {usuarios.map((u) => {
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pantalla: { padding: 16, gap: 10, paddingBottom: 40 },
  titulo: { fontSize: 20, fontWeight: '700', color: colors.text },
  subtitulo: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 10 },
  ayuda: { color: colors.textMuted, marginBottom: 6 },
  actual: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
  },
  actualEtiqueta: { fontSize: 12, fontWeight: '600', color: colors.surface, opacity: 0.8 },
  actualNombre: { fontSize: 18, fontWeight: '700', color: colors.surface, marginTop: 2 },
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
