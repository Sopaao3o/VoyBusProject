// Formas de los datos que devuelve el backend (ver Backend/README.md).

export type EstadoServicio = 'activa' | 'suspendida';

export interface Linea {
  id: number;
  codigo: string;
  nombre: string;
  color: string;
  estado_servicio: EstadoServicio;
  aviso?: string;
}

export interface Paradero {
  id: number;
  codigo: string;
  nombre: string;
  latitud: number;
  longitud: number;
}

export interface ParaderoDeRecorrido extends Paradero {
  orden: number;
}

export interface Recorrido {
  id: number;
  sentido: 'ida' | 'vuelta';
  dias_funcionamiento: string;
  horarios: string;
  paraderos: ParaderoDeRecorrido[];
}

export interface LineaDetalle extends Linea {
  recorridos: Recorrido[];
}

export interface ParaderoDetalle extends Paradero {
  lineas: Linea[];
}

export type Rol = 'administrador' | 'conductor' | 'pasajero';
