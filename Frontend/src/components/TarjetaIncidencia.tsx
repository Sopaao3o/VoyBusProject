import { StyleSheet, Text, View } from 'react-native';

import type { Incidencia } from '../api/tipos';
import { colors } from '../theme/colors';
import { fechaHora } from '../utils/fechas';

/** Una incidencia informada por un conductor (VEH-03): conserva fecha, conductor y observación. */
export function TarjetaIncidencia({ incidencia }: { incidencia: Incidencia }) {
  return (
    <View style={styles.tarjeta}>
      <View style={styles.fila}>
        <Text style={styles.tipo}>
          {incidencia.tipo === 'vehiculo' ? 'Del vehículo' : 'Del recorrido'}
        </Text>
        <Text style={styles.fecha}>{fechaHora(incidencia.fecha)}</Text>
      </View>
      <Text style={styles.descripcion}>{incidencia.descripcion}</Text>
      <Text style={styles.dato}>
        {incidencia.conductor_nombre} · {incidencia.vehiculo_identificador} · Turno #
        {incidencia.turno_id}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  tipo: { fontSize: 13, fontWeight: '700', color: colors.accent },
  fecha: { fontSize: 13, color: colors.textMuted },
  descripcion: { fontSize: 15, color: colors.text },
  dato: { fontSize: 13, color: colors.textMuted },
});
