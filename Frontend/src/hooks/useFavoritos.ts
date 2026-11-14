import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { listarParaderosFavoritos } from '../api/favoritos';
import type { Paradero } from '../api/tipos';
import { useUsuario } from '../session/UsuarioContext';
import { useApi } from './useApi';

const SIN_FAVORITOS: Paradero[] = [];

/**
 * Paraderos favoritos de la cuenta. Solo los pasajeros registrados pueden tenerlos:
 * para los demás (sin sesión, invitados, otros roles) `disponible` es false y no se consulta nada.
 */
export function useFavoritos() {
  const { usuario } = useUsuario();
  const disponible = usuario?.rol === 'pasajero' && usuario.tipo_acceso !== 'invitado';

  const { datos, cargando, error, recargar } = useApi(
    () => (disponible ? listarParaderosFavoritos() : Promise.resolve(SIN_FAVORITOS)),
    [usuario?.id ?? null, disponible ? 1 : 0],
  );

  // Al volver a la pantalla se actualiza (pudo cambiar desde el detalle de un paradero).
  useFocusEffect(
    useCallback(() => {
      recargar();
    }, [recargar]),
  );

  const favoritos = datos ?? SIN_FAVORITOS;
  const ids = useMemo(() => new Set(favoritos.map((p) => p.id)), [favoritos]);
  return { disponible, favoritos, ids, cargando, error, recargar };
}
