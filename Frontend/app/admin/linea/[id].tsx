import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { textoDeError } from '../../../src/api/client';
import { crearLinea, editarLinea, obtenerLineaAdmin } from '../../../src/api/redAdmin';
import type { EstadoLinea, LineaAdminDetalle, Sentido } from '../../../src/api/tipos';
import { CajaError, Cargando, ErrorMensaje } from '../../../src/components/Estados';
import { InsigniaLinea } from '../../../src/components/Etiquetas';
import { Boton, Campo, Selector } from '../../../src/components/Formulario';
import { colors } from '../../../src/theme/colors';
import { ETIQUETA_ESTADO_LINEA } from '../../../src/utils/textos';

// Colores sugeridos: se ven bien en el mapa y con texto blanco o oscuro encima.
const PALETA = [
  '#1E5FC9',
  '#3D9BE0',
  '#0F2A4A',
  '#D92B3A',
  '#E07A1F',
  '#2E7D32',
  '#7B3FB2',
  '#5B6573',
];
const COLOR_VALIDO = /^#[0-9A-Fa-f]{6}$/;

const DESCRIPCION_ESTADO: Record<EstadoLinea, string> = {
  activa: 'Presta servicio y se puede asignar en turnos.',
  suspendida: 'Se muestra con un aviso a los pasajeros y no se asigna en turnos nuevos.',
  desactivada: 'Se oculta a los pasajeros y no se asigna en turnos nuevos.',
};

