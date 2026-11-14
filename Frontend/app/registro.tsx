import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { entrarComoInvitado, registrarPasajero } from '../src/api/auth';
import { textoDeError } from '../src/api/client';
import type { CanalVerificacion, RegistroPasajeroBody, UsuarioSesion } from '../src/api/tipos';
import { CajaError } from '../src/components/Estados';
import { Boton, Campo, CampoPassword, Selector } from '../src/components/Formulario';
import { ReglasPassword } from '../src/components/ReglasPassword';
import { useUsuario } from '../src/session/UsuarioContext';
import { colors } from '../src/theme/colors';

// ACC-01: registro de pasajero. Tras enviar los datos, sigue la pantalla del código (/verificar).
// La verificación en dos pasos se activa después, desde la pestaña Cuenta.
export default function RegistroScreen() {
  const router = useRouter();
  const { iniciarSesion } = useUsuario();

  const [canal, setCanal] = useState<CanalVerificacion>('correo');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [aceptaTerminos, setAceptaTerminos] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Revisa lo mismo que el servidor, para avisar sin esperar la respuesta. */
  function problemas(): string[] {
    const lista: string[] = [];
    const contacto = canal === 'correo' ? correo.trim() : telefono.trim();

    if (nombre.trim().length < 2) lista.push('El nombre debe tener al menos 2 caracteres.');
    if (nombre.trim().length > 80) lista.push('El nombre admite hasta 80 caracteres.');
    if (!contacto) {
      lista.push(canal === 'correo' ? 'Escribe tu correo electrónico.' : 'Escribe tu teléfono.');
    } else if (canal === 'correo' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto)) {
      lista.push('El correo electrónico no es válido.');
    } else if (canal === 'telefono' && !/^\d{8,15}$/.test(contacto.replace(/\D/g, ''))) {
      lista.push('El teléfono debe tener entre 8 y 15 dígitos.');
    }

    if (!password) {
      lista.push('La contraseña es obligatoria.');
    } else {
      if (password.length < 8 || password.length > 15) {
        lista.push('La contraseña debe tener entre 8 y 15 caracteres.');
      }
      if (!/\p{Lu}/u.test(password)) {
        lista.push('La contraseña debe incluir al menos una letra mayúscula.');
      }
      if (!/\p{Ll}/u.test(password)) {
        lista.push('La contraseña debe incluir al menos una letra minúscula.');
      }
      if (!/\d/.test(password)) lista.push('La contraseña debe incluir al menos un número.');
      if (!/[^\p{L}\p{N}\s]/u.test(password)) {
        lista.push('La contraseña debe incluir al menos un símbolo.');
      }
    }
    if (!confirmacion) {
      lista.push('Debes repetir la contraseña.');
    } else if (password !== confirmacion) {
      lista.push('La confirmación no coincide con la contraseña.');
    }
    if (!aceptaTerminos) {
      lista.push('Debes aceptar los términos de privacidad para crear la cuenta.');
    }
    return lista;
  }

  function usarSesion(usuario: UsuarioSesion, token: string) {
    iniciarSesion({ usuario, token });
    router.dismissTo('/usuario');
  }

  async function registrarse() {
    const faltan = problemas();
    if (faltan.length > 0) {
      Alert.alert('Revisa el formulario', faltan.join('\n'));
      return;
    }

    const contacto = canal === 'correo' ? correo.trim() : telefono.trim();
    const cuerpo: RegistroPasajeroBody = {
      nombre: nombre.trim(),
      password,
      confirmacion,
      acepta_terminos: true,
      ...(canal === 'correo' ? { correo: contacto } : { telefono: contacto }),
    };

    setError(null);
    setEnviando(true);
    try {
      const data = await registrarPasajero(cuerpo);
      setPassword('');
      setConfirmacion('');
      // El segundo paso (código de verificación) tiene su propia pantalla.
      // En desarrollo el backend devuelve el código porque no hay correo/SMS.
      router.push({
        pathname: '/verificar',
        params: { canal, contacto, codigo: data.verificacion.codigo_desarrollo ?? '' },
      });
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  async function entrarInvitado() {
    setError(null);
    setEnviando(true);
    try {
      const sesion = await entrarComoInvitado();
      usarSesion(sesion.usuario, sesion.token);
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Crear cuenta' }} />

      <Text style={styles.titulo}>Crea tu cuenta de pasajero</Text>
      <Text style={styles.ayuda}>
        Con tu cuenta puedes solicitar paradas y viajar con VoyBus. Es gratis y toma menos de un
        minuto.
      </Text>

      <Selector
        etiqueta="Verificar con"
        valor={canal}
        onCambio={setCanal}
        opciones={[
          { valor: 'correo', titulo: 'Correo electrónico' },
          { valor: 'telefono', titulo: 'Teléfono' },
        ]}
      />

      <Campo
        etiqueta="Nombre"
        value={nombre}
        onChangeText={setNombre}
        placeholder="Ana Pérez"
        autoCapitalize="words"
        maxLength={80}
      />

      {canal === 'correo' ? (
        <Campo
          etiqueta="Correo electrónico"
          value={correo}
          onChangeText={setCorreo}
          placeholder="ana@example.com"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
      ) : (
        <Campo
          etiqueta="Teléfono"
          value={telefono}
          onChangeText={setTelefono}
          placeholder="+56912345678"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
        />
      )}

      <CampoPassword
        etiqueta="Contraseña"
        value={password}
        onChangeText={setPassword}
        textContentType="newPassword"
        maxLength={15}
      />
      <ReglasPassword tipo="registro" password={password} />
      <CampoPassword
        etiqueta="Repetir contraseña"
        value={confirmacion}
        onChangeText={setConfirmacion}
        textContentType="newPassword"
        maxLength={15}
      />

      <Pressable
        style={styles.terminos}
        onPress={() => setAceptaTerminos((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: aceptaTerminos }}
      >
        <Ionicons
          name={aceptaTerminos ? 'checkbox' : 'square-outline'}
          size={24}
          color={aceptaTerminos ? colors.primary : colors.textMuted}
        />
        <Text style={styles.terminosTexto}>
          Acepto la política de privacidad y los términos de uso de VoyBus.
        </Text>
      </Pressable>

      <CajaError mensaje={error} />

      <Boton
        titulo={enviando ? 'Creando cuenta…' : 'Crear cuenta'}
        onPress={registrarse}
        deshabilitado={enviando}
      />

      <View style={styles.separador} />

      <Text style={styles.invitadoTitulo}>¿Solo quieres mirar?</Text>
      <Text style={styles.ayuda}>
        Entra como invitado. Podrás ver líneas y paraderos, pero la cuenta es temporal.
      </Text>
      <Boton
        titulo={enviando ? 'Entrando…' : 'Continuar como invitado'}
        variante="secundario"
        onPress={entrarInvitado}
        deshabilitado={enviando}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  titulo: { fontSize: 20, fontWeight: '700', color: colors.text },
  ayuda: { fontSize: 14, color: colors.textMuted },
  terminos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  terminosTexto: { flex: 1, fontSize: 14, color: colors.text },
  separador: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
  invitadoTitulo: { fontSize: 16, fontWeight: '700', color: colors.text },
});
