import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  cambiarEstadoVehiculo,
  finalizarTurno,
  finalizarViaje,
  iniciarTurno,
  iniciarViaje,
  justificarTurno,
  justificarViaje,
  miTurno,
  registrarIncidencia,
} from '../../../src/api/conductor';
import { textoDeError } from '../../../src/api/client';
import type { EstadoVehiculoBody, Puntualidad } from '../../../src/api/tipos';
import { Cargando, ErrorMensaje } from '../../../src/components/Estados';
import { InsigniaEstadoTurno } from '../../../src/components/EstadoTurno';
import { Boton } from '../../../src/components/Formulario';
import {
  PanelEstadoVehiculo,
  PanelIncidencia,
  PanelTexto,
} from '../../../src/components/PanelesConductor';
import { useApi } from '../../../src/hooks/useApi';
import { colors } from '../../../src/theme/colors';
import { fechaHora, horaLocal, rangoHoras } from '../../../src/utils/fechas';
import {
  ETIQUETA_ESTADO_VIAJE,
  etiquetaEstadoVehiculo,
  hayDesviacion,
  textoPuntualidad,
} from '../../../src/utils/textos';

type Panel =
  | null
  | 'iniciar-turno'
  | 'finalizar-turno'
  | 'estado'
  | 'incidencia'
  | { justificar: 'turno' | 'viaje'; id: number };

function Puntualidades({
  inicio,
  termino,
}: {
  inicio: Puntualidad | null;
  termino: Puntualidad | null;
}) {
  const lineas = [
    inicio && `Inicio: ${textoPuntualidad(inicio)}`,
    termino && `Término: ${textoPuntualidad(termino)}`,
  ].filter(Boolean) as string[];
  if (lineas.length === 0) return null;
  const mal = hayDesviacion(inicio) || hayDesviacion(termino);
  return (
    <>
      {lineas.map((l) => (
        <Text key={l} style={[styles.dato, mal && styles.desviacion]}>
          {l}
        </Text>
      ))}
    </>
  );
}

