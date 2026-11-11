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

// ───── ADM-03: turnos ─────

export type EstadoTurno = 'programado' | 'en_curso' | 'finalizado';

export interface TurnoResumen {
  id: number;
  conductor_id: number;
  conductor_nombre: string;
  vehiculo_id: number;
  vehiculo_identificador: string;
  inicio_planificado: string;
  termino_planificado: string;
  margen_tolerancia_min: number;
  estado: EstadoTurno;
}

export interface ViajeDeTurno {
  id: number;
  orden_en_turno: number;
  recorrido_id: number;
  inicio_planificado: string;
  termino_planificado: string;
  sentido: 'ida' | 'vuelta';
  linea_id: number;
  linea_codigo: string;
  linea_nombre: string;
  estado: string;
}

export interface TurnoDetalle extends TurnoResumen {
  vehiculo: { identificador: string; patente: string; estado_operativo: string };
  viajes: ViajeDeTurno[];
}

export interface ConductorOpcion {
  id: number;
  nombre: string;
  habilitado: boolean;
}

export interface VehiculoOpcion {
  id: number;
  identificador: string;
  patente: string;
  capacidad: number;
  estado_operativo: string;
  asignable: boolean;
}

export interface ViajeNuevo {
  recorrido_id: number;
  inicio_planificado: string;
  termino_planificado: string;
}

export interface TurnoNuevo {
  conductor_id: number;
  vehiculo_id: number;
  inicio_planificado: string;
  termino_planificado: string;
  margen_tolerancia_min?: number;
  viajes: ViajeNuevo[];
}

export interface Configuracion {
  margen_tolerancia_min: number;
  actualizado_en: string | null;
}
