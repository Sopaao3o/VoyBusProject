import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import type MapView from 'react-native-maps';
import { Polyline } from 'react-native-maps';

import { textoDeError } from '../../../src/api/client';
import {
  crearRecorrido,
  editarRecorrido,
  listarParaderosAdmin,
  obtenerLineaAdmin,
  obtenerRecorridoAdmin,
  quitarTrazado,
  trazarRecorrido,
} from '../../../src/api/redAdmin';
import type { ParaderoAdmin, Sentido, Trazado } from '../../../src/api/tipos';
import { CajaError, Cargando, ErrorMensaje } from '../../../src/components/Estados';
import { Aviso } from '../../../src/components/Etiquetas';
import { Boton, Campo } from '../../../src/components/Formulario';
import { Mapa } from '../../../src/components/mapa/Mapa';
import { MarcadorParadero } from '../../../src/components/mapa/MarcadorParadero';
import { useApi } from '../../../src/hooks/useApi';
import { normalizarBusqueda } from '../../../src/utils/textos';
import { fechaHora } from '../../../src/utils/fechas';
import { caminoDelRecorrido, coordenadasMapa } from '../../../src/utils/recorrido';
import { colors } from '../../../src/theme/colors';

// ADM-01: crear o editar un recorrido: días, horarios, activo y los paraderos en orden
// (el primero es el inicio y el último el término). Con viajes en curso, el servidor no deja
// cambiar los paraderos, para no alterar a quienes van en ellos.
// El trazado por las calles se genera aquí (servicio de rutas OSRM) con los paraderos guardados.
// `id = "nuevo"` crea uno, con `?linea=` y `?sentido=`.
export default function RecorridoAdminScreen() {
  const params = useLocalSearchParams<{ id: string; linea?: string; sentido?: Sentido }>();
  const esNuevo = params.id === 'nuevo';
  const router = useRouter();
  const mapa = useRef<MapView>(null);

  const carga = useApi(async () => {
    const recorrido = esNuevo ? null : await obtenerRecorridoAdmin(Number(params.id));
    const lineaId = recorrido?.linea_id ?? Number(params.linea);
    const [linea, paraderos] = await Promise.all([
      obtenerLineaAdmin(lineaId),
      listarParaderosAdmin(),
    ]);
    return { recorrido, linea, paraderos };
  }, [params.id, params.linea ?? null]);

  const [dias, setDias] = useState('');
  const [horarios, setHorarios] = useState('');
  const [activo, setActivo] = useState(true);
  const [elegidos, setElegidos] = useState<number[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);
  const [trazado, setTrazado] = useState<{ puntos: Trazado; fecha: string | null } | null>(null);
  const [trazando, setTrazando] = useState(false);

  // Al cargar, el formulario parte con los datos actuales del recorrido.
  const recorrido = carga.datos?.recorrido;
  useEffect(() => {
    if (!carga.datos || listo) return;
    const r = carga.datos.recorrido;
    // Copiar los datos cargados al formulario una sola vez es justo lo que se busca aquí.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDias(r?.dias_funcionamiento ?? 'Lunes a viernes');
    setHorarios(r?.horarios ?? '07:00 - 21:00');
    setActivo(r?.activo ?? true);
    setElegidos(r?.paraderos.map((p) => p.id) ?? []);
    setTrazado(r?.trazado ? { puntos: r.trazado, fecha: r.trazado_actualizado_en } : null);
    setListo(true);
  }, [carga.datos, listo]);

  const porId = new Map<number, ParaderoAdmin>(
    (carga.datos?.paraderos ?? []).map((p) => [p.id, p]),
  );
  const enOrden = elegidos.map((pid) => porId.get(pid)).filter((p): p is ParaderoAdmin => !!p);
  // El trazado guardado solo vale para los paraderos guardados: si se cambian, se ve en recto.
  const guardados = recorrido?.paraderos.map((p) => p.id) ?? [];
  const sinCambios =
    guardados.length === elegidos.length && guardados.every((pid, i) => pid === elegidos[i]);
  const puntos = coordenadasMapa(
    caminoDelRecorrido(
      enOrden.map((p, i) => ({ ...p, orden: i + 1 })),
      sinCambios ? trazado?.puntos : null,
    ),
  );
  const clavePuntos = JSON.stringify(puntos);

  useEffect(() => {
    const coordenadas = JSON.parse(clavePuntos) as typeof puntos;
    if (coordenadas.length === 0) return;
    mapa.current?.fitToCoordinates(coordenadas, {
      edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
      animated: true,
    });
  }, [clavePuntos]);

  if (carga.cargando && !carga.datos) return <Cargando />;
  if (carga.error || !carga.datos) {
    return (
      <ErrorMensaje
        mensaje={carga.error ?? 'No se encontró el recorrido.'}
        onReintentar={carga.recargar}
      />
    );
  }
  const { linea } = carga.datos;
  const sentido = recorrido?.sentido ?? params.sentido ?? 'ida';
  const enCurso = recorrido?.viajes_en_curso ?? 0;

  const mover = (i: number, delta: number) =>
    setElegidos((lista) => {
      const j = i + delta;
      if (j < 0 || j >= lista.length) return lista;
      const nueva = [...lista];
      [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
      return nueva;
    });
  const quitar = (i: number) => setElegidos((lista) => lista.filter((_, k) => k !== i));

  const termino = normalizarBusqueda(busqueda);
  const disponibles = carga.datos.paraderos.filter(
    (p) =>
      p.activo &&
      !elegidos.includes(p.id) &&
      (!termino ||
        normalizarBusqueda(p.nombre).includes(termino) ||
        normalizarBusqueda(p.codigo).includes(termino)),
  );

  async function guardar() {
    if (elegidos.length < 2) {
      setError('Elige al menos dos paraderos: el de inicio y el de término.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const datos = {
        dias_funcionamiento: dias.trim(),
        horarios: horarios.trim(),
        activo,
        paraderos: elegidos,
      };
      if (esNuevo) {
        await crearRecorrido(linea.id, { ...datos, sentido });
      } else {
        await editarRecorrido(Number(params.id), datos);
      }
      Alert.alert('Listo', 'El recorrido quedó guardado.');
      router.back();
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  async function trazar() {
    setTrazando(true);
    try {
      const r = await trazarRecorrido(Number(params.id));
      setTrazado(r.trazado ? { puntos: r.trazado, fecha: r.trazado_actualizado_en } : null);
      Alert.alert(
        'Trazado listo',
        `El recorrido sigue las calles: ${(r.largo_m / 1000).toFixed(1).replace('.', ',')} km.`,
      );
    } catch (e) {
      Alert.alert('No se pudo trazar', textoDeError(e));
    } finally {
      setTrazando(false);
    }
  }

  function confirmarQuitar() {
    Alert.alert('Quitar trazado', 'El recorrido se dibujará en tramos rectos entre paraderos.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          try {
            await quitarTrazado(Number(params.id));
            setTrazado(null);
          } catch (e) {
            Alert.alert('No se pudo quitar', textoDeError(e));
          }
        },
      },
    ]);
  }

  const titulo = `${linea.codigo} · ${sentido === 'ida' ? 'Ida' : 'Vuelta'}`;
  return (
    <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{ title: esNuevo ? `Nuevo recorrido ${titulo}` : `Recorrido ${titulo}` }}
      />

      <View style={styles.mapa}>
        <Mapa ref={mapa} scrollEnabled={false} zoomEnabled={false}>
          {puntos.length > 1 && (
            <>
              <Polyline coordinates={puntos} strokeColor={colors.surface} strokeWidth={8} />
              <Polyline coordinates={puntos} strokeColor={linea.color} strokeWidth={4} />
            </>
          )}
          {enOrden.map((p, i) => (
            <MarcadorParadero key={p.id} paradero={p} color={linea.color} orden={i + 1} />
          ))}
        </Mapa>
      </View>

      {!esNuevo && (
        <View style={styles.trazado}>
          <Ionicons
            name={trazado ? 'git-branch' : 'remove-outline'}
            size={22}
            color={trazado ? colors.primary : colors.textMuted}
          />
          <View style={styles.textos}>
            <Text style={styles.etiqueta}>
              {trazado ? 'Sigue las calles' : 'En tramos rectos entre paraderos'}
            </Text>
            <Text style={styles.ayuda}>
              {!sinCambios
                ? 'Guarda los cambios de paraderos para trazarlo por las calles.'
                : trazado
                  ? `Trazado ${trazado.fecha ? `el ${fechaHora(trazado.fecha)}` : 'guardado'}.`
                  : 'Trázalo para que el mapa y el avance de las micros sigan las calles.'}
            </Text>
          </View>
        </View>
      )}
      {!esNuevo && sinCambios && enCurso === 0 && (
        <View style={styles.botonesTrazado}>
          <Boton
            titulo={trazando ? 'Trazando…' : trazado ? 'Volver a trazar' : 'Trazar por calles'}
            variante="secundario"
            onPress={trazar}
            deshabilitado={trazando}
          />
          {trazado && !trazando && (
            <Boton titulo="Quitar trazado" variante="secundario" onPress={confirmarQuitar} />
          )}
        </View>
      )}

      {enCurso > 0 && (
        <Aviso
          texto={`Este recorrido tiene ${enCurso} ${enCurso === 1 ? 'viaje' : 'viajes'} en curso. Puedes cambiar días, horarios y si está activo; los paraderos, cuando ${enCurso === 1 ? 'termine' : 'terminen'}.`}
        />
      )}

      <Campo
        etiqueta="Días de funcionamiento"
        value={dias}
        onChangeText={setDias}
        autoCapitalize="sentences"
        maxLength={60}
      />
      <Campo
        etiqueta="Horarios"
        value={horarios}
        onChangeText={setHorarios}
        placeholder="06:00 - 23:00, cada 10 min"
        maxLength={80}
      />
      <View style={styles.interruptor}>
        <View style={styles.textos}>
          <Text style={styles.etiqueta}>Recorrido activo</Text>
          <Text style={styles.ayuda}>
            Desactivado se oculta a los pasajeros y no se asigna en turnos nuevos.
          </Text>
        </View>
        <Switch value={activo} onValueChange={setActivo} accessibilityLabel="Recorrido activo" />
      </View>

      <Text style={styles.subtitulo}>Paraderos en orden ({elegidos.length})</Text>
      <Text style={styles.ayuda}>
        El primero es el inicio y el último el término del recorrido.
      </Text>
      {enOrden.map((p, i) => (
        <View key={p.id} style={styles.parada}>
          <View style={[styles.orden, { borderColor: linea.color }]}>
            <Text style={[styles.ordenTexto, { color: linea.color }]}>{i + 1}</Text>
          </View>
          <View style={styles.textos}>
            <Text style={styles.paradaNombre}>{p.nombre}</Text>
            <Text style={styles.ayuda}>
              {p.codigo}
              {i === 0 ? ' · inicio' : i === enOrden.length - 1 ? ' · término' : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => mover(i, -1)}
            disabled={i === 0}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Subir ${p.nombre}`}
          >
            <Ionicons name="chevron-up" size={24} color={i === 0 ? colors.border : colors.text} />
          </Pressable>
          <Pressable
            onPress={() => mover(i, 1)}
            disabled={i === enOrden.length - 1}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Bajar ${p.nombre}`}
          >
            <Ionicons
              name="chevron-down"
              size={24}
              color={i === enOrden.length - 1 ? colors.border : colors.text}
            />
          </Pressable>
          <Pressable
            onPress={() => quitar(i)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Quitar ${p.nombre}`}
          >
            <Ionicons name="trash-outline" size={22} color={colors.accent} />
          </Pressable>
        </View>
      ))}

      {agregando ? (
        <View style={styles.selector}>
          <TextInput
            style={styles.buscar}
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Buscar paradero por nombre o código"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            accessibilityLabel="Buscar paradero para agregar"
          />
          {disponibles.slice(0, 8).map((p) => (
            <Pressable
              key={p.id}
              style={({ pressed }) => [styles.opcion, pressed && styles.presionado]}
              onPress={() => {
                setElegidos((lista) => [...lista, p.id]);
                setBusqueda('');
              }}
              accessibilityRole="button"
            >
              <Ionicons name="add-circle" size={22} color={colors.primary} />
              <Text style={styles.paradaNombre}>
                {p.nombre} <Text style={styles.ayuda}>{p.codigo}</Text>
              </Text>
            </Pressable>
          ))}
          {disponibles.length === 0 && (
            <Text style={styles.ayuda}>No hay más paraderos activos que agregar.</Text>
          )}
          <Boton titulo="Listo" variante="secundario" onPress={() => setAgregando(false)} />
        </View>
      ) : (
        <Boton
          titulo="Agregar paradero al final"
          variante="secundario"
          onPress={() => setAgregando(true)}
        />
      )}

      <CajaError mensaje={error} />
      <Boton
        titulo={guardando ? 'Guardando…' : esNuevo ? 'Crear recorrido' : 'Guardar recorrido'}
        onPress={guardar}
        deshabilitado={guardando}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  trazado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  botonesTrazado: { gap: 8 },
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  mapa: { height: 220, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.border },
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
  textos: { flex: 1, gap: 2 },
  etiqueta: { fontSize: 14, fontWeight: '600', color: colors.text },
  subtitulo: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 6 },
  ayuda: { fontSize: 13, color: colors.textMuted },
  parada: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
  orden: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordenTexto: { fontSize: 12, fontWeight: '800' },
  paradaNombre: { fontSize: 15, color: colors.text, fontWeight: '500', flexShrink: 1 },
  selector: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 12,
    gap: 8,
  },
  buscar: {
    height: 46,
    borderRadius: 10,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.text,
  },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  presionado: { opacity: 0.6 },
});