// VEH-03: un turno del conductor: iniciar/finalizar, viajes, estado del vehículo e incidencias.
export default function TurnoConductorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const turnoId = Number(id);
  const { datos: turno, cargando, error, recargar } = useApi(() => miTurno(turnoId), [turnoId]);
  const [panel, setPanel] = useState<Panel>(null);
  const [enviando, setEnviando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      recargar();
    }, [recargar]),
  );

  /** Ejecuta una acción, muestra el error si falla y vuelve a cargar el turno. */
  async function ejecutar(accion: () => Promise<unknown>, mensajeOk?: string) {
    setEnviando(true);
    try {
      await accion();
      setPanel(null);
      await recargar();
      if (mensajeOk) Alert.alert('Listo', mensajeOk);
    } catch (e) {
      Alert.alert('No se pudo completar la acción', textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  const confirmar = (titulo: string, mensaje: string, accion: () => void) =>
    Alert.alert(titulo, mensaje, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: accion },
    ]);

  if (cargando && !turno) return <Cargando />;
  if (error || !turno) {
    return <ErrorMensaje mensaje={error ?? 'No se encontró el turno.'} onReintentar={recargar} />;
  }

  const enCurso = turno.estado === 'en_curso';
  const hayViajeEnCurso = turno.viajes.some((v) => v.estado === 'en_curso');

  return (
    <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `Turno #${turno.id}` }} />

      <View style={styles.tarjeta}>
        <View style={styles.fila}>
          <Text style={styles.titulo}>{fechaHora(turno.inicio_planificado)}</Text>
          <InsigniaEstadoTurno estado={turno.estado} />
        </View>
        <Text style={styles.dato}>
          Horario: {rangoHoras(turno.inicio_planificado, turno.termino_planificado)}
        </Text>
        <Text style={styles.dato}>
          Vehículo: {turno.vehiculo.identificador} ({turno.vehiculo.patente}) ·{' '}
          {etiquetaEstadoVehiculo(turno.vehiculo.estado_operativo)}
        </Text>
        <Text style={styles.dato}>Margen de tolerancia: {turno.margen_tolerancia_min} min</Text>
        {turno.inicio_real && (
          <Text style={styles.dato}>Iniciado a las {horaLocal(turno.inicio_real)}</Text>
        )}
        {turno.termino_real && (
          <Text style={styles.dato}>Finalizado a las {horaLocal(turno.termino_real)}</Text>
        )}
        <Puntualidades inicio={turno.evaluacion.inicio} termino={turno.evaluacion.termino} />
        {turno.justificacion_atraso && (
          <Text style={styles.dato}>Justificación: {turno.justificacion_atraso}</Text>
        )}
      </View>

      {/* Acciones del turno */}
      {panel === 'iniciar-turno' && (
        <PanelEstadoVehiculo
          titulo="Estado del vehículo al recibirlo"
          textoBoton="Iniciar turno"
          enviando={enviando}
          onCancelar={() => setPanel(null)}
          onEnviar={(b: EstadoVehiculoBody) => ejecutar(() => iniciarTurno(turnoId, b))}
        />
      )}
      {panel === 'finalizar-turno' && (
        <PanelEstadoVehiculo
          titulo="Estado del vehículo al entregarlo"
          textoBoton="Finalizar turno"
          enviando={enviando}
          onCancelar={() => setPanel(null)}
          onEnviar={(b: EstadoVehiculoBody) => ejecutar(() => finalizarTurno(turnoId, b))}
        />
      )}
      {panel === 'estado' && (
        <PanelEstadoVehiculo
          titulo="Informar cambio de estado del vehículo"
          textoBoton="Guardar estado"
          enviando={enviando}
          onCancelar={() => setPanel(null)}
          onEnviar={(b: EstadoVehiculoBody) =>
            ejecutar(() => cambiarEstadoVehiculo(turnoId, b), 'Estado del vehículo registrado.')
          }
        />
      )}
      {panel === 'incidencia' && (
        <PanelIncidencia
          enviando={enviando}
          onCancelar={() => setPanel(null)}
          onEnviar={(tipo, descripcion) =>
            ejecutar(
              () => registrarIncidencia(turnoId, { tipo, descripcion }),
              'La incidencia quedó registrada para el administrador.',
            )
          }
        />
      )}
      {typeof panel === 'object' && panel !== null && (
        <PanelTexto
          titulo="Justificar atraso o término anticipado"
          etiqueta="Motivo"
          textoBoton="Guardar justificación"
          enviando={enviando}
          onCancelar={() => setPanel(null)}
          onEnviar={(texto) =>
            ejecutar(
              () =>
                panel.justificar === 'turno'
                  ? justificarTurno(panel.id, texto)
                  : justificarViaje(panel.id, texto),
              'Justificación guardada. Las horas originales no se modifican.',
            )
          }
        />
      )}

      {panel === null && (
        <View style={styles.acciones}>
          {turno.estado === 'programado' && (
            <Boton titulo="Iniciar turno" onPress={() => setPanel('iniciar-turno')} />
          )}
          {enCurso && (
            <>
              <Boton
                titulo="Informar estado del vehículo"
                variante="secundario"
                onPress={() => setPanel('estado')}
              />
              <Boton
                titulo="Registrar incidencia"
                variante="secundario"
                onPress={() => setPanel('incidencia')}
              />
              <Boton
                titulo="Finalizar turno"
                variante="peligro"
                deshabilitado={hayViajeEnCurso}
                onPress={() => setPanel('finalizar-turno')}
              />
              {hayViajeEnCurso && (
                <Text style={styles.dato}>
                  Finaliza el viaje en curso antes de cerrar el turno.
                </Text>
              )}
            </>
          )}
          {(hayDesviacion(turno.evaluacion.inicio) || hayDesviacion(turno.evaluacion.termino)) && (
            <Boton
              titulo="Justificar el turno"
              variante="secundario"
              onPress={() => setPanel({ justificar: 'turno', id: turno.id })}
            />
          )}
        </View>
      )}

      <Text style={styles.subtitulo}>Viajes</Text>
      {turno.viajes.map((v) => {
        const anterioresTerminados = turno.viajes
          .filter((o) => o.orden_en_turno < v.orden_en_turno)
          .every((o) => o.estado === 'finalizado');
        const puedeIniciar =
          enCurso && v.estado === 'programado' && !hayViajeEnCurso && anterioresTerminados;
        const conDesviacion =
          hayDesviacion(v.evaluacion.inicio) || hayDesviacion(v.evaluacion.termino);
        return (
          <View key={v.id} style={styles.viaje}>
            <View style={styles.fila}>
              <Text style={styles.viajeTitulo}>
                {v.orden_en_turno}. Línea {v.linea_codigo} ·{' '}
                {v.sentido === 'ida' ? 'Ida' : 'Vuelta'}
              </Text>
              <Text style={styles.estadoViaje}>{ETIQUETA_ESTADO_VIAJE[v.estado] ?? v.estado}</Text>
            </View>
            <Text style={styles.dato}>
              Planificado: {rangoHoras(v.inicio_planificado, v.termino_planificado)}
            </Text>
            {v.inicio_real && (
              <Text style={styles.dato}>Salió a las {horaLocal(v.inicio_real)}</Text>
            )}
            {v.termino_real && (
              <Text style={styles.dato}>Terminó a las {horaLocal(v.termino_real)}</Text>
            )}
            <Puntualidades inicio={v.evaluacion.inicio} termino={v.evaluacion.termino} />
            {v.justificacion_atraso && (
              <Text style={styles.dato}>Justificación: {v.justificacion_atraso}</Text>
            )}

            {puedeIniciar && (
              <Boton
                titulo="Iniciar viaje"
                onPress={() => ejecutar(() => iniciarViaje(v.id))}
                deshabilitado={enviando}
              />
            )}
            {v.estado === 'en_curso' && (
              <>
                <Boton
                  titulo="Ver solicitudes de parada"
                  variante="secundario"
                  onPress={() => router.push(`/conductor/viaje/${v.id}`)}
                />
                <Boton
                  titulo="Finalizar viaje"
                  variante="peligro"
                  deshabilitado={enviando}
                  onPress={() =>
                    confirmar(
                      'Finalizar viaje',
                      'Se cerrarán las solicitudes de parada abiertas.',
                      () => ejecutar(() => finalizarViaje(v.id)),
                    )
                  }
                />
              </>
            )}
            {conDesviacion && panel === null && (
              <Boton
                titulo="Justificar este viaje"
                variante="secundario"
                onPress={() => setPanel({ justificar: 'viaje', id: v.id })}
              />
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  tarjeta: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titulo: { fontSize: 18, fontWeight: '700', color: colors.text },
  dato: { color: colors.textMuted, fontSize: 14 },
  desviacion: { color: colors.accent, fontWeight: '600' },
  acciones: { gap: 10 },
  subtitulo: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 4 },
  viaje: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  viajeTitulo: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  estadoViaje: { fontSize: 12, fontWeight: '700', color: colors.primary },
});
