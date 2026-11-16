import { useEffect, useState } from 'react';

/** Devuelve `valor` solo después de que el usuario deja de escribir (evita una consulta por letra). */
export function useRetraso(valor: string, ms = 350) {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retrasado;
}
