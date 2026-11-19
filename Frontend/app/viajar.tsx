import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { vehiculosEnCirculacion } from '../src/api/circulacion';
import { textoDeError } from '../src/api/client';
import type { MicroParaVincular } from '../src/api/tipos';
import { consultarMicro, miVinculacion, vincularme } from '../src/api/vinculacion';
import { CajaError } from '../src/components/Estados';
import { InsigniaLinea } from '../src/components/Etiquetas';
import { Boton } from '../src/components/Formulario';
import { useApi } from '../src/hooks/useApi';
import { colors } from '../src/theme/colors';

// VIA-01: el pasajero (registrado o invitado) escanea el QR de la micro o escribe su código,
// ve la micro, la línea y el sentido, y confirma. Después elige dónde bajarse (VIA-02).
export default function SubirScreen() {
  const router = useRouter();
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [codigo, setCodigo] = useState('');
  const [micro, setMicro] = useState<MicroParaVincular | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  // Evita leer el mismo QR varias veces mientras se consulta.
  const leyendo = useRef(false);

  // Si ya va en una micro, se abre directamente su viaje.
  useFocusEffect(
    useCallback(() => {
      let vigente = true;
      miVinculacion()
        .then((v) => {
          if (vigente && v) router.replace(`/viaje/${v.viaje_id}`);
        })
        .catch(() => undefined);
      return () => {
        vigente = false;
      };
    }, [router]),
  );

  // Solo en desarrollo: códigos de las micros en ruta, para probar sin cámara (emulador).
  const deDesarrollo = useApi(() => (__DEV__ ? vehiculosEnCirculacion() : Promise.resolve([])), []);

  async function buscar(texto: string) {
    const limpio = texto.trim();
    if (!limpio) {
      setError('Escribe el código que aparece en la micro (por ejemplo, BUS-01).');
      return;
    }
    setBuscando(true);
    setError(null);
    setMicro(null);
    try {
      setMicro(await consultarMicro(limpio));
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setBuscando(false);
      leyendo.current = false;
    }
  }

  function alLeerQr(datos: string) {
    if (leyendo.current || micro) return;
    leyendo.current = true;
    setCodigo(datos.split('/').pop() ?? datos);
    void buscar(datos);
  }

  async function confirmar() {
    if (!micro) return;
    setConfirmando(true);
    setError(null);
    try {
      const v = await vincularme(micro.vehiculo.identificador);
      router.replace(`/viaje/${v.viaje_id}`);
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.pantalla}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Subir a una micro' }} />
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        {/* Escanear el QR */}
        <View style={styles.camara}>
          {permiso?.granted ? (
            micro ? (
              <View style={styles.camaraPausa}>
                <Ionicons name="checkmark-circle" size={48} color={colors.surface} />
                <Text style={styles.camaraTexto}>Código leído</Text>
              </View>
            ) : (
              <>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => alLeerQr(data)}
                />
                <View style={styles.marco} pointerEvents="none" />
              </>
            )
          ) : (
            <View style={styles.camaraPausa}>
              <Ionicons name="qr-code-outline" size={48} color={colors.surface} />
              <Text style={styles.camaraTexto}>
                Escanea el código QR que está dentro de la micro.
              </Text>
              <Pressable style={styles.permiso} onPress={pedirPermiso} accessibilityRole="button">
                <Text style={styles.permisoTexto}>Usar la cámara</Text>
              </Pressable>
            </View>
          )}
        </View>
        {permiso?.granted && !micro && (
          <Text style={styles.ayuda}>
            Apunta al QR: está junto a la puerta o tras el conductor.
          </Text>
        )}

        {/* O escribir el código */}
        <Text style={styles.etiqueta}>O escribe el código de la micro</Text>
        <View style={styles.filaCodigo}>
          <TextInput
            style={styles.input}
            value={codigo}
            onChangeText={(t) => {
              setCodigo(t);
              setMicro(null);
            }}
            placeholder="BUS-01"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => buscar(codigo)}
            accessibilityLabel="Código de la micro"
          />
          <Pressable
            style={[styles.buscar, buscando && styles.deshabilitado]}
            onPress={() => buscar(codigo)}
            disabled={buscando}
            accessibilityRole="button"
            accessibilityLabel="Buscar la micro"
          >
            {buscando ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Ionicons name="search" size={22} color={colors.surface} />
            )}
          </Pressable>
        </View>

        {__DEV__ && (deDesarrollo.datos ?? []).length > 0 && !micro && (
          <View style={styles.desarrollo}>
            <Text style={styles.desarrolloTitulo}>Micros en ruta (solo desarrollo)</Text>
            <View style={styles.chips}>
              {(deDesarrollo.datos ?? []).map((v) => (
                <Pressable
                  key={v.viaje_id}
                  style={styles.chip}
                  onPress={() => {
                    setCodigo(v.vehiculo.identificador);
                    void buscar(v.vehiculo.identificador);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.chipTexto}>
                    {v.vehiculo.identificador} · {v.linea.codigo}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <CajaError mensaje={error} />

        {/* Confirmar */}
        {micro && (
          <View style={styles.confirmacion}>
            <View style={styles.filaMicro}>
              <InsigniaLinea linea={micro.linea} />
              <View style={styles.textos}>
                <Text style={styles.titulo}>
                  Línea {micro.linea.codigo} ·{' '}
                  {micro.recorrido.sentido === 'ida' ? 'Ida' : 'Vuelta'}
                </Text>
                <Text style={styles.dato}>
                  {micro.vehiculo.identificador}
                  {micro.destino ? ` · hacia ${micro.destino}` : ''}
                </Text>
              </View>
            </View>
            <Text style={styles.dato}>
              ¿Es la micro en la que vas? Confírmalo para elegir dónde bajarte.
            </Text>
            <Boton
              titulo={confirmando ? 'Confirmando…' : 'Sí, voy en esta micro'}
              onPress={confirmar}
              deshabilitado={confirmando}
            />
            <Boton
              titulo="No, es otra"
              variante="secundario"
              onPress={() => {
                setMicro(null);
                setCodigo('');
              }}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  camara: {
    height: 280,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#1C232D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  marco: {
    width: 190,
    height: 190,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: colors.surface,
  },
  camaraPausa: { alignItems: 'center', gap: 10, padding: 20 },
  camaraTexto: { color: colors.surface, fontSize: 15, textAlign: 'center' },
  permiso: {
    marginTop: 4,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  permisoTexto: { color: colors.text, fontWeight: '700', fontSize: 15 },
  ayuda: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  etiqueta: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 4 },
  filaCodigo: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 1,
    color: colors.text,
  },
  buscar: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deshabilitado: { opacity: 0.6 },
  desarrollo: { backgroundColor: colors.warningBg, borderRadius: 12, padding: 12, gap: 8 },
  desarrolloTitulo: { fontSize: 13, fontWeight: '700', color: colors.warning },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.warning,
    justifyContent: 'center',
  },
  chipTexto: { color: colors.warning, fontWeight: '700', fontSize: 13 },
  confirmacion: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  filaMicro: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textos: { flex: 1, gap: 2 },
  titulo: { fontSize: 18, fontWeight: '700', color: colors.text },
  dato: { fontSize: 14, color: colors.textMuted },
});
