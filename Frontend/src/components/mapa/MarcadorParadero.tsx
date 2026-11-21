import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import type { Paradero } from '../../api/tipos';
import { colors } from '../../theme/colors';

interface Props {
  paradero: Paradero;
  /** Color del borde: el de la línea cuando el mapa muestra un recorrido. */
  color?: string;
  /** Número del paradero dentro del recorrido. */
  orden?: number;
  favorito?: boolean;
  destacado?: boolean;
  onPress?: () => void;
}

/** Punto de un paradero en el mapa (RED-01 y RED-02). */
export function MarcadorParadero(props: Props) {
  // Si cambia cómo se ve, se vuelve a montar el marcador para que el mapa lo redibuje.
  const clave = `${props.color}-${props.orden}-${props.favorito}-${props.destacado}`;
  return <Marcador key={clave} {...props} />;
}

function Marcador({
  paradero,
  color = colors.primary,
  orden,
  favorito,
  destacado,
  onPress,
}: Props) {
  // Android dibuja la vista del marcador como una imagen. Se sigue actualizando un momento
  // para que alcance a dibujar el texto y luego se congela, para no gastar batería.
  const [dibujando, setDibujando] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setDibujando(false), 600);
    return () => clearTimeout(t);
  }, []);

  const conTexto = orden !== undefined;
  return (
    <Marker
      coordinate={{ latitude: paradero.latitud, longitude: paradero.longitud }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={dibujando}
      onPress={onPress}
      zIndex={destacado ? 10 : 1}
      accessibilityLabel={`Paradero ${paradero.nombre}, código ${paradero.codigo}`}
    >
      <View
        style={[
          styles.punto,
          conTexto && styles.conTexto,
          destacado && styles.destacado,
          { borderColor: destacado ? colors.text : color },
          favorito && !destacado && { backgroundColor: color },
        ]}
      >
        {conTexto && <Text style={[styles.orden, { color }]}>{orden}</Text>}
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  punto: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conTexto: { width: 26, height: 26, borderRadius: 13 },
  destacado: { width: 30, height: 30, borderRadius: 15, borderWidth: 6 },
  orden: { fontSize: 12, fontWeight: '800' },
});
