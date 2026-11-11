import { useCallback, useEffect, useRef, useState } from 'react';

import { textoDeError } from '../api/client';

/**
 * Ejecuta una consulta a la API y entrega { datos, cargando, error, recargar }.
 * La consulta se repite cuando cambia algún valor de `dependencias` (deben ser números o textos).
 */
export function useApi<T>(
  consulta: () => Promise<T>,
  dependencias: (string | number | null)[] = [],
) {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ultima = useRef(0); // si llegan respuestas desordenadas, solo vale la última consulta

  // Guarda la consulta más reciente sin volver a crear `recargar` en cada render.
  const consultaActual = useRef(consulta);
  useEffect(() => {
    consultaActual.current = consulta;
  });

  const recargar = useCallback(async () => {
    const numero = ++ultima.current;
    setCargando(true);
    setError(null);
    try {
      const resultado = await consultaActual.current();
      if (numero === ultima.current) setDatos(resultado);
    } catch (e) {
      if (numero === ultima.current) setError(textoDeError(e));
    } finally {
      if (numero === ultima.current) setCargando(false);
    }
  }, []);

  const clave = JSON.stringify(dependencias);
  useEffect(() => {
    // Cargar datos al abrir la pantalla o al cambiar las dependencias es justo lo que se busca aquí.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recargar();
  }, [recargar, clave]);

  return { datos, cargando, error, recargar };
}
