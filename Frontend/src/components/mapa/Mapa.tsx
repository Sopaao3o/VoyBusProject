import type { Ref } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { type MapStyleElement, type MapViewProps, type Region } from 'react-native-maps';

/** Vista inicial: el centro de Antofagasta, de la Universidad de Antofagasta a la UCN. */
export const ANTOFAGASTA: Region = {
  latitude: -23.638,
  longitude: -70.4,
  latitudeDelta: 0.13,
  longitudeDelta: 0.09,
};

// Oculta comercios y paradas de transporte del mapa base: en pantalla solo quedan
// los paraderos y las micros de VoyBus. (Solo aplica a Google Maps, es decir, Android.)
const ESTILO: MapStyleElement[] = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

/** Mapa a pantalla completa, base de todas las vistas con mapa. */
export function Mapa({ ref, ...props }: MapViewProps & { ref?: Ref<MapView> }) {
  return (
    <MapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      initialRegion={ANTOFAGASTA}
      customMapStyle={ESTILO}
      showsPointsOfInterests={false}
      showsCompass={false}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      {...props}
    />
  );
}
