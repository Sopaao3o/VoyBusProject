import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { textoDeError } from '../../src/api/client';
import {
  cargarRedAntofagasta,
  estadoRed,
  generarRedAntofagasta,
  volverRedPrueba,
} from '../../src/api/redAdmin';
import type { ResultadoCambioRed } from '../../src/api/tipos';
import { Cargando, ErrorMensaje } from '../../src/components/Estados';
import { Boton } from '../../src/components/Formulario';
import { useApi } from '../../src/hooks/useApi';
import { colors } from '../../src/theme/colors';
import { fechaHora } from '../../src/utils/fechas';

const CONSULTA_MS = 2000;

const FASES = {
  descargando: 'Descargando calles',
  trazando: 'Trazando líneas',
  aplicando: 'Guardando',
};

function resumen(r: ResultadoCambioRed) {
  const partes = [
    r.lineas_creadas && `${r.lineas_creadas} líneas nuevas`,
    r.lineas_actualizadas && `${r.lineas_actualizadas} actualizadas`,
    r.lineas_desactivadas && `${r.lineas_desactivadas} desactivadas`,
    r.paraderos_creados && `${r.paraderos_creados} paraderos nuevos`,
    r.paraderos_desactivados && `${r.paraderos_desactivados} paraderos desactivados`,
  ].filter(Boolean);
  return partes.length ? `${partes.join(', ')}.` : 'No hubo cambios.';
}

