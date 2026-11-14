import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { entrarComoInvitado, iniciarSesion, verificarSegundoFactor } from '../src/api/auth';
import { textoDeError } from '../src/api/client';
import type { CanalVerificacion } from '../src/api/tipos';
import { CajaError } from '../src/components/Estados';
import { Boton, Campo, Selector } from '../src/components/Formulario';
import { useUsuario } from '../src/session/UsuarioContext';
import { colors } from '../src/theme/colors';

// ACC-02: inicio de sesión con correo o teléfono. Si la cuenta tiene verificación en dos pasos,
// pide además el código de la aplicación autenticadora.
export default function LoginScreen() {
  const router = useRouter();
  const sesion = useUsuario();

  const [canal, setCanal] = useState<CanalVerificacion>('correo');
  const [contacto, setContacto] = useState('');
  const [password, setPassword] = useState('');
  const [desafio, setDesafio] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Ejecuta un paso del inicio de sesión y, si entrega una sesión, entra a la app. */
  async function intentar(paso: () => Promise<void>) {
    setError(null);
    setEnviando(true);
    try {
      await paso();
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  function entrar(datos: Parameters<typeof sesion.iniciarSesion>[0]) {
    sesion.iniciarSesion(datos);
    router.dismissTo('/usuario');
  }

  function enviarCredenciales() {
    const valor = contacto.trim();
    if (!valor || !password) {
      setError(
        `Escribe tu ${canal === 'correo' ? 'correo electrónico' : 'teléfono'} y tu contraseña.`,
      );
      return;
    }
    intentar(async () => {
      const respuesta = await iniciarSesion({
        password,
        ...(canal === 'correo' ? { correo: valor } : { telefono: valor }),
      });
      if ('requiere_2fa' in respuesta) {
        setDesafio(respuesta.desafio);
        setCodigo('');
        setPassword('');
      } else {
        entrar(respuesta);
      }
    });
  }

  function enviarCodigo() {
    if (!desafio) return;
    if (!/^\d{6}$/.test(codigo.trim())) {
      setError('El código debe tener 6 dígitos.');
      return;
    }
    intentar(async () => entrar(await verificarSegundoFactor(desafio, codigo.trim())));
  }

  if (desafio) {
    return (
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'Verificación en dos pasos' }} />
        <Text style={styles.titulo}>Ingresa tu código</Text>
        <Text style={styles.ayuda}>
          Abre tu aplicación autenticadora y escribe el código de 6 dígitos de VoyBus.
        </Text>
        <Campo
          etiqueta="Código de la aplicación autenticadora"
          value={codigo}
          onChangeText={setCodigo}
          placeholder="123456"
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />
        <CajaError mensaje={error} />
        <Boton
          titulo={enviando ? 'Verificando…' : 'Verificar e ingresar'}
          onPress={enviarCodigo}
          deshabilitado={enviando}
        />
        <Boton
          titulo="Volver"
          variante="secundario"
          deshabilitado={enviando}
          onPress={() => {
            setDesafio(null);
            setError(null);
          }}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Text style={styles.titulo}>Inicia sesión en VoyBus</Text>

      <Selector
        etiqueta="Ingresar con"
        valor={canal}
        onCambio={(c) => {
          setCanal(c);
          setContacto('');
        }}
        opciones={[
          { valor: 'correo', titulo: 'Correo electrónico' },
          { valor: 'telefono', titulo: 'Teléfono' },
        ]}
      />
      {canal === 'correo' ? (
        <Campo
          etiqueta="Correo electrónico"
          value={contacto}
          onChangeText={setContacto}
          placeholder="ana@example.com"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
      ) : (
        <Campo
          etiqueta="Teléfono"
          value={contacto}
          onChangeText={setContacto}
          placeholder="+56912345678"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
        />
      )}
      <Campo
        etiqueta="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
      />

      <CajaError mensaje={error} />
      <Boton
        titulo={enviando ? 'Ingresando…' : 'Iniciar sesión'}
        onPress={enviarCredenciales}
        deshabilitado={enviando}
      />
      <Boton
        titulo="Olvidé mi contraseña"
        variante="secundario"
        onPress={() => router.push('/recuperar')}
        deshabilitado={enviando}
      />

      <View style={styles.separador} />
      <Text style={styles.ayuda}>¿Aún no tienes cuenta?</Text>
      <Boton
        titulo="Crear cuenta de pasajero"
        variante="secundario"
        onPress={() => router.push('/registro')}
        deshabilitado={enviando}
      />
      <Boton
        titulo="Continuar como invitado"
        variante="secundario"
        onPress={() => intentar(async () => entrar(await entrarComoInvitado()))}
        deshabilitado={enviando}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  titulo: { fontSize: 20, fontWeight: '700', color: colors.text },
  ayuda: { fontSize: 14, color: colors.textMuted },
  separador: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
});