// ADM-01: crear o editar una línea (código, nombre, color y estado del servicio) y entrar a
// sus recorridos de ida y vuelta. `id = "nueva"` crea una línea.
export default function LineaAdminScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const esNueva = id === 'nueva';
  const router = useRouter();
  const [linea, setLinea] = useState<LineaAdminDetalle | null>(null);
  const [cargando, setCargando] = useState(!esNueva);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState(PALETA[0]);
  const [estado, setEstado] = useState<EstadoLinea>('activa');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (esNueva) return;
    try {
      const l = await obtenerLineaAdmin(Number(id));
      setLinea(l);
      setCodigo(l.codigo);
      setNombre(l.nombre);
      setColor(l.color);
      setEstado(l.estado_servicio);
      setErrorCarga(null);
    } catch (e) {
      setErrorCarga(textoDeError(e));
    } finally {
      setCargando(false);
    }
  }, [esNueva, id]);

  // Al volver de editar un recorrido, se recargan sus datos.
  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  async function guardar() {
    if (!COLOR_VALIDO.test(color)) {
      setError('El color debe tener el formato #RRGGBB, por ejemplo #1E5FC9.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const datos = {
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        color,
        estado_servicio: estado,
      };
      if (esNueva) {
        const creada = await crearLinea(datos);
        router.replace(`/admin/linea/${creada.id}`);
        Alert.alert('Línea creada', 'Ahora agrega sus recorridos de ida y vuelta.');
      } else {
        setLinea(await editarLinea(Number(id), datos));
        Alert.alert('Listo', 'Los cambios de la línea quedaron guardados.');
      }
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <Cargando />;
  if (errorCarga) return <ErrorMensaje mensaje={errorCarga} onReintentar={cargar} />;

  const recorridoDe = (sentido: Sentido) => linea?.recorridos.find((r) => r.sentido === sentido);

  return (
    <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: esNueva ? 'Nueva línea' : `Línea ${linea?.codigo}` }} />

      <View style={styles.vistaPrevia}>
        <InsigniaLinea
          linea={{ codigo: codigo || '000', color: COLOR_VALIDO.test(color) ? color : '#5B6573' }}
        />
        <Text style={styles.vistaPreviaTexto}>{nombre || 'Nombre de la línea'}</Text>
      </View>

      <Campo
        etiqueta="Código"
        value={codigo}
        onChangeText={setCodigo}
        placeholder="Ej: 120"
        ayuda="Único: no puede repetirse en otra línea."
        maxLength={12}
      />
      <Campo
        etiqueta="Nombre"
        value={nombre}
        onChangeText={setNombre}
        placeholder="Ej: Playa – Centro"
        autoCapitalize="sentences"
        maxLength={60}
      />

      <View style={styles.campo}>
        <Text style={styles.etiqueta}>Color</Text>
        <View style={styles.paleta}>
          {PALETA.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={[styles.muestra, { backgroundColor: c }, c === color && styles.muestraElegida]}
              accessibilityRole="radio"
              accessibilityState={{ selected: c === color }}
              accessibilityLabel={`Color ${c}`}
            >
              {c === color && <Ionicons name="checkmark" size={20} color={colors.surface} />}
            </Pressable>
          ))}
        </View>
        <Campo
          etiqueta="O escribe el color"
          value={color}
          onChangeText={(t) => setColor(t.trim())}
          placeholder="#1E5FC9"
          autoCapitalize="characters"
          maxLength={7}
        />
      </View>

      <Selector<EstadoLinea>
        etiqueta="Estado del servicio"
        valor={estado}
        onCambio={setEstado}
        opciones={(['activa', 'suspendida', 'desactivada'] as const).map((e) => ({
          valor: e,
          titulo: ETIQUETA_ESTADO_LINEA[e],
          detalle: DESCRIPCION_ESTADO[e],
        }))}
      />

      <CajaError mensaje={error} />
      <Boton
        titulo={guardando ? 'Guardando…' : esNueva ? 'Crear línea' : 'Guardar cambios'}
        onPress={guardar}
        deshabilitado={guardando}
      />

      {!esNueva && linea && (
        <>
          <Text style={styles.subtitulo}>Recorridos</Text>
          <Text style={styles.ayuda}>
            Cada recorrido define sus días, horarios y los paraderos en orden, del inicio al
            término.
          </Text>
          {(['ida', 'vuelta'] as const).map((sentido) => {
            const r = recorridoDe(sentido);
            return (
              <Pressable
                key={sentido}
                style={({ pressed }) => [styles.recorrido, pressed && styles.presionado]}
                onPress={() =>
                  router.push(
                    r
                      ? `/admin/recorrido/${r.id}`
                      : {
                          pathname: '/admin/recorrido/[id]',
                          params: { id: 'nuevo', linea: linea.id, sentido },
                        },
                  )
                }
                accessibilityRole="button"
              >
                <Ionicons
                  name={sentido === 'ida' ? 'arrow-forward-circle' : 'arrow-back-circle'}
                  size={28}
                  color={r ? linea.color : colors.textMuted}
                />
                <View style={styles.textos}>
                  <Text style={styles.recorridoTitulo}>{sentido === 'ida' ? 'Ida' : 'Vuelta'}</Text>
                  <Text style={styles.ayuda}>
                    {r
                      ? `${r.paraderos[0]?.nombre ?? '—'} → ${r.paraderos[r.paraderos.length - 1]?.nombre ?? '—'} · ${r.paraderos.length} paraderos${r.activo ? '' : ' · desactivado'}`
                      : 'Todavía no existe: toca para crearlo'}
                  </Text>
                </View>
                <Ionicons name={r ? 'create-outline' : 'add'} size={22} color={colors.primary} />
              </Pressable>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  vistaPrevia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vistaPreviaTexto: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  campo: { gap: 8 },
  etiqueta: { fontSize: 14, fontWeight: '600', color: colors.text },
  paleta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  muestra: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muestraElegida: { borderWidth: 3, borderColor: colors.text },
  subtitulo: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 8 },
  ayuda: { fontSize: 13, color: colors.textMuted },
  recorrido: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  presionado: { opacity: 0.6 },
  textos: { flex: 1, gap: 2 },
  recorridoTitulo: { fontSize: 16, fontWeight: '700', color: colors.text },
});
