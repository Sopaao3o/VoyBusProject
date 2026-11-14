// Formas de los datos que devuelve el backend (ver Backend/README.md).

export type EstadoServicio = 'activa' | 'suspendida';

export interface Linea {
  id: number;
  codigo: string;
  nombre: string;
  color: string;
  estado_servicio: EstadoServicio;
  aviso?: string;
  /** Primer y último paradero del recorrido de ida (no vienen dentro del detalle de un paradero). */
  punto_inicio?: string | null;
  punto_termino?: string | null;
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

export type Sentido = 'ida' | 'vuelta';

/** Una línea que pasa por un paradero, con los sentidos (recorridos) en que lo hace. */
export interface LineaDeParadero extends Linea {
  sentidos: Sentido[];
  recorridos: { id: number; sentido: Sentido }[];
}

export interface ParaderoDetalle extends Paradero {
  lineas: LineaDeParadero[];
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
  inicio_real?: string | null;
  termino_real?: string | null;
  justificacion_atraso?: string | null;
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

// ───── VEH-03: vista del conductor ─────

export type EstadoPuntualidad = 'a_tiempo' | 'atraso' | 'termino_anticipado';

export interface Puntualidad {
  minutos: number;
  estado: EstadoPuntualidad;
}

export interface EvaluacionHoras {
  inicio: Puntualidad | null;
  termino: Puntualidad | null;
}

export type EstadoVehiculo =
  'operativo' | 'operativo_con_observaciones' | 'en_mantenimiento' | 'fuera_de_servicio';

export interface ViajeConductor extends ViajeDeTurno {
  evaluacion: EvaluacionHoras;
}

export interface TurnoConductor extends Omit<TurnoDetalle, 'viajes'> {
  inicio_real: string | null;
  termino_real: string | null;
  justificacion_atraso: string | null;
  estado_vehiculo_recibido: EstadoVehiculo | null;
  estado_vehiculo_entregado: EstadoVehiculo | null;
  evaluacion: EvaluacionHoras;
  viajes: ViajeConductor[];
}

export interface EstadoVehiculoBody {
  estado_vehiculo: 'operativo' | 'operativo_con_observaciones' | 'fuera_de_servicio';
  descripcion?: string;
}

export interface GrupoSolicitudes {
  paradero: { id: number; codigo: string; nombre: string; orden: number };
  total: number;
  solicitudes: { id: number; pasajero_nombre: string; estado: string; creada_en: string }[];
}

// ───── VIA-02: pasajero ─────

export interface ViajeEnCurso {
  id: number;
  linea_codigo: string;
  linea_nombre: string;
  sentido: 'ida' | 'vuelta';
  vehiculo_identificador: string;
  ultimo_orden_superado: number;
}

export type EstadoSolicitud = 'enviada' | 'proxima' | 'cerrada';

export interface SolicitudParada {
  id: number;
  viaje_id: number;
  estado: EstadoSolicitud;
  motivo_cierre: 'paradero_superado' | 'viaje_finalizado' | null;
  motivo_cierre_texto: string | null;
  creada_en: string;
  cerrada_en: string | null;
  paradero: { id: number; codigo: string; nombre: string; orden: number | null };
}

export interface ParaderosDisponibles {
  viaje: {
    id: number;
    estado: string;
    sentido: 'ida' | 'vuelta';
    linea_codigo: string;
    linea_nombre: string;
    ultimo_orden_superado: number;
  };
  paraderos: ParaderoDeRecorrido[];
  mi_solicitud: SolicitudParada | null;
}

// ───── ACC-01: registro de pasajero ─────

export type CanalVerificacion = 'correo' | 'telefono';

/** Cuenta tal como la devuelve la API (sin contraseña ni código). */
export interface UsuarioSesion {
  id: number;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  rol: Rol;
  estado: string;
  tipo_acceso: string;
  correo_verificado: boolean;
  telefono_verificado: boolean;
  dos_factores_activo: boolean;
  fecha_registro: string;
}

export interface RegistroPasajeroBody {
  nombre: string;
  correo?: string;
  telefono?: string;
  password: string;
  confirmacion: string;
  acepta_terminos: true;
}

export interface VerificacionPendiente {
  requerida: boolean;
  canal: CanalVerificacion;
  expira_en: string;
  /** Solo en desarrollo: el backend no tiene servicio de correo/SMS todavía. */
  codigo_desarrollo?: string;
}

export interface RegistroPasajeroRespuesta {
  usuario: UsuarioSesion;
  verificacion: VerificacionPendiente;
}

export interface VerificarContactoBody {
  correo?: string;
  telefono?: string;
  codigo: string;
}

export interface SesionAutenticada {
  usuario: UsuarioSesion;
  token: string;
  token_type: 'Bearer';
  expira_en: string;
}

// ───── ACC-02 a ACC-04: sesión, 2FA y contraseña ─────

export interface InicioSesionBody {
  correo?: string;
  telefono?: string;
  password: string;
}

/** La contraseña fue correcta, pero la cuenta pide el código de la app autenticadora. */
export interface Desafio2fa {
  requiere_2fa: true;
  usuario: UsuarioSesion;
  desafio: string;
  expira_en: string;
}

export type RespuestaInicioSesion = SesionAutenticada | Desafio2fa;

export interface Configuracion2fa {
  secreto: string;
  cuenta: string;
  emisor: string;
  otpauth_url: string;
  instrucciones: string;
}

export interface Respuesta2fa {
  mensaje: string;
  usuario: UsuarioSesion;
}

export interface RespuestaRecuperacion {
  mensaje: string;
  /** Solo en desarrollo: el backend no tiene servicio de correo todavía. */
  token_desarrollo?: string;
  expira_en?: string;
}

export interface CambioPasswordBody {
  password_actual: string;
  password: string;
  confirmacion: string;
}

export interface RespuestaCambioPassword {
  mensaje: string;
  token: string;
  token_type: 'Bearer';
  expira_en: string;
}
