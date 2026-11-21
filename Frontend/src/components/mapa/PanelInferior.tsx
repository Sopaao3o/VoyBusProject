import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../theme/colors';

// Espacio que siempre queda libre arriba, para los botones flotantes sobre el mapa.
const ESPACIO_SUPERIOR = 84;

interface Props {
  /**
   * Alturas en que se detiene el panel, de menor a mayor. Un número hasta 1 es una fracción
   * del alto disponible (0.85 = 85 %); uno mayor es una altura en píxeles.
   */
  alturas: number[];
  /** Altura actual (posición en `alturas`). El panel se mueve cuando cambia. */
  indice: number;
  onIndice: (indice: number) => void;
  /** Avisa la altura visible en píxeles, para que el mapa no centre nada debajo del panel. */
  onAltura?: (px: number) => void;
  /** Parte fija de arriba. También sirve para arrastrar el panel. */
  encabezado?: ReactNode;
  children?: ReactNode;
}

/**
 * Panel blanco que se desliza sobre el mapa, al estilo de las apps de transporte.
 * Se arrastra desde la barra o el encabezado y se detiene en las alturas indicadas.
 */
export function PanelInferior({
  alturas,
  indice,
  onIndice,
  onAltura,
  encabezado,
  children,
}: Props) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const disponible = height - insets.top - ESPACIO_SUPERIOR;

  const puntos = useMemo(
    () => alturas.map((a) => Math.round(a <= 1 ? a * disponible : Math.min(a, disponible))),
    [alturas, disponible],
  );
  const maximo = puntos[puntos.length - 1];
  const visible = puntos[Math.min(indice, puntos.length - 1)];

  // El panel mide siempre `maximo` y se baja con translateY: 0 = completamente abierto.
  // El valor animado y los gestos se crean una sola vez (useState con función inicial).
  const [desplazamiento] = useState(() => new Animated.Value(maximo - visible));
  const alInicio = useRef(0);

  // Los gestos leen los datos más recientes desde aquí, porque se crean una sola vez.
  const estado = useRef({ puntos, maximo, onIndice });
  useEffect(() => {
    estado.current = { puntos, maximo, onIndice };
  });

  useEffect(() => {
    mover(desplazamiento, maximo - visible);
    onAltura?.(visible);
  }, [desplazamiento, maximo, visible, onAltura]);

  // Los refs se leen solo dentro de los gestos (al tocar), nunca al dibujar, que es lo que la
  // regla busca evitar: aquí no aplica.
  // eslint-disable-next-line react-hooks/refs
  const [gestos] = useState(() => {
    // Un arrastre vertical mueve el panel aunque empiece sobre un botón del encabezado.
    const esArrastre = (dx: number, dy: number) => Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx);
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => esArrastre(g.dx, g.dy),
      onMoveShouldSetPanResponderCapture: (_, g) => esArrastre(g.dx, g.dy),
      onPanResponderGrant: () => {
        desplazamiento.stopAnimation((valor) => {
          alInicio.current = valor;
        });
      },
      onPanResponderMove: (_, g) => {
        const { puntos: p, maximo: m } = estado.current;
        const valor = Math.min(Math.max(alInicio.current + g.dy, 0), m - p[0]);
        desplazamiento.setValue(valor);
      },
      onPanResponderRelease: (_, g) => {
        const { puntos: p, maximo: m, onIndice: avisar } = estado.current;
        // Un movimiento rápido lleva el panel más lejos, como al lanzar una tarjeta.
        const proyectado = alInicio.current + g.dy + g.vy * 140;
        let mejor = 0;
        p.forEach((altura, i) => {
          if (Math.abs(m - altura - proyectado) < Math.abs(m - p[mejor] - proyectado)) mejor = i;
        });
        mover(desplazamiento, m - p[mejor]);
        avisar(mejor);
      },
    });
  });

  const ultimo = puntos.length - 1;
  return (
    <Animated.View
      style={[styles.panel, { height: maximo, transform: [{ translateY: desplazamiento }] }]}
    >
      <View {...gestos.panHandlers}>
        <Pressable
          style={styles.zonaBarra}
          onPress={() => onIndice(indice < ultimo ? ultimo : 0)}
          accessibilityRole="button"
          accessibilityLabel={indice < ultimo ? 'Expandir el panel' : 'Reducir el panel'}
        >
          <View style={styles.barra} />
        </Pressable>
        {encabezado}
      </View>
      {/* Lo que queda bajo el borde de la pantalla no cuenta: así las listas terminan donde se ven. */}
      <View style={[styles.contenido, { paddingBottom: maximo - visible + insets.bottom }]}>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: '#0F2A4A',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  zonaBarra: { alignItems: 'center', paddingTop: 10, paddingBottom: 8 },
  barra: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  contenido: { flex: 1 },
});

function mover(valor: Animated.Value, destino: number) {
  Animated.spring(valor, {
    toValue: destino,
    useNativeDriver: true,
    bounciness: 0,
    speed: 18,
  }).start();
}
