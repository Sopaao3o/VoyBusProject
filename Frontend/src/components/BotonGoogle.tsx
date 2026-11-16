import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { canjearCodigoGoogle, prepararGoogle } from '../api/auth';
import { ApiError, textoDeError } from '../api/client';
import type { RespuestaInicioSesion } from '../api/tipos';
import { guardarPendiente, terminarPendiente } from '../session/googlePendiente';
import { colors } from '../theme/colors';

/**
 * ACC-01/ACC-02: "Continuar con Google". El backend prepara la dirección de Google y un código de
 * la app; el navegador del teléfono abre Google y, al volver, la app cambia su código por la sesión.
 * Funciona en Expo Go, en Android y en iPhone, sin servicios de pago.
 */
export function BotonGoogle({
  onResultado,
  onError,
  deshabilitado,
}: {
  onResultado: (respuesta: RespuestaInicioSesion) => void;
  onError: (mensaje: string) => void;
  deshabilitado?: boolean;
}) {
  const [esperando, setEsperando] = useState(false);

  async function continuar() {
    setEsperando(true);
    try {
      // Dirección para volver a la app: exp://… en Expo Go, voybus://… en la app instalada.
      const retorno = Linking.createURL('google');
      const { url, codigo } = await prepararGoogle(retorno);
      await guardarPendiente(codigo);
      await WebBrowser.openAuthSessionAsync(url, retorno);

      // Vuelva la app sola o cierre la persona la pestaña, la sesión se retira con el código
      // propio de la app. Si todavía no terminó en Google, es que cerró sin elegir cuenta.
      try {
        const respuesta = await canjearCodigoGoogle(codigo);
        await terminarPendiente();
        onResultado(respuesta);
      } catch (e) {
        await terminarPendiente();
        if (!(e instanceof ApiError && e.code === 'GOOGLE_PENDIENTE')) onError(textoDeError(e));
      }
    } catch (e) {
      onError(textoDeError(e));
    } finally {
      setEsperando(false);
    }
  }

  const inactivo = deshabilitado || esperando;
  return (
    <Pressable
      style={[styles.boton, inactivo && styles.inactivo]}
      onPress={continuar}
      disabled={inactivo}
      accessibilityRole="button"
      accessibilityLabel="Continuar con Google"
    >
      {esperando ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <Ionicons name="logo-google" size={20} color={colors.text} />
      )}
      <Text style={styles.texto}>Continuar con Google</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
  },
  inactivo: { opacity: 0.5 },
  texto: { fontSize: 16, fontWeight: '600', color: colors.text },
});
