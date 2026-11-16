import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  crearTurno,
  listarConductores,
  listarVehiculos,
  modificarTurno,
  obtenerTurno,
} from '../../src/api/admin';
import { textoDeError } from '../../src/api/client';
import { Cargando, ErrorMensaje } from '../../src/components/Estados';
import { Boton, Campo, Selector } from '../../src/components/Formulario';
import { useApi } from '../../src/hooks/useApi';
import { useRecorridos } from '../../src/hooks/useRecorridos';
import { colors } from '../../src/theme/colors';
import {
  aIso,
  fechaLocal,
  fechaValida,
  horaLocal,
  horaValida,
  hoyLocal,
} from '../../src/utils/fechas';

interface ViajeForm {
  clave: number;
  recorridoId: number | null;
  inicio: string;
  termino: string;
}

// ADM-03: crear un turno (o modificar uno programado si llega ?id=).
export default function FormularioTurnoScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editandoId = id ? Number(id) : null;
  const router = useRouter();

  const conductores = useApi(listarConductores);
  const vehiculos = useApi(listarVehiculos);
  const recorridos = useRecorridos();
  const turnoActual = useApi(
    async () => (editandoId ? obtenerTurno(editandoId) : null),
    [editandoId],
  );

  const [conductorId, setConductorId] = useState<number | null>(null);
  const [vehiculoId, setVehiculoId] = useState<number | null>(null);
  const [fecha, setFecha] = useState(hoyLocal());
  const [inicio, setInicio] = useState('08:00');
  const [termino, setTermino] = useState('16:00');
  const [margen, setMargen] = useState('');
  const [viajes, setViajes] = useState<ViajeForm[]>([
    { clave: 1, recorridoId: null, inicio: '08:30', termino: '09:30' },
  ]);
  const siguienteClave = useRef(2);
  const [enviando, setEnviando] = useState(false);

  // Al modificar, se rellenan los campos una sola vez con el turno existente.
  const rellenado = useRef(false);
  useEffect(() => {
    const t = turnoActual.datos;
    if (!t || rellenado.current) return;
    rellenado.current = true;
    setConductorId(t.conductor_id);
    setVehiculoId(t.vehiculo_id);
    setFecha(fechaLocal(t.inicio_planificado));
    setInicio(horaLocal(t.inicio_planificado));
    setTermino(horaLocal(t.termino_planificado));
    setMargen(String(t.margen_tolerancia_min));
    setViajes(
      t.viajes.map((v) => ({
        clave: siguienteClave.current++,
        recorridoId: v.recorrido_id,
        inicio: horaLocal(v.inicio_planificado),
        termino: horaLocal(v.termino_planificado),
      })),
    );
  }, [turnoActual.datos]);

  const cambiarViaje = (clave: number, cambios: Partial<ViajeForm>) =>
    setViajes((vs) => vs.map((v) => (v.clave === clave ? { ...v, ...cambios } : v)));

  function agregarViaje() {
    setViajes((vs) => [
      ...vs,
      { clave: siguienteClave.current++, recorridoId: null, inicio: termino, termino },
    ]);
  }

  function quitarViaje(clave: number) {
    setViajes((vs) => vs.filter((v) => v.clave !== clave));
  }

  /** Revisa lo básico en el celular; las reglas de negocio las valida el servidor. */
  function problemas(): string[] {
    const lista: string[] = [];
    if (conductorId === null) lista.push('Elige un conductor.');
    if (vehiculoId === null) lista.push('Elige un vehículo.');
    if (!fechaValida(fecha)) lista.push('La fecha debe tener formato AAAA-MM-DD.');
    if (!horaValida(inicio) || !horaValida(termino))
      lista.push('Las horas deben ser HH:MM (24 h).');
    if (margen.trim() !== '') {
      const m = Number(margen);
      if (!Number.isInteger(m) || m < 0 || m > 120)
        lista.push('El margen debe ser de 0 a 120 minutos.');
    }
    if (viajes.length === 0) lista.push('Agrega al menos un viaje.');
    viajes.forEach((v, i) => {
      if (v.recorridoId === null) lista.push(`Viaje ${i + 1}: elige un recorrido.`);
      if (!horaValida(v.inicio) || !horaValida(v.termino)) {
        lista.push(`Viaje ${i + 1}: las horas deben ser HH:MM.`);
      }
    });
    return lista;
  }

  async function guardar() {
    const faltan = problemas();
    if (faltan.length > 0) {
      Alert.alert('Revisa el formulario', faltan.join('\n'));
      return;
    }
    const cuerpo = {
      conductor_id: conductorId as number,
      vehiculo_id: vehiculoId as number,
      inicio_planificado: aIso(fecha, inicio),
      termino_planificado: aIso(fecha, termino),
      ...(margen.trim() !== '' && { margen_tolerancia_min: Number(margen) }),
      viajes: viajes.map((v) => ({
        recorrido_id: v.recorridoId as number,
        inicio_planificado: aIso(fecha, v.inicio),
        termino_planificado: aIso(fecha, v.termino),
      })),
    };
    setEnviando(true);
    try {
      const turno = editandoId
        ? await modificarTurno(editandoId, cuerpo)
        : await crearTurno(cuerpo);
      router.replace(`/turno/${turno.id}`);
    } catch (e) {
      Alert.alert('No se pudo guardar el turno', textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  const cargando =
    (conductores.cargando && !conductores.datos) ||
    (vehiculos.cargando && !vehiculos.datos) ||
    (recorridos.cargando && !recorridos.datos) ||
    (turnoActual.cargando && !turnoActual.datos && editandoId !== null);
  const fallo = conductores.error ?? vehiculos.error ?? recorridos.error ?? turnoActual.error;

  if (fallo) {
    return (
      <ErrorMensaje
        mensaje={fallo}
        onReintentar={() => {
          conductores.recargar();
          vehiculos.recargar();
          recorridos.recargar();
          turnoActual.recargar();
        }}
      />
    );
  }
  if (cargando) return <Cargando />;

  return (
    <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: editandoId ? 'Modificar turno' : 'Nuevo turno' }} />

      <Selector
        etiqueta="Conductor"
        valor={conductorId}
        onCambio={setConductorId}
        opciones={(conductores.datos ?? []).map((c) => ({
          valor: c.id,
          titulo: c.nombre,
          detalle: c.habilitado ? undefined : 'Deshabilitado',
          deshabilitada: !c.habilitado,
        }))}
      />

      <Selector
        etiqueta="Vehículo"
        valor={vehiculoId}
        onCambio={setVehiculoId}
        opciones={(vehiculos.datos ?? []).map((v) => ({
          valor: v.id,
          titulo: `${v.identificador} · ${v.patente}`,
          detalle: v.asignable
            ? undefined
            : `No disponible (${v.estado_operativo.replaceAll('_', ' ')})`,
          deshabilitada: !v.asignable,
        }))}
      />

      <Campo
        etiqueta="Fecha del turno"
        value={fecha}
        onChangeText={setFecha}
        placeholder="AAAA-MM-DD"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />
      <View style={styles.fila}>
        <View style={styles.mitad}>
          <Campo
            etiqueta="Inicio"
            value={inicio}
            onChangeText={setInicio}
            placeholder="HH:MM"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
        </View>
        <View style={styles.mitad}>
          <Campo
            etiqueta="Término"
            value={termino}
            onChangeText={setTermino}
            placeholder="HH:MM"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
        </View>
      </View>
      <Campo
        etiqueta="Margen de tolerancia (minutos)"
        value={margen}
        onChangeText={setMargen}
        placeholder="Vacío = el margen por defecto"
        keyboardType="number-pad"
      />

      <Text style={styles.subtitulo}>Viajes</Text>
      {viajes.map((v, i) => (
        <View key={v.clave} style={styles.viaje}>
          <Text style={styles.viajeTitulo}>Viaje {i + 1}</Text>
          <Selector
            etiqueta="Recorrido"
            valor={v.recorridoId}
            onCambio={(r) => cambiarViaje(v.clave, { recorridoId: r })}
            opciones={(recorridos.datos ?? []).map((r) => ({
              valor: r.id,
              titulo: r.titulo,
              detalle: r.detalle,
            }))}
          />
          <View style={styles.fila}>
            <View style={styles.mitad}>
              <Campo
                etiqueta="Inicio"
                value={v.inicio}
                onChangeText={(t) => cambiarViaje(v.clave, { inicio: t })}
                placeholder="HH:MM"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
            <View style={styles.mitad}>
              <Campo
                etiqueta="Término"
                value={v.termino}
                onChangeText={(t) => cambiarViaje(v.clave, { termino: t })}
                placeholder="HH:MM"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
          </View>
          {viajes.length > 1 && (
            <Boton
              titulo="Quitar este viaje"
              variante="secundario"
              onPress={() => quitarViaje(v.clave)}
            />
          )}
        </View>
      ))}
      <Boton titulo="Agregar viaje" variante="secundario" onPress={agregarViaje} />

      <Boton
        titulo={editandoId ? 'Guardar cambios' : 'Crear turno'}
        onPress={guardar}
        deshabilitado={enviando}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  fila: { flexDirection: 'row', gap: 12 },
  mitad: { flex: 1 },
  subtitulo: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 4 },
  viaje: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  viajeTitulo: { fontSize: 15, fontWeight: '700', color: colors.primary },
});
