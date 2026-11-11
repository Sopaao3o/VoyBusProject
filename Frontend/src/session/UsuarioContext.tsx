import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { fijarUsuario } from '../api/client';
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
  cambiarUsuario: (u: UsuarioPrueba) => void;
}

const UsuarioContext = createContext<Contexto | null>(null);

export function UsuarioProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioPrueba>(USUARIOS_PRUEBA[0]);
  fijarUsuario(usuario.id);

  const cambiarUsuario = useCallback((u: UsuarioPrueba) => {
    fijarUsuario(u.id);
    setUsuario(u);
  }, []);

  const valor = useMemo(() => ({ usuario, cambiarUsuario }), [usuario, cambiarUsuario]);
  return <UsuarioContext.Provider value={valor}>{children}</UsuarioContext.Provider>;
}

export function useUsuario() {
  const ctx = useContext(UsuarioContext);
  if (!ctx) throw new Error('useUsuario debe usarse dentro de UsuarioProvider');
  return ctx;
}
