import * as Location from 'expo-location';
import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';

export interface Coordenada {
  latitude: number;
  longitude: number;
}

/**
 * Ubicación del teléfono para el botón "mi ubicación" (RNF-12). El permiso se pide recién
 * cuando la persona toca el botón, y si lo niega se explica cómo activarlo.
 */
export function useMiUbicacion() {
  const [permitida, setPermitida] = useState(false);

  const obtener = useCallback(async (): Promise<Coordenada | null> => {
    try {
      const permiso = await Location.requestForegroundPermissionsAsync();
      if (permiso.status !== 'granted') {
        Alert.alert(
          'Ubicación desactivada',
          'Para centrar el mapa donde estás, permite que VoyBus use tu ubicación en los ajustes del teléfono.',
          [
            { text: 'Ahora no', style: 'cancel' },
            { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
          ],
        );
        return null;
      }
      setPermitida(true);
      const posicion = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return { latitude: posicion.coords.latitude, longitude: posicion.coords.longitude };
    } catch {
      Alert.alert(
        'No se encontró tu ubicación',
        'Revisa que el GPS esté encendido e inténtalo de nuevo.',
      );
      return null;
    }
  }, []);

  return { permitida, obtener };
}
