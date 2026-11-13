import { API_URL } from '../config';

/** Error de la API con el formato { error: { code, message, details } }. */
export interface DetalleError {
  campo: string;
  mensaje: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public detalles: DetalleError[] = [],
  ) {
    super(message);
  }

  /** Mensaje listo para mostrar: el general más el motivo de cada campo inválido. */
  get textoCompleto() {
    if (this.detalles.length === 0) return this.message;
    return `${this.message}:\n${this.detalles.map((d) => `• ${d.mensaje}`).join('\n')}`;
  }
}

/** Texto para mostrar al usuario a partir de cualquier error. */
export function textoDeError(e: unknown) {
  return e instanceof ApiError ? e.textoCompleto : 'Ocurrió un error inesperado.';
}

// Usuario de prueba (hasta que Daslav tenga el login). Lo cambia UsuarioProvider.
let usuarioId: number | null = null;
export function fijarUsuario(id: number | null) {
  usuarioId = id;
}

// JWT emitido por ACC-01 al verificar el contacto o entrar como invitado.
// Queda listo para cuando el backend reemplace el encabezado x-user-id por el token.
let token: string | null = null;
export function fijarToken(nuevo: string | null) {
  token = nuevo;
}

interface Respuesta<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export async function api<T>(
  ruta: string,
  opciones: { method?: string; body?: unknown } = {},
): Promise<Respuesta<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opciones.body !== undefined) headers['Content-Type'] = 'application/json';
  if (usuarioId !== null) headers['x-user-id'] = String(usuarioId);
  if (token !== null) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${ruta}`, {
      method: opciones.method ?? 'GET',
      headers,
      body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
    });
  } catch {
    throw new ApiError(
      0,
      'SIN_CONEXION',
      'No se pudo conectar con el servidor. Revisa tu conexión.',
    );
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      json?.error?.code ?? 'ERROR',
      json?.error?.message ?? 'Ocurrió un error inesperado.',
      json?.error?.details ?? [],
    );
  }
  return json as Respuesta<T>;
}
