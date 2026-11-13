import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { fijarToken, fijarUsuario } from '../api/client';
import type { Rol } from '../api/tipos';

export interface UsuarioPrueba {
  id: number;
  nombre: string;
  rol: Rol;
}

// Usuarios de ejemplo del backend (npm run db:reset). Reemplazar por el login real de Daslav.
export const USUARIOS_PRUEBA: UsuarioPrueba[] = [
  { id: 5, nombre: 'Ana Pasajera', rol: 'pasajero' },
  { id: 2, nombre: 'Carlos Rojas', rol: 'conductor' },
  { id: 3, nombre: 'María Soto', rol: 'conductor' },
  { id: 1, nombre: 'Administrador', rol: 'administrador' },
];

interface Contexto {
  usuario: UsuarioPrueba;
  /** Usuarios de ejemplo más las cuentas creadas en esta sesión (ACC-01). */
  usuarios: UsuarioPrueba[];
  cambiarUsuario: (u: UsuarioPrueba) => void;
  /** Agrega (o actualiza) una cuenta registrada y la deja activa. */
  agregarUsuario: (u: UsuarioPrueba, token?: string | null) => void;
}

const UsuarioContext = createContext<Contexto | null>(null);

export function UsuarioProvider({ children }: { children: ReactNode }) {
  const [usuarios, setUsuarios] = useState<UsuarioPrueba[]>(USUARIOS_PRUEBA);
  const [usuario, setUsuario] = useState<UsuarioPrueba>(USUARIOS_PRUEBA[0]);
  fijarUsuario(usuario.id);

  const cambiarUsuario = useCallback((u: UsuarioPrueba) => {
    // Los usuarios de ejemplo no tienen JWT: se limpia el de una cuenta registrada.
    fijarToken(null);
    fijarUsuario(u.id);
    setUsuario(u);
  }, []);

  const agregarUsuario = useCallback((u: UsuarioPrueba, nuevoToken: string | null = null) => {
    setUsuarios((lista) => [...lista.filter((x) => x.id !== u.id), u]);
    fijarToken(nuevoToken);
    fijarUsuario(u.id);
    setUsuario(u);
  }, []);

  const valor = useMemo(
    () => ({ usuario, usuarios, cambiarUsuario, agregarUsuario }),
    [usuario, usuarios, cambiarUsuario, agregarUsuario],
  );
  return <UsuarioContext.Provider value={valor}>{children}</UsuarioContext.Provider>;
}

export function useUsuario() {
  const ctx = useContext(UsuarioContext);
  if (!ctx) throw new Error('useUsuario debe usarse dentro de UsuarioProvider');
  return ctx;
}
