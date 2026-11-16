import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { listarIncidencias, obtenerTurno } from '../../src/api/admin';
import { Cargando, ErrorMensaje } from '../../src/components/Estados';
import { InsigniaEstadoTurno } from '../../src/components/EstadoTurno';
import { Boton } from '../../src/components/Formulario';
import { TarjetaIncidencia } from '../../src/components/TarjetaIncidencia';
import { useApi } from '../../src/hooks/useApi';
import { colors } from '../../src/theme/colors';
import { fechaHora, rangoHoras } from '../../src/utils/fechas';

// ADM-03: detalle de un turno con sus viajes en orden.
export default function TurnoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { datos: turno, cargando, error, recargar } = useApi(() => obtenerTurno(Number(id)), [id]);
  // VEH-03: lo que el conductor informó durante este turno.
  const incidencias = useApi(() => listarIncidencias({ turnoId: Number(id) }), [id]);
  const { recargar: recargarIncidencias } = incidencias;

  useFocusEffect(
    useCallback(() => {
      recargar();
      recargarIncidencias();
    }, [recargar, recargarIncidencias]),
  );

  if (cargando && !turno) return <Cargando />;
  if (error || !turno) {
    return <ErrorMensaje mensaje={error ?? 'No se encontró el turno.'} onReintentar={recargar} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.contenido}>
      <Stack.Screen options={{ title: `Turno #${turno.id}` }} />
      <View style={styles.tarjeta}>
        <View style={styles.fila}>
          <Text style={styles.titulo}>{turno.conductor_nombre}</Text>
          <InsigniaEstadoTurno estado={turno.estado} />
        </View>
        <Text style={styles.dato}>
          Vehículo: {turno.vehiculo.identificador} ({turno.vehiculo.patente})
        </Text>
        <Text style={styles.dato}>Inicio: {fechaHora(turno.inicio_planificado)}</Text>
        <Text style={styles.dato}>Término: {fechaHora(turno.termino_planificado)}</Text>
        <Text style={styles.dato}>Margen de tolerancia: {turno.margen_tolerancia_min} min</Text>
      </View>

      <Text style={styles.subtitulo}>Viajes</Text>
      {turno.viajes.map((v) => (
        <View key={v.id} style={styles.viaje}>
          <Text style={styles.orden}>{v.orden_en_turno}</Text>
          <View style={styles.viajeTexto}>
            <Text style={styles.viajeTitulo}>
              Línea {v.linea_codigo} · {v.sentido === 'ida' ? 'Ida' : 'Vuelta'}
            </Text>
            <Text style={styles.dato}>
              {rangoHoras(v.inicio_planificado, v.termino_planificado)} · {v.estado}
            </Text>
          </View>
        </View>
      ))}

      {incidencias.datos && incidencias.datos.length > 0 && (
        <>
          <Text style={styles.subtitulo}>Incidencias informadas</Text>
          {incidencias.datos.map((i) => (
            <TarjetaIncidencia key={i.id} incidencia={i} />
          ))}
        </>
      )}

      {turno.estado === 'programado' ? (
        <Boton
          titulo="Modificar turno"
          onPress={() => router.push({ pathname: '/turno/formulario', params: { id: turno.id } })}
        />
      ) : (
        <Text style={styles.dato}>Un turno que ya empezó no se puede modificar.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 12 },
  tarjeta: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titulo: { fontSize: 18, fontWeight: '700', color: colors.text },
  dato: { color: colors.textMuted, fontSize: 14 },
  subtitulo: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 4 },
  viaje: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  orden: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.secondary,
    color: colors.onSecondary,
    textAlign: 'center',
    lineHeight: 28,
    fontWeight: '700',
    overflow: 'hidden',
  },
  viajeTexto: { flex: 1 },
  viajeTitulo: { fontSize: 15, fontWeight: '600', color: colors.text },
});
