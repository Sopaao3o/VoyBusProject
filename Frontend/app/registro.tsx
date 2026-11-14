import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { entrarComoInvitado, registrarPasajero, verificarContacto } from '../src/api/auth';
import { textoDeError } from '../src/api/client';
import type {
  CanalVerificacion,
  RegistroPasajeroBody,
  UsuarioSesion,
  VerificacionPendiente,
} from '../src/api/tipos';
import { Aviso } from '../src/components/Etiquetas';
import { Boton, Campo, Selector } from '../src/components/Formulario';
import { useUsuario } from '../src/session/UsuarioContext';
import { colors } from '../src/theme/colors';

interface Pendiente {
  canal: CanalVerificacion;
  contacto: string;
  usuario: UsuarioSesion;
  verificacion: VerificacionPendiente;
}

// ACC-01: registro de pasajero en dos pasos (datos → código de verificación).
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

  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [codigo, setCodigo] = useState('');
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
      setPendiente({
        canal,
        contacto,
        usuario: data.usuario,
        verificacion: data.verificacion,
      });
      // En desarrollo el backend devuelve el código porque no hay correo/SMS.
      setCodigo(data.verificacion.codigo_desarrollo ?? '');
      setPassword('');
      setConfirmacion('');
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  async function verificar() {
    if (!pendiente) return;
    if (!/^\d{6}$/.test(codigo.trim())) {
      Alert.alert('Revisa el código', 'El código de verificación debe tener 6 dígitos.');
      return;
    }

    setError(null);
    setEnviando(true);
    try {
      const sesion = await verificarContacto({
        codigo: codigo.trim(),
        ...(pendiente.canal === 'correo'
          ? { correo: pendiente.contacto }
          : { telefono: pendiente.contacto }),
      });
      usarSesion(sesion.usuario, sesion.token);
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

  function volverAlFormulario() {
    setPendiente(null);
    setCodigo('');
    setError(null);
  }

  if (pendiente) {
    const porCorreo = pendiente.canal === 'correo';
    return (
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'Verificar contacto' }} />

        <Text style={styles.titulo}>Revisa tu {porCorreo ? 'correo' : 'teléfono'}</Text>
        <Text style={styles.ayuda}>
          Enviamos un código de 6 dígitos a {pendiente.contacto}. Ingrésalo para habilitar tu
          cuenta.
        </Text>

        {pendiente.verificacion.codigo_desarrollo && (
          <Aviso
            texto={`Modo desarrollo: el código es ${pendiente.verificacion.codigo_desarrollo}.`}
          />
        )}

        <Campo
          etiqueta="Código de verificación"
          value={codigo}
          onChangeText={setCodigo}
          placeholder="123456"
          keyboardType="number-pad"
          maxLength={6}
          ayuda="Son 6 dígitos."
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Boton
          titulo={enviando ? 'Verificando…' : 'Verificar y crear cuenta'}
          onPress={verificar}
          deshabilitado={enviando}
        />
        <Boton
          titulo="Volver al formulario"
          variante="secundario"
          onPress={volverAlFormulario}
          deshabilitado={enviando}
        />
      </ScrollView>
    );
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

      <Campo
        etiqueta="Contraseña"
        value={password}
        onChangeText={setPassword}
        placeholder="Clave123!"
        secureTextEntry
        textContentType="newPassword"
        ayuda="De 8 a 15 caracteres, con mayúscula, minúscula, número y símbolo."
      />
      <Campo
        etiqueta="Repetir contraseña"
        value={confirmacion}
        onChangeText={setConfirmacion}
        placeholder="Clave123!"
        secureTextEntry
        textContentType="newPassword"
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

      {error && <Text style={styles.error}>{error}</Text>}

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
  error: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    color: colors.accent,
    fontWeight: '600',
  },
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
