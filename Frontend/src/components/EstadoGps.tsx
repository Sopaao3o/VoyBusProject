import { StyleSheet, Text, View } from 'react-native';

import { useGpsConductor, type EstadoGps as Estado } from '../session/GpsConductor';
import { colors } from '../theme/colors';

const dos = (n: number) => String(n).padStart(2, '0');
const conSegundos = (d: Date) =>
  `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;

const COLOR: Record<Estado, string> = {
  inactivo: colors.textMuted,
  buscando: colors.warning,
  activo: '#1F8A4C',
  sin_senal: colors.accent,
  sin_conexion: colors.accent,
};

/** VEH-01: cómo va el envío de la ubicación del viaje en curso (para el conductor). */
export function EstadoGps() {
  const { estado, modo, ultimoEnvio, avance } = useGpsConductor();
  if (estado === 'inactivo') return null;

  const ultima = ultimoEnvio ? `Última ubicación enviada a las ${conSegundos(ultimoEnvio)}.` : '';
  const simulado = modo === 'simulador' ? ' (simulada)' : '';
  const titulo: Record<Estado, string> = {
    inactivo: '',
    buscando: 'Buscando señal GPS…',
    activo: `Compartiendo ubicación${simulado}`,
    sin_senal: 'Sin señal GPS',
    sin_conexion: 'Sin conexión con el servidor',
  };
  const detalle: Record<Estado, string> = {
    inactivo: '',
    buscando: 'Mantén la app abierta. La ubicación se enviará apenas haya señal.',
    activo: ultimoEnvio ? `Actualizada a las ${conSegundos(ultimoEnvio)}.` : '',
    sin_senal: `${ultima} Se reanudará sola cuando vuelva la señal.`.trim(),
    sin_conexion: `${ultima} Se seguirá intentando cada pocos segundos.`.trim(),
  };

  return (
    <View
      style={[styles.caja, { borderColor: COLOR[estado] }]}
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.fila}>
        <View style={[styles.punto, { backgroundColor: COLOR[estado] }]} />
        <Text style={styles.titulo}>{titulo[estado]}</Text>
      </View>
      {detalle[estado] !== '' && <Text style={styles.texto}>{detalle[estado]}</Text>}
      {avance?.siguiente_paradero && (
        <Text style={styles.texto}>
          Siguiente paradero: {avance.siguiente_paradero.orden}. {avance.siguiente_paradero.nombre}{' '}
          ({avance.siguiente_paradero.codigo})
        </Text>
      )}
      {avance?.fuera_de_recorrido && (
        <Text style={styles.aviso}>Estás fuera del recorrido: el avance no se actualizará.</Text>
      )}
      {avance?.precision_insuficiente && (
        <Text style={styles.aviso}>
          El GPS está impreciso: el avance se actualizará al mejorar.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  punto: { width: 10, height: 10, borderRadius: 5 },
  titulo: { fontSize: 15, fontWeight: '700', color: colors.text },
  texto: { fontSize: 14, color: colors.textMuted },
  aviso: { fontSize: 14, color: colors.warning, fontWeight: '600' },
});
