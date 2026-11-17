import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { reenviarCodigo, verificarContacto } from '../src/api/auth';
import { textoDeError } from '../src/api/client';
import { CajaError } from '../src/components/Estados';
import { Aviso } from '../src/components/Etiquetas';
import { Boton, Campo } from '../src/components/Formulario';
import { useUsuario } from '../src/session/UsuarioContext';
import { colors } from '../src/theme/colors';

// ACC-01: confirmar el código enviado al correo o teléfono. Se llega aquí después de registrarse
// o desde el inicio de sesión, cuando la cuenta todavía está sin verificar.
export default function VerificarScreen() {
  const router = useRouter();
  const { iniciarSesion } = useUsuario();
  const parametros = useLocalSearchParams<{ canal: string; contacto: string; codigo?: string }>();
  const porCorreo = parametros.canal !== 'telefono';
  const contacto = parametros.contacto ?? '';
  const cuerpoContacto = porCorreo ? { correo: contacto } : { telefono: contacto };

  // En desarrollo el backend devuelve el código porque no hay servicio de correo/SMS.
  const [codigoDesarrollo, setCodigoDesarrollo] = useState(parametros.codigo ?? '');
  const [codigo, setCodigo] = useState(parametros.codigo ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function verificar() {
    if (!/^\d{6}$/.test(codigo.trim())) {
      setError('El código de verificación debe tener 6 dígitos.');
      return;
    }
    setError(null);
    setAviso(null);
    setEnviando(true);
    try {
      const sesion = await verificarContacto({ codigo: codigo.trim(), ...cuerpoContacto });
      iniciarSesion(sesion);
      router.dismissTo('/usuario');
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  async function reenviar() {
    setError(null);
    setAviso(null);
    setEnviando(true);
    try {
      const respuesta = await reenviarCodigo(cuerpoContacto);
      setAviso(`${respuesta.mensaje}.`);
      setCodigoDesarrollo(respuesta.codigo_desarrollo ?? '');
      setCodigo(respuesta.codigo_desarrollo ?? '');
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Text style={styles.titulo}>Revisa tu {porCorreo ? 'correo' : 'teléfono'}</Text>
      <Text style={styles.ayuda}>
        Enviamos un código de 6 dígitos a {contacto}. Ingrésalo para habilitar tu cuenta. El código
        vence a los 15 minutos.
      </Text>

      {codigoDesarrollo !== '' && (
        <Aviso texto={`Modo desarrollo: el código es ${codigoDesarrollo}.`} />
      )}

      <Campo
        etiqueta="Código de verificación"
        value={codigo}
        onChangeText={setCodigo}
        placeholder="123456"
        keyboardType="number-pad"
        maxLength={6}
      />

      {aviso && <Text style={styles.aviso}>{aviso}</Text>}
      <CajaError mensaje={error} />

      <Boton
        titulo={enviando ? 'Verificando…' : 'Verificar cuenta'}
        onPress={verificar}
        deshabilitado={enviando}
      />
      <Boton
        titulo="Reenviar código"
        variante="secundario"
        onPress={reenviar}
        deshabilitado={enviando}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  titulo: { fontSize: 20, fontWeight: '700', color: colors.text },
  ayuda: { fontSize: 14, color: colors.textMuted },
  aviso: { fontSize: 14, color: colors.primary, fontWeight: '600' },
});
