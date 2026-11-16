import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';

import { recuperarPassword, restablecerPassword } from '../src/api/auth';
import { textoDeError } from '../src/api/client';
import { CajaError } from '../src/components/Estados';
import { Aviso } from '../src/components/Etiquetas';
import { Boton, Campo, CampoPassword } from '../src/components/Formulario';
import { ReglasPassword } from '../src/components/ReglasPassword';
import { colors } from '../src/theme/colors';

// ACC-04: recuperar la contraseña en dos pasos (pedir el enlace temporal → definir la nueva).
export default function RecuperarScreen() {
  const router = useRouter();
  const [correo, setCorreo] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null); // respuesta del paso 1
  const [tokenDesarrollo, setTokenDesarrollo] = useState(false);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pedirEnlace() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) {
      setError('Escribe el correo electrónico de tu cuenta.');
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const respuesta = await recuperarPassword(correo.trim());
      setMensaje(respuesta.mensaje);
      // En desarrollo el backend devuelve el código del enlace porque no hay servicio de correo.
      setTokenDesarrollo(Boolean(respuesta.token_desarrollo));
      setToken(respuesta.token_desarrollo ?? '');
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  async function restablecer() {
    if (!token.trim()) {
      setError('Pega el código del enlace que recibiste por correo.');
      return;
    }
    if (password !== confirmacion) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const respuesta = await restablecerPassword(token.trim(), password, confirmacion);
      Alert.alert('Listo', `${respuesta.mensaje}. Ya puedes iniciar sesión.`);
      router.dismissTo('/login');
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  if (mensaje === null) {
    return (
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <Text style={styles.titulo}>¿Olvidaste tu contraseña?</Text>
        <Text style={styles.ayuda}>
          Escribe el correo de tu cuenta y te enviaremos un enlace temporal para crear una nueva.
        </Text>
        <Campo
          etiqueta="Correo electrónico"
          value={correo}
          onChangeText={setCorreo}
          placeholder="ana@example.com"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <CajaError mensaje={error} />
        <Boton
          titulo={enviando ? 'Enviando…' : 'Enviar enlace'}
          onPress={pedirEnlace}
          deshabilitado={enviando}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Text style={styles.titulo}>Crea tu nueva contraseña</Text>
      <Text style={styles.ayuda}>{mensaje}.</Text>
      {tokenDesarrollo && (
        <Aviso texto="Modo desarrollo: como no hay servicio de correo, el código del enlace ya está escrito abajo." />
      )}
      <Campo
        etiqueta="Código del enlace"
        value={token}
        onChangeText={setToken}
        ayuda="Viene en el enlace que enviamos a tu correo."
      />
      <CampoPassword
        etiqueta="Nueva contraseña"
        value={password}
        onChangeText={setPassword}
        textContentType="newPassword"
      />
      <ReglasPassword tipo="nueva" password={password} />
      <CampoPassword
        etiqueta="Confirmar nueva contraseña"
        value={confirmacion}
        onChangeText={setConfirmacion}
        textContentType="newPassword"
      />
      <CajaError mensaje={error} />
      <Boton
        titulo={enviando ? 'Guardando…' : 'Guardar nueva contraseña'}
        onPress={restablecer}
        deshabilitado={enviando}
      />
      <Boton
        titulo="Pedir otro enlace"
        variante="secundario"
        deshabilitado={enviando}
        onPress={() => {
          setMensaje(null);
          setError(null);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  titulo: { fontSize: 20, fontWeight: '700', color: colors.text },
  ayuda: { fontSize: 14, color: colors.textMuted },
});
