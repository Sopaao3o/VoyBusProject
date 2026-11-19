import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import type { VehiculoCirculacion } from '../../api/tipos';
import { colors } from '../../theme/colors';

/** Si el fondo de la línea es claro, el texto va oscuro (para que se lea). */
function textoSobre(fondo: string) {
  const hex = fondo.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? colors.onSecondary : colors.surface;
}

interface Props {
  vehiculo: VehiculoCirculacion;
  seleccionado?: boolean;
  onPress?: () => void;
}

/**
 * RED-03 / ADM-04: una micro en el mapa, con el código de su línea.
 * Si su ubicación está atrasada se ve gris y con borde punteado, en su última posición conocida.
 */
export function MarcadorVehiculo(props: Props) {
  const { vehiculo, seleccionado } = props;
  // Si cambia cómo se ve, se vuelve a montar el marcador para que el mapa lo redibuje.
  const clave = `${vehiculo.viaje_id}-${vehiculo.linea.color}-${vehiculo.ubicacion_atrasada}-${seleccionado}`;
  if (!vehiculo.ultima_ubicacion) return null;
  return <Marcador key={clave} {...props} />;
}

function Marcador({ vehiculo, seleccionado, onPress }: Props) {
  // Android dibuja la vista como una imagen: se actualiza un momento y luego se congela.
  const [dibujando, setDibujando] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setDibujando(false), 600);
    return () => clearTimeout(t);
  }, []);

  const ubicacion = vehiculo.ultima_ubicacion!;
  const atrasada = vehiculo.ubicacion_atrasada;
  const fondo = atrasada ? '#E4E7EC' : vehiculo.linea.color;
  const texto = atrasada ? colors.textMuted : textoSobre(vehiculo.linea.color);

  return (
    <Marker
      coordinate={{ latitude: ubicacion.latitud, longitude: ubicacion.longitud }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={dibujando}
      onPress={onPress}
      zIndex={seleccionado ? 30 : 20}
      accessibilityLabel={`Micro ${vehiculo.vehiculo.identificador}, línea ${vehiculo.linea.codigo}${
        atrasada ? ', ubicación atrasada' : ''
      }`}
    >
      <View
        style={[
          styles.pastilla,
          { backgroundColor: fondo },
          atrasada && styles.atrasada,
          seleccionado && styles.seleccionada,
        ]}
      >
        <Text style={[styles.texto, { color: texto }]}>{vehiculo.linea.codigo}</Text>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  pastilla: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  atrasada: { borderStyle: 'dashed', borderColor: colors.textMuted },
  seleccionada: { borderColor: colors.text, borderWidth: 3, transform: [{ scale: 1.15 }] },
  texto: { fontSize: 13, fontWeight: '800' },
});
