import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useApi } from './useApi';

/** Cada cuánto se actualizan las posiciones en pantalla (RED-03: sin recargar a mano). */
export const ACTUALIZAR_CADA_MS = 5000;

/**
 * Como useApi, pero repite la consulta cada 5 segundos mientras la pantalla está visible.
 * Al salir de la pantalla deja de consultar, para no gastar datos ni batería.
 */
export function useEnVivo<T>(
  consulta: () => Promise<T>,
  dependencias: (string | number | null)[] = [],
  activo = true,
) {
  const resultado = useApi(consulta, dependencias);
  const { recargar } = resultado;

  useFocusEffect(
    useCallback(() => {
      if (!activo) return undefined;
      const t = setInterval(recargar, ACTUALIZAR_CADA_MS);
      return () => clearInterval(t);
    }, [recargar, activo]),
  );

  return resultado;
}