// ADM-01: el administrador cambia toda la red. "Generar" hace que el servidor descargue las
// calles de Antofagasta (OpenStreetMap), trace las líneas reales por ellas (OSRM) y las cargue;
// tarda un par de minutos y aquí se ve el avance. También se puede cargar la red ya generada
// o volver a la red de prueba. Nada se borra: lo que no es de la red elegida se desactiva.
export default function RedAntofagastaScreen() {
  const { datos, cargando, error, recargar } = useApi(estadoRed);
  const [ocupado, setOcupado] = useState(false);
  const enCurso = datos?.tarea.estado === 'en_curso';

  // Mientras se genera, el avance se consulta cada 2 segundos.
  useEffect(() => {
    if (!enCurso) return undefined;
    const t = setInterval(recargar, CONSULTA_MS);
    return () => clearInterval(t);
  }, [enCurso, recargar]);

  if (cargando && !datos) return <Cargando />;
  if (!datos)
    return (
      <ErrorMensaje mensaje={error ?? 'No se pudo consultar la red.'} onReintentar={recargar} />
    );

  const { tarea, archivo, red_actual: actual } = datos;

  const confirmar = (
    titulo: string,
    mensaje: string,
    textoBoton: string,
    accion: () => Promise<void>,
  ) =>
    Alert.alert(titulo, mensaje, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: textoBoton,
        onPress: async () => {
          setOcupado(true);
          try {
            await accion();
          } catch (e) {
            Alert.alert('No se pudo completar', textoDeError(e));
          } finally {
            setOcupado(false);
            await recargar();
          }
        },
      },
    ]);

  const generar = (descargar: boolean) =>
    confirmar(
      'Generar la red de Antofagasta',
      `El servidor ${descargar ? 'descargará otra vez las calles de OpenStreetMap y ' : ''}trazará las líneas reales por las calles. Tarda un par de minutos y necesita internet. Al terminar, las líneas y paraderos de prueba quedarán desactivados (no se borran).`,
      'Generar',
      async () => {
        await generarRedAntofagasta(descargar);
      },
    );

  const cargar = () =>
    confirmar(
      'Cargar la red de Antofagasta',
      `Se cargarán las líneas ${archivo?.lineas.join(', ')} con ${archivo?.total_paraderos} paraderos. Lo que no es de esta red quedará desactivado (no se borra).`,
      'Cargar',
      async () => {
        const r = await cargarRedAntofagasta();
        Alert.alert('Red de Antofagasta cargada', resumen(r.resultado));
      },
    );

  const prueba = () =>
    confirmar(
      'Volver a la red de prueba',
      'Se activarán otra vez las líneas y paraderos de prueba, y los de Antofagasta quedarán desactivados (no se borran).',
      'Volver',
      async () => {
        const r = await volverRedPrueba();
        Alert.alert('Red de prueba activa', resumen(r.resultado));
      },
    );

  const progreso = tarea.total ? (tarea.hechos ?? 0) / tarea.total : 0;

  return (
    <ScrollView contentContainerStyle={styles.contenido}>
      <View style={styles.tarjeta}>
        <Ionicons
          name={actual === 'antofagasta' ? 'checkmark-circle' : 'flask'}
          size={28}
          color={actual === 'antofagasta' ? '#1F8A4C' : colors.warning}
        />
        <View style={styles.textos}>
          <Text style={styles.etiqueta}>RED ACTIVA</Text>
          <Text style={styles.titulo}>
            {actual === 'antofagasta' ? 'Antofagasta real' : 'Red de prueba'}
          </Text>
          <Text style={styles.dato}>
            {archivo
              ? `Red de Antofagasta generada${archivo.generado_en ? ` el ${fechaHora(archivo.generado_en)}` : ''}: líneas ${archivo.lineas.join(', ')} y ${archivo.total_paraderos} paraderos.`
              : 'La red de Antofagasta todavía no se genera.'}
          </Text>
        </View>
      </View>

      {enCurso && (
        <View style={styles.avance} accessibilityLiveRegion="polite">
          <Text style={styles.titulo}>
            {(tarea.fase && tarea.fase !== 'lista' && FASES[tarea.fase]) || 'Generando'}
            {tarea.fase === 'trazando' && tarea.total
              ? ` (${tarea.hechos} de ${tarea.total})`
              : '…'}
          </Text>
          <View style={styles.barra}>
            <View
              style={[
                styles.relleno,
                { width: `${Math.max(tarea.fase === 'descargando' ? 5 : progreso * 100, 5)}%` },
              ]}
            />
          </View>
          {tarea.mensaje && <Text style={styles.dato}>{tarea.mensaje}</Text>}
          <Text style={styles.ayuda}>
            Puedes salir de esta pantalla: la generación sigue en el servidor.
          </Text>
        </View>
      )}

      {tarea.estado === 'lista' && (
        <View style={[styles.resultado, styles.bien]}>
          <Text style={styles.resultadoTitulo}>{tarea.mensaje}</Text>
          {tarea.resultado && <Text style={styles.dato}>{resumen(tarea.resultado)}</Text>}
          {tarea.avisos && tarea.avisos.length > 0 && (
            <>
              <Text style={styles.etiqueta}>PARA REVISAR ({tarea.avisos.length})</Text>
              {tarea.avisos.map((a) => (
                <Text key={a} style={styles.aviso}>
                  • {a}
                </Text>
              ))}
              <Text style={styles.ayuda}>
                Cualquier detalle se corrige editando la línea, el recorrido o el paradero.
              </Text>
            </>
          )}
        </View>
      )}
      {tarea.estado === 'error' && (
        <View style={[styles.resultado, styles.mal]} accessibilityRole="alert">
          <Text style={[styles.resultadoTitulo, { color: colors.accent }]}>No se pudo generar</Text>
          <Text style={styles.dato}>{tarea.mensaje}</Text>
        </View>
      )}

      {!enCurso && (
        <View style={styles.acciones}>
          <Boton
            titulo={archivo ? 'Volver a generar desde los mapas' : 'Generar red de Antofagasta'}
            onPress={() => generar(false)}
            deshabilitado={ocupado}
          />
          {archivo && actual !== 'antofagasta' && (
            <Boton
              titulo="Cargar la red ya generada"
              variante="secundario"
              onPress={cargar}
              deshabilitado={ocupado}
            />
          )}
          {actual !== 'prueba' && (
            <Boton
              titulo="Volver a la red de prueba"
              variante="secundario"
              onPress={prueba}
              deshabilitado={ocupado}
            />
          )}
          {archivo && (
            <Boton
              titulo="Actualizar las calles y generar"
              variante="secundario"
              onPress={() => generar(true)}
              deshabilitado={ocupado}
            />
          )}
        </View>
      )}

      <Text style={styles.ayuda}>
        Itinerarios: Letreros Únicos de Recorrido (DTPR, Ministerio de Transportes). Calles: ©
        colaboradores de OpenStreetMap. Trazado: OSRM. Los trazados y paraderos son aproximados;
        días, horarios y colores son de demostración. Con viajes en curso no se puede cambiar la red
        (detén antes el simulador de flota).
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  tarjeta: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textos: { flex: 1, gap: 2 },
  etiqueta: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, color: colors.textMuted },
  titulo: { fontSize: 18, fontWeight: '700', color: colors.text },
  dato: { fontSize: 14, color: colors.textMuted },
  ayuda: { fontSize: 12, color: colors.textMuted },
  avance: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 8 },
  barra: { height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' },
  relleno: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
  resultado: { borderRadius: 14, padding: 14, gap: 6, borderWidth: 2 },
  bien: { borderColor: '#1F8A4C', backgroundColor: colors.surface },
  mal: { borderColor: colors.accent, backgroundColor: colors.surface },
  resultadoTitulo: { fontSize: 16, fontWeight: '700', color: '#1F8A4C' },
  aviso: { fontSize: 13, color: colors.warning },
  acciones: { gap: 10 },
});
