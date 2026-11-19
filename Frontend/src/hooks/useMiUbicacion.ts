import * as Location from 'expo-location';
import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';

export interface Coordenada {
  latitude: number;
  longitude: number;
}

async function leerPosicion(): Promise<Coordenada> {
  const posicion = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return { latitude: posicion.coords.latitude, longitude: posicion.coords.longitude };
}

/**
 * Ubicación del teléfono (RNF-12): para centrar el mapa y buscar el paradero más cercano.
 * El permiso se pide recién cuando la persona toca un botón, y si lo niega se explica cómo
 * activarlo. `actualizarSiPermitida` nunca pregunta: solo lee la posición si ya hay permiso.
 */
export function useMiUbicacion() {
  const [permitida, setPermitida] = useState<boolean | null>(null); // null = aún no se sabe
  const [posicion, setPosicion] = useState<Coordenada | null>(null);

  const obtener = useCallback(async (): Promise<Coordenada | null> => {
    try {
      const permiso = await Location.requestForegroundPermissionsAsync();
      if (permiso.status !== 'granted') {
        setPermitida(false);
        Alert.alert(
          'Ubicación desactivada',
          'Para ubicarte en el mapa y mostrar tu paradero más cercano, permite que VoyBus use tu ubicación en los ajustes del teléfono.',
          [
            { text: 'Ahora no', style: 'cancel' },
            { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
          ],
        );
        return null;
      }
      setPermitida(true);
      const punto = await leerPosicion();
      setPosicion(punto);
      return punto;
    } catch {
      Alert.alert(
        'No se encontró tu ubicación',
        'Revisa que el GPS esté encendido e inténtalo de nuevo.',
      );
      return null;
    }
  }, []);

  const actualizarSiPermitida = useCallback(async () => {
    try {
      const permiso = await Location.getForegroundPermissionsAsync();
      setPermitida(permiso.granted);
      if (permiso.granted) setPosicion(await leerPosicion());
    } catch {
      // Sin GPS en este momento: se mantiene la última posición conocida.
    }
  }, []);

  return { permitida, posicion, obtener, actualizarSiPermitida };
}
