import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';

import { cambiarPassword } from '../src/api/auth';
import { textoDeError } from '../src/api/client';
import { CajaError } from '../src/components/Estados';
import { Boton, Campo } from '../src/components/Formulario';
import { useUsuario } from '../src/session/UsuarioContext';
import { colors } from '../src/theme/colors';

// ACC-04: cambiar la contraseña desde la cuenta, confirmando con la contraseña actual.
export default function CambiarPasswordScreen() {
  const router = useRouter();
  const { renovarToken } = useUsuario();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!actual || !nueva) {
      setError('Escribe tu contraseña actual y la nueva.');
      return;
    }
    if (nueva !== confirmacion) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const respuesta = await cambiarPassword({
        password_actual: actual,
        password: nueva,
        confirmacion,
      });
      // El servidor cierra las demás sesiones y entrega un token nuevo para esta.
      renovarToken(respuesta.token);
      Alert.alert('Listo', `${respuesta.mensaje}. Las demás sesiones se cerraron.`);
      router.back();
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Text style={styles.ayuda}>
        Por seguridad, al cambiar la contraseña se cierran tus sesiones en otros dispositivos.
      </Text>
      <Campo
        etiqueta="Contraseña actual"
        value={actual}
        onChangeText={setActual}
        secureTextEntry
        textContentType="password"
      />
      <Campo
        etiqueta="Nueva contraseña"
        value={nueva}
        onChangeText={setNueva}
        secureTextEntry
        textContentType="newPassword"
        ayuda="Al menos 8 caracteres, con letras y números."
      />
      <Campo
        etiqueta="Repetir nueva contraseña"
        value={confirmacion}
        onChangeText={setConfirmacion}
        secureTextEntry
        textContentType="newPassword"
      />
      <CajaError mensaje={error} />
      <Boton
        titulo={enviando ? 'Guardando…' : 'Cambiar contraseña'}
        onPress={guardar}
        deshabilitado={enviando}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  ayuda: { fontSize: 14, color: colors.textMuted },
});
