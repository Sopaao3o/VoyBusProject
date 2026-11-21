import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type MapView from 'react-native-maps';
import { Marker } from 'react-native-maps';

import { textoDeError } from '../../../src/api/client';
import { crearParadero, editarParadero, obtenerParaderoAdmin } from '../../../src/api/redAdmin';
import { CajaError, Cargando, ErrorMensaje } from '../../../src/components/Estados';
import { Aviso } from '../../../src/components/Etiquetas';
import { Boton, Campo } from '../../../src/components/Formulario';
import { ANTOFAGASTA, Mapa } from '../../../src/components/mapa/Mapa';
import { useApi } from '../../../src/hooks/useApi';
import { useMiUbicacion } from '../../../src/hooks/useMiUbicacion';
import { colors } from '../../../src/theme/colors';

interface Punto {
  latitude: number;
  longitude: number;
}

// ADM-01: crear o editar un paradero: código, nombre, activo y su ubicación, que se elige
// tocando el mapa o arrastrando el marcador. `id = "nuevo"` crea uno.
export default function ParaderoAdminScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const esNuevo = id === 'nuevo';
  const router = useRouter();
  const mapa = useRef<MapView>(null);
  const ubicacion = useMiUbicacion();
  const carga = useApi(
    () => (esNuevo ? Promise.resolve(null) : obtenerParaderoAdmin(Number(id))),
    [id],
  );

  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [activo, setActivo] = useState(true);
  const [punto, setPunto] = useState<Punto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(esNuevo);

  // Al cargar, el formulario parte con los datos actuales del paradero.
  useEffect(() => {
    const p = carga.datos;
    if (!p || listo) return;
    // Copiar los datos cargados al formulario una sola vez es justo lo que se busca aquí.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCodigo(p.codigo);
    setNombre(p.nombre);
    setActivo(p.activo);
    setPunto({ latitude: p.latitud, longitude: p.longitud });
    setListo(true);
  }, [carga.datos, listo]);

  if (!esNuevo && carga.cargando && !carga.datos) return <Cargando />;
  if (!esNuevo && (carga.error || !carga.datos)) {
    return (
      <ErrorMensaje
        mensaje={carga.error ?? 'No se encontró el paradero.'}
        onReintentar={carga.recargar}
      />
    );
  }
  const detalle = carga.datos;
  const enCurso = detalle?.viajes_en_curso ?? 0;

  async function usarMiUbicacion() {
    const aqui = await ubicacion.obtener();
    if (aqui) {
      setPunto(aqui);
      mapa.current?.animateToRegion({ ...aqui, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500);
    }
  }

  async function guardar() {
    if (!punto) {
      setError('Toca el mapa para marcar dónde está el paradero.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const datos = {
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        latitud: Number(punto.latitude.toFixed(6)),
        longitud: Number(punto.longitude.toFixed(6)),
        activo,
      };
      if (esNuevo) await crearParadero(datos);
      else await editarParadero(Number(id), datos);
      Alert.alert(
        'Listo',
        esNuevo ? 'El paradero quedó creado.' : 'Los cambios quedaron guardados.',
      );
      router.back();
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  const region = punto ? { ...punto, latitudeDelta: 0.012, longitudeDelta: 0.012 } : ANTOFAGASTA;

  return (
    <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{ title: esNuevo ? 'Nuevo paradero' : `Paradero ${detalle?.codigo}` }}
      />

      <View style={styles.mapa}>
        <Mapa
          ref={mapa}
          initialRegion={region}
          onPress={(e) => setPunto(e.nativeEvent.coordinate)}
          showsUserLocation={ubicacion.permitida === true}
        >
          {punto && (
            <Marker
              coordinate={punto}
              draggable
              onDragEnd={(e) => setPunto(e.nativeEvent.coordinate)}
              pinColor={colors.primary}
            />
          )}
        </Mapa>
      </View>
      <View style={styles.filaUbicacion}>
        <Text style={[styles.ayuda, styles.flex]}>
          {punto
            ? `Ubicación: ${punto.latitude.toFixed(5)}, ${punto.longitude.toFixed(5)}. Toca el mapa o arrastra el marcador para moverla.`
            : 'Toca el mapa donde está el paradero.'}
        </Text>
        <Pressable onPress={usarMiUbicacion} accessibilityRole="button" style={styles.aqui}>
          <Text style={styles.aquiTexto}>Estoy aquí</Text>
        </Pressable>
      </View>

      {enCurso > 0 && (
        <Aviso
          texto={`Hay ${enCurso} ${enCurso === 1 ? 'viaje' : 'viajes'} en curso que ${enCurso === 1 ? 'pasa' : 'pasan'} por aquí: puedes corregir el nombre o el código, pero moverlo o desactivarlo se podrá cuando ${enCurso === 1 ? 'termine' : 'terminen'}.`}
        />
      )}

      <Campo
        etiqueta="Código"
        value={codigo}
        onChangeText={setCodigo}
        placeholder="Ej: PA-014"
        autoCapitalize="characters"
        ayuda="Único: no puede repetirse en otro paradero."
        maxLength={12}
      />
      <Campo
        etiqueta="Nombre"
        value={nombre}
        onChangeText={setNombre}
        placeholder="Ej: Balneario Municipal"
        autoCapitalize="sentences"
        maxLength={60}
      />
      <View style={styles.interruptor}>
        <View style={styles.flex}>
          <Text style={styles.etiqueta}>Paradero activo</Text>
          <Text style={styles.ayuda}>
            Desactivado se oculta a los pasajeros y no se puede usar en recorridos nuevos.
          </Text>
        </View>
        <Switch value={activo} onValueChange={setActivo} accessibilityLabel="Paradero activo" />
      </View>

      {detalle && detalle.recorridos.length > 0 && (
        <View style={styles.usos}>
          <Text style={styles.etiqueta}>Recorridos que pasan por aquí</Text>
          {detalle.recorridos.map((r) => (
            <Text key={r.id} style={styles.ayuda}>
              Línea {r.linea_codigo} · {r.sentido === 'ida' ? 'Ida' : 'Vuelta'} · paradero n.º{' '}
              {r.orden}
            </Text>
          ))}
        </View>
      )}

      <CajaError mensaje={error} />
      <Boton
        titulo={guardando ? 'Guardando…' : esNuevo ? 'Crear paradero' : 'Guardar cambios'}
        onPress={guardar}
        deshabilitado={guardando}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  mapa: { height: 260, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.border },
  filaUbicacion: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, gap: 2 },
  aqui: {
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
  },
  aquiTexto: { color: colors.primary, fontWeight: '700' },
  interruptor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  etiqueta: { fontSize: 14, fontWeight: '600', color: colors.text },
  ayuda: { fontSize: 13, color: colors.textMuted },
  usos: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, gap: 4 },
});
