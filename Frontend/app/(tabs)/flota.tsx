import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listarIncidencias, listarVehiculos } from '../../src/api/admin';
import { Cargando, ErrorMensaje } from '../../src/components/Estados';
import { TarjetaIncidencia } from '../../src/components/TarjetaIncidencia';
import { useApi } from '../../src/hooks/useApi';
import { useUsuario } from '../../src/session/UsuarioContext';
import { colors } from '../../src/theme/colors';
import { etiquetaEstadoVehiculo } from '../../src/utils/textos';

type Vista = 'incidencias' | 'vehiculos';

// VEH-03 (vista del administrador): incidencias informadas por los conductores y estado de
// cada vehículo. Desde un vehículo se llega a su historial de cambios de estado.
export default function FlotaScreen() {
  const router = useRouter();
  const { usuario } = useUsuario();
  const [vista, setVista] = useState<Vista>('incidencias');
  const incidencias = useApi(() => listarIncidencias(), [usuario?.id ?? null]);
  const vehiculos = useApi(listarVehiculos, [usuario?.id ?? null]);
  const actual = vista === 'incidencias' ? incidencias : vehiculos;

  const { recargar: recargarIncidencias } = incidencias;
  const { recargar: recargarVehiculos } = vehiculos;
  const recargar = useCallback(() => {
    recargarIncidencias();
    recargarVehiculos();
  }, [recargarIncidencias, recargarVehiculos]);

  useFocusEffect(recargar);

  if (usuario?.rol !== 'administrador') {
    return <ErrorMensaje mensaje="Esta sección es solo para el administrador." />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.contenido}
      refreshControl={<RefreshControl refreshing={actual.cargando} onRefresh={recargar} />}
    >
      <View style={styles.selector} accessibilityRole="tablist">
        {(
          [
            { valor: 'incidencias', titulo: 'Incidencias' },
            { valor: 'vehiculos', titulo: 'Vehículos' },
          ] as { valor: Vista; titulo: string }[]
        ).map((o) => {
          const activa = o.valor === vista;
          return (
            <Pressable
              key={o.valor}
              style={[styles.opcion, activa && styles.opcionActiva]}
              onPress={() => setVista(o.valor)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activa }}
            >
              <Text style={[styles.opcionTexto, activa && styles.opcionTextoActivo]}>
                {o.titulo}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {actual.cargando && !actual.datos ? (
        <Cargando />
      ) : actual.error ? (
        <ErrorMensaje mensaje={actual.error} onReintentar={recargar} />
      ) : vista === 'incidencias' ? (
        incidencias.datos?.length === 0 ? (
          <Text style={styles.vacio}>Los conductores no han registrado incidencias.</Text>
        ) : (
          incidencias.datos?.map((i) => <TarjetaIncidencia key={i.id} incidencia={i} />)
        )
      ) : (
        vehiculos.datos?.map((v) => (
          <Pressable
            key={v.id}
            style={styles.tarjeta}
            onPress={() => router.push(`/vehiculo/${v.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Vehículo ${v.identificador}, ${etiquetaEstadoVehiculo(v.estado_operativo)}`}
          >
            <View style={styles.fila}>
              <Text style={styles.titulo}>{v.identificador}</Text>
              <Text style={[styles.estado, v.estado_operativo !== 'operativo' && styles.alerta]}>
                {etiquetaEstadoVehiculo(v.estado_operativo)}
              </Text>
            </View>
            <Text style={styles.dato}>
              Patente {v.patente} · {v.capacidad} pasajeros
            </Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 12 },
  selector: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  opcion: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  opcionActiva: { backgroundColor: colors.primary },
  opcionTexto: { fontSize: 15, fontWeight: '600', color: colors.text },
  opcionTextoActivo: { color: colors.surface },
  vacio: { color: colors.textMuted, textAlign: 'center', marginTop: 12 },
  tarjeta: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  titulo: { fontSize: 16, fontWeight: '700', color: colors.text },
  estado: { fontSize: 13, fontWeight: '700', color: colors.primary },
  alerta: { color: colors.accent },
  dato: { fontSize: 14, color: colors.textMuted },
});
