import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Aviso } from '../src/components/Etiquetas';
import { colors } from '../src/theme/colors';

// ACC-01 y RNF-14: términos de uso y política de privacidad que se aceptan al crear la cuenta.
// BORRADOR: el texto definitivo lo debe aprobar el cliente. Al cambiarlo, actualizar VERSION.
const VERSION = 'Borrador 0.1 · noviembre de 2026';

const SECCIONES: { titulo: string; parrafos: string[] }[] = [
  {
    titulo: '1. Qué es VoyBus',
    parrafos: [
      'VoyBus permite consultar líneas, recorridos y paraderos de Antofagasta, seguir las micros en el mapa y avisar al conductor dónde te quieres bajar.',
      'La consulta de líneas y paraderos no requiere cuenta. Para solicitar paradas necesitas una cuenta de pasajero o entrar como invitado.',
    ],
  },
  {
    titulo: '2. Datos que guardamos',
    parrafos: [
      'Al crear tu cuenta: nombre, correo o teléfono y tu contraseña, que se guarda cifrada y nadie puede leer.',
      'Al usar la app: las solicitudes de parada, el viaje al que te vinculas y tus paraderos favoritos.',
      'Si entras con Google, recibimos tu nombre, tu correo y la confirmación de que el correo está verificado. Nunca recibimos tu contraseña de Google.',
    ],
  },
  {
    titulo: '3. Para qué usamos tus datos',
    parrafos: [
      'Solo para que la app funcione: identificarte, avisar al conductor de tu parada y mostrarte tus favoritos e historial.',
      'No vendemos ni compartimos tus datos con terceros sin tu consentimiento.',
    ],
  },
  {
    titulo: '4. Ubicación',
    parrafos: [
      'La ubicación de tu teléfono se usa solo para centrar el mapa donde estás, y solo si lo permites. No se guarda.',
      'Los conductores comparten la ubicación del vehículo mientras realizan un viaje, para mostrar la micro en el mapa.',
    ],
  },
  {
    titulo: '5. Tus derechos',
    parrafos: [
      'Puedes consultar y modificar tus datos desde tu cuenta, y pedir que se eliminen.',
      'Puedes cerrar tu sesión en cualquier momento. Las cuentas de invitado son temporales.',
    ],
  },
  {
    titulo: '6. Uso correcto',
    parrafos: [
      'Las solicitudes de parada son avisos al conductor: no garantizan que el vehículo se detenga, porque debe respetar las normas de tránsito.',
      'Se pueden deshabilitar las cuentas que hagan un mal uso del servicio, por ejemplo con solicitudes falsas reiteradas.',
    ],
  },
];

export default function TerminosScreen() {
  return (
    <ScrollView contentContainerStyle={styles.contenido}>
      <Text style={styles.titulo}>Términos de uso y política de privacidad</Text>
      <Text style={styles.version}>{VERSION}</Text>
      <Aviso texto="Este texto es un borrador y está pendiente de aprobación por el cliente." />
      {SECCIONES.map((s) => (
        <View key={s.titulo} style={styles.seccion}>
          <Text style={styles.subtitulo}>{s.titulo}</Text>
          {s.parrafos.map((p) => (
            <Text key={p} style={styles.parrafo}>
              {p}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  titulo: { fontSize: 20, fontWeight: '700', color: colors.text },
  version: { fontSize: 13, color: colors.textMuted, marginTop: -8 },
  seccion: { gap: 6 },
  subtitulo: { fontSize: 16, fontWeight: '700', color: colors.text },
  parrafo: { fontSize: 15, lineHeight: 22, color: colors.text },
});
