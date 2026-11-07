-- VoyBus · Esquema SQLite (fuente de verdad de la base de datos)
-- Fechas en texto ISO-8601 UTC. Booleanos como INTEGER 0/1.

PRAGMA foreign_keys = ON;

-- ───────── Acceso y avisos ─────────
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rol TEXT NOT NULL CHECK (rol IN ('pasajero','conductor','administrador')),
  nombre_visible TEXT NOT NULL,
  alias TEXT UNIQUE,
  correo TEXT UNIQUE,
  telefono TEXT UNIQUE,
  password_hash TEXT,
  estado TEXT NOT NULL DEFAULT 'habilitado' CHECK (estado IN ('habilitado','deshabilitado','sin_verificar')),
  dos_factores_activo INTEGER NOT NULL DEFAULT 0 CHECK (dos_factores_activo IN (0,1)),
  tipo_acceso TEXT NOT NULL DEFAULT 'registrado' CHECK (tipo_acceso IN ('registrado','invitado')),
  identificador TEXT UNIQUE,
  datos_contacto TEXT,
  fecha_registro TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ───────── Red de transporte ─────────
CREATE TABLE IF NOT EXISTS lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#1E5FC9',
  estado_servicio TEXT NOT NULL DEFAULT 'activa' CHECK (estado_servicio IN ('activa','suspendida','desactivada'))
);

CREATE TABLE IF NOT EXISTS recorridos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  linea_id INTEGER NOT NULL REFERENCES lineas(id) ON DELETE CASCADE,
  sentido TEXT NOT NULL CHECK (sentido IN ('ida','vuelta')),
  dias_funcionamiento TEXT NOT NULL,
  horarios TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  UNIQUE (linea_id, sentido)
);

CREATE TABLE IF NOT EXISTS paraderos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  latitud REAL NOT NULL CHECK (latitud BETWEEN -90 AND 90),
  longitud REAL NOT NULL CHECK (longitud BETWEEN -180 AND 180),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1))
);

CREATE TABLE IF NOT EXISTS recorrido_paraderos (
  recorrido_id INTEGER NOT NULL REFERENCES recorridos(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL CHECK (orden >= 1),
  paradero_id INTEGER NOT NULL REFERENCES paraderos(id),
  PRIMARY KEY (recorrido_id, orden),
  UNIQUE (recorrido_id, paradero_id)
);

-- ───────── Flota y turnos ─────────
CREATE TABLE IF NOT EXISTS vehiculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identificador TEXT NOT NULL UNIQUE,
  patente TEXT NOT NULL UNIQUE,
  capacidad INTEGER NOT NULL CHECK (capacidad > 0),
  estado_operativo TEXT NOT NULL DEFAULT 'operativo'
    CHECK (estado_operativo IN ('operativo','operativo_con_observaciones','en_mantenimiento','fuera_de_servicio')),
  habilitado INTEGER NOT NULL DEFAULT 1 CHECK (habilitado IN (0,1))
);

CREATE TABLE IF NOT EXISTS turnos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conductor_id INTEGER NOT NULL REFERENCES usuarios(id),
  vehiculo_id INTEGER NOT NULL REFERENCES vehiculos(id),
  inicio_planificado TEXT NOT NULL,
  termino_planificado TEXT NOT NULL,
  inicio_real TEXT,
  termino_real TEXT,
  estado_vehiculo_recibido TEXT,
  estado_vehiculo_entregado TEXT,
  justificacion_atraso TEXT,
  estado TEXT NOT NULL DEFAULT 'programado' CHECK (estado IN ('programado','en_curso','finalizado')),
  CHECK (termino_planificado > inicio_planificado)
);
CREATE INDEX IF NOT EXISTS idx_turnos_conductor ON turnos(conductor_id, inicio_planificado);
CREATE INDEX IF NOT EXISTS idx_turnos_vehiculo ON turnos(vehiculo_id, inicio_planificado);

CREATE TABLE IF NOT EXISTS incidencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conductor_id INTEGER NOT NULL REFERENCES usuarios(id),
  vehiculo_id INTEGER NOT NULL REFERENCES vehiculos(id),
  turno_id INTEGER REFERENCES turnos(id),
  tipo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS historial_estado_vehiculo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehiculo_id INTEGER NOT NULL REFERENCES vehiculos(id),
  responsable_id INTEGER NOT NULL REFERENCES usuarios(id),
  estado_anterior TEXT NOT NULL,
  estado_nuevo TEXT NOT NULL,
  motivo TEXT,
  fecha TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS configuracion_sistema (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  margen_tolerancia_min INTEGER NOT NULL DEFAULT 5 CHECK (margen_tolerancia_min >= 0),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
INSERT OR IGNORE INTO configuracion_sistema (id) VALUES (1);

-- ───────── Viajes y solicitudes ─────────
CREATE TABLE IF NOT EXISTS viajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turno_id INTEGER NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  recorrido_id INTEGER NOT NULL REFERENCES recorridos(id),
  orden_en_turno INTEGER NOT NULL CHECK (orden_en_turno >= 1),
  inicio_planificado TEXT NOT NULL,
  termino_planificado TEXT NOT NULL,
  inicio_real TEXT,
  termino_real TEXT,
  ultimo_orden_superado INTEGER NOT NULL DEFAULT 0,
  justificacion_atraso TEXT,
  estado TEXT NOT NULL DEFAULT 'programado' CHECK (estado IN ('programado','en_curso','finalizado')),
  UNIQUE (turno_id, orden_en_turno)
);

CREATE TABLE IF NOT EXISTS ubicaciones_vehiculo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  viaje_id INTEGER NOT NULL REFERENCES viajes(id) ON DELETE CASCADE,
  latitud REAL NOT NULL,
  longitud REAL NOT NULL,
  registrado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ubicaciones_viaje ON ubicaciones_vehiculo(viaje_id, registrado_en);

CREATE TABLE IF NOT EXISTS solicitudes_parada (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  viaje_id INTEGER NOT NULL REFERENCES viajes(id) ON DELETE CASCADE,
  pasajero_id INTEGER NOT NULL REFERENCES usuarios(id),
  paradero_id INTEGER NOT NULL REFERENCES paraderos(id),
  estado TEXT NOT NULL DEFAULT 'enviada' CHECK (estado IN ('enviada','proxima','cerrada')),
  motivo_cierre TEXT,
  creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  cerrada_en TEXT
);
-- Un pasajero solo puede tener una solicitud abierta por viaje
CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitud_abierta
  ON solicitudes_parada(viaje_id, pasajero_id) WHERE estado <> 'cerrada';

-- ───────── Favoritos y notificaciones ─────────
CREATE TABLE IF NOT EXISTS favoritos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  linea_id INTEGER REFERENCES lineas(id) ON DELETE CASCADE,
  paradero_id INTEGER REFERENCES paraderos(id) ON DELETE CASCADE,
  CHECK ((linea_id IS NOT NULL) + (paradero_id IS NOT NULL) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fav_linea ON favoritos(usuario_id, linea_id) WHERE linea_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fav_paradero ON favoritos(usuario_id, paradero_id) WHERE paradero_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notificaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  leida INTEGER NOT NULL DEFAULT 0 CHECK (leida IN (0,1))
);
