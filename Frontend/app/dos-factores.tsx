import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { confirmar2fa, desactivar2fa, iniciarConfiguracion2fa } from '../src/api/auth';
import { textoDeError } from '../src/api/client';
import type { Configuracion2fa } from '../src/api/tipos';
import { CajaError, ErrorMensaje } from '../src/components/Estados';
import { Boton, Campo } from '../src/components/Formulario';
import { useUsuario } from '../src/session/UsuarioContext';
import { colors } from '../src/theme/colors';

/** "ABCDEFGH" → "ABCD EFGH": más fácil de copiar a mano. */
const enGrupos = (secreto: string) => secreto.replace(/(.{4})/g, '$1 ').trim();

// ACC-01: activar o desactivar la verificación en dos pasos con una aplicación autenticadora
// (Google Authenticator, Authy, Microsoft Authenticator...).
export default function DosFactoresScreen() {
  const router = useRouter();
  const { usuario, actualizarUsuario } = useUsuario();
  const [configuracion, setConfiguracion] = useState<Configuracion2fa | null>(null);
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!usuario) return <ErrorMensaje mensaje="Inicia sesión para configurar tu cuenta." />;

  async function intentar(accion: () => Promise<void>) {
    setError(null);
    setEnviando(true);
    try {
      await accion();
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  const codigoValido = () => {
    if (/^\d{6}$/.test(codigo.trim())) return true;
    setError('El código debe tener 6 dígitos.');
    return false;
  };

  const empezar = () => intentar(async () => setConfiguracion(await iniciarConfiguracion2fa()));

  function activar() {
    if (!codigoValido()) return;
    intentar(async () => {
      const respuesta = await confirmar2fa(codigo.trim());
      actualizarUsuario(respuesta.usuario);
      Alert.alert(
        'Listo',
        'Desde ahora, al iniciar sesión te pediremos el código de tu aplicación.',
      );
      router.back();
    });
  }

  function desactivar() {
    if (!password) {
      setError('Escribe tu contraseña actual.');
      return;
    }
    if (!codigoValido()) return;
    intentar(async () => {
      const respuesta = await desactivar2fa(password, codigo.trim());
      actualizarUsuario(respuesta.usuario);
      Alert.alert('Listo', respuesta.mensaje);
      router.back();
    });
  }

  async function abrirAplicacion() {
    if (!configuracion) return;
    try {
      await Linking.openURL(configuracion.otpauth_url);
    } catch {
      Alert.alert(
        'No se pudo abrir',
        'No encontramos una aplicación autenticadora en este teléfono. Instala una y agrega la clave a mano.',
      );
    }
  }

  // ── Ya está activa: se puede desactivar con la contraseña y un código ──
  if (usuario.dos_factores_activo) {
    return (
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <Text style={styles.titulo}>La verificación en dos pasos está activa</Text>
        <Text style={styles.ayuda}>
          Para desactivarla, confirma tu contraseña y un código de tu aplicación autenticadora.
        </Text>
        <Campo
          etiqueta="Contraseña actual"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
        />
        <Campo
          etiqueta="Código de la aplicación autenticadora"
          value={codigo}
          onChangeText={setCodigo}
          placeholder="123456"
          keyboardType="number-pad"
          maxLength={6}
        />
        <CajaError mensaje={error} />
        <Boton
          titulo={enviando ? 'Desactivando…' : 'Desactivar verificación en dos pasos'}
          variante="peligro"
          onPress={desactivar}
          deshabilitado={enviando}
        />
      </ScrollView>
    );
  }

  // ── Paso 1: explicar y generar la clave ──
  if (!configuracion) {
    return (
      <ScrollView contentContainerStyle={styles.contenido}>
        <Text style={styles.titulo}>Protege tu cuenta</Text>
        <Text style={styles.ayuda}>
          Con la verificación en dos pasos, además de tu contraseña se pide un código de 6 dígitos
          que genera una aplicación autenticadora en tu teléfono (Google Authenticator, Authy o
          Microsoft Authenticator).
        </Text>
        <CajaError mensaje={error} />
        <Boton
          titulo={enviando ? 'Preparando…' : 'Configurar ahora'}
          onPress={empezar}
          deshabilitado={enviando}
        />
      </ScrollView>
    );
  }

  // ── Paso 2: agregar la clave a la aplicación y confirmar un código ──
  return (
    <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Text style={styles.titulo}>1. Agrega VoyBus a tu aplicación</Text>
      <Boton titulo="Abrir mi aplicación autenticadora" onPress={abrirAplicacion} />
      <Text style={styles.ayuda}>
        Si no se abre, agrega una cuenta a mano en la aplicación con esta clave:
      </Text>
      <View style={styles.clave}>
        <Text style={styles.claveTexto} selectable>
          {enGrupos(configuracion.secreto)}
        </Text>
        <Text style={styles.ayuda}>Cuenta: {configuracion.cuenta} · Tipo: basada en tiempo</Text>
      </View>

      <Text style={styles.titulo}>2. Escribe el código que te muestra</Text>
      <Campo
        etiqueta="Código de 6 dígitos"
        value={codigo}
        onChangeText={setCodigo}
        placeholder="123456"
        keyboardType="number-pad"
        maxLength={6}
      />
      <CajaError mensaje={error} />
      <Boton
        titulo={enviando ? 'Activando…' : 'Activar verificación en dos pasos'}
        onPress={activar}
        deshabilitado={enviando}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  titulo: { fontSize: 18, fontWeight: '700', color: colors.text },
  ayuda: { fontSize: 14, color: colors.textMuted },
  clave: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  claveTexto: { fontSize: 18, fontWeight: '700', color: colors.text, letterSpacing: 1 },
});
