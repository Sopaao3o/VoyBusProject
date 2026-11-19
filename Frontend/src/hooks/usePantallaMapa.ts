import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';

/**
 * En las pantallas con mapa no hay barra azul arriba: la hora y la batería se muestran
 * en oscuro mientras la pantalla está visible, y vuelven a blanco al salir.
 */
export function usePantallaMapa() {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('dark');
      return () => setStatusBarStyle('light');
    }, []),
  );
}
