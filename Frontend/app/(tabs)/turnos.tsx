import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listarTurnos } from '../../src/api/admin';
import { Cargando, ErrorMensaje } from '../../src/components/Estados';
import { InsigniaEstadoTurno } from '../../src/components/EstadoTurno';
import { Boton, Campo } from '../../src/components/Formulario';
import { MargenConfig } from '../../src/components/MargenConfig';
import { useApi } from '../../src/hooks/useApi';
import { useUsuario } from '../../src/session/UsuarioContext';
import { colors } from '../../src/theme/colors';
import { fechaHora, fechaValida, rangoHoras } from '../../src/utils/fechas';

// ADM-03: gestión de turnos (solo administrador).
export default function TurnosScreen() {
  const router = useRouter();
  const { usuario } = useUsuario();
  const [fecha, setFecha] = useState('');
  const filtro = fechaValida(fecha) ? fecha : '';
  const { datos, cargando, error, recargar } = useApi(
    () => listarTurnos(filtro),
    [filtro, usuario?.id ?? null],
  );

  // Al volver desde crear/editar, la lista se actualiza sola.
  useFocusEffect(
    useCallback(() => {
      recargar();
    }, [recargar]),
  );

  if (usuario?.rol !== 'administrador') {
    return <ErrorMensaje mensaje="Esta sección es solo para el administrador." />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.contenido}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} />}
    >
      <Boton titulo="Nuevo turno" onPress={() => router.push('/turno/formulario')} />
      <MargenConfig />
      <Campo
        etiqueta="Filtrar por fecha"
        value={fecha}
        onChangeText={setFecha}
        placeholder="AAAA-MM-DD (vacío = todos)"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />

      {cargando && !datos ? (
        <Cargando />
      ) : error ? (
        <ErrorMensaje mensaje={error} onReintentar={recargar} />
      ) : datos && datos.length === 0 ? (
        <Text style={styles.vacio}>No hay turnos para mostrar.</Text>
      ) : (
        datos?.map((t) => (
          <Pressable
            key={t.id}
            style={styles.tarjeta}
            onPress={() => router.push(`/turno/${t.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Turno de ${t.conductor_nombre}, ${t.estado}`}
          >
            <View style={styles.fila}>
              <Text style={styles.conductor}>{t.conductor_nombre}</Text>
              <InsigniaEstadoTurno estado={t.estado} />
            </View>
            <Text style={styles.detalle}>
              {t.vehiculo_identificador} · {fechaHora(t.inicio_planificado)}
            </Text>
            <Text style={styles.detalle}>
              {rangoHoras(t.inicio_planificado, t.termino_planificado)} · margen{' '}
              {t.margen_tolerancia_min} min
            </Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 12 },
  vacio: { color: colors.textMuted, textAlign: 'center', marginTop: 12 },
  tarjeta: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  conductor: { fontSize: 16, fontWeight: '700', color: colors.text },
  detalle: { color: colors.textMuted, fontSize: 14 },
});
