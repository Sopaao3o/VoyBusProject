import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../api/client';

/** Ejecuta una consulta a la API y entrega { datos, cargando, error, recargar }. */
export function useApi<T>(consulta: () => Promise<T>, dependencias: unknown[] = []) {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ultima = useRef(0); // si llegan respuestas desordenadas, solo vale la última consulta

  // La consulta cambia en cada render; solo se vuelve a ejecutar cuando cambian las dependencias.
  const ejecutar = useCallback(consulta, dependencias);

  const recargar = useCallback(async () => {
    const numero = ++ultima.current;
    setCargando(true);
    setError(null);
    try {
      const resultado = await ejecutar();
      if (numero === ultima.current) setDatos(resultado);
    } catch (e) {
      if (numero === ultima.current) {
        setError(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado.');
      }
    } finally {
      if (numero === ultima.current) setCargando(false);
    }
  }, [ejecutar]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { datos, cargando, error, recargar };
}
