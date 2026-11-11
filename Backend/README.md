# VoyBus · Backend

API REST de VoyBus con Node.js (v22 o superior), Express 5 y SQLite (Sequelize + Umzug).
Todo el proyecto funciona sin servicios de pago: la base de datos es un archivo local.

## Ejecutar

```bash
cd Backend
npm install
cp .env.example .env        # en Windows (PowerShell): Copy-Item .env.example .env
npm run db:reset            # crea la base con las migraciones y los datos de ejemplo
npm run dev                 # reinicia solo al guardar cambios
```

Comprobar: <http://localhost:3000/api/health> y <http://localhost:3000/api/v1/lineas>.

## Scripts

| Comando                | Qué hace                                                       |
| ---------------------- | -------------------------------------------------------------- |
| `npm start`            | Arranca el servidor                                            |
| `npm run dev`          | Arranca con recarga automática                                 |
| `npm run db:migrar`    | Aplica las migraciones pendientes                              |
| `npm run db:reset`     | Borra la base, aplica las migraciones y carga datos de ejemplo |
| `npm test`             | Ejecuta las pruebas automáticas (54)                           |
| `npm run lint`         | Revisa el código con ESLint                                    |
| `npm run format`       | Da formato a todos los archivos con Prettier                   |
| `npm run format:check` | Comprueba el formato sin modificar nada                        |

## Estructura

```
Backend/
├── src/
│   ├── app.js                  # Express: middlewares, rutas y manejo de errores
│   ├── server.js               # arranque: base de datos, migraciones y servidor
│   ├── config/                 # conexión SQLite y configuración de Zod (mensajes en español)
│   ├── database/
│   │   ├── migrations/         # una migración por cambio de esquema (Umzug)
│   │   ├── models/             # modelos Sequelize y sus relaciones
│   │   ├── seeders/            # datos de ejemplo
│   │   └── run.js              # npm run db:migrar / db:reset
│   ├── middleware/
│   │   ├── auth.js             # PLACEHOLDER de autenticación (ver más abajo)
│   │   └── validar.js          # valida params, query y body con Zod
│   ├── modules/
│   │   ├── red/                # RED-01 y RED-02
│   │   ├── turnos/             # ADM-03
│   │   ├── conductor/          # VEH-03
│   │   └── viajes/             # VIA-02 y simulador
│   ├── routes/health.routes.js
│   └── utils/httpErrors.js
└── test/                       # pruebas con node:test
```

Cada módulo sigue las capas `routes → controller → service → models`:
las rutas validan, el controlador responde y el servicio guarda las reglas de negocio.

## Convenciones de la API

- Prefijo `/api/v1`. Las respuestas correctas son `{ "data": ..., "meta": ... }`.
- Los errores son `{ "error": { "code", "message", "details" } }` con estos códigos:
  `400 SOLICITUD_INVALIDA / VALIDACION`, `401 NO_AUTENTICADO`, `403 SIN_PERMISO`,
  `404 NO_ENCONTRADO`, `409 CONFLICTO`.
- Las fechas se guardan y envían en formato ISO 8601.

## Autenticación (provisoria)

`src/middleware/auth.js` es un placeholder mientras se implementan las sesiones:

- `requireRole(...roles)` deja pasar todo.
- `usuarioActual(req)` lee el encabezado `x-user-id` (401 si falta).

Para reemplazarlo solo hay que cambiar el cuerpo de esas dos funciones; las rutas ya las usan.

Usuarios de ejemplo: `1` administrador, `2` Carlos Rojas y `3` María Soto (conductores),
`4` Luis Pérez (conductor deshabilitado), `5` Ana Pasajera.

## Endpoints

### Red de transporte (RED-01, RED-02) · públicos

| Método y ruta                | Descripción                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `GET /api/v1/lineas?q=`      | Líneas activas y suspendidas (con aviso). `q` busca por código o nombre, sin tildes. |
| `GET /api/v1/lineas/:id`     | Línea con sus recorridos (ida/vuelta), días, horarios y paraderos en orden.          |
| `GET /api/v1/recorridos/:id` | Un recorrido con sus paraderos ordenados.                                            |
| `GET /api/v1/paraderos?q=`   | Paraderos activos con coordenadas.                                                   |
| `GET /api/v1/paraderos/:id`  | Paradero y las líneas que pasan por él.                                              |

### Gestión de turnos (ADM-03) · administrador

| Método y ruta                     | Descripción                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/v1/admin/turnos`        | Lista turnos, con filtros por fecha y conductor.                               |
| `GET /api/v1/admin/turnos/:id`    | Detalle de un turno con sus viajes.                                            |
| `POST /api/v1/admin/turnos`       | Crea un turno con sus viajes. Rechaza superposiciones de conductor o vehículo. |
| `PUT /api/v1/admin/turnos/:id`    | Modifica un turno que aún no empieza.                                          |
| `GET /api/v1/admin/configuracion` | Margen de tolerancia por defecto.                                              |
| `PUT /api/v1/admin/configuracion` | Cambia el margen por defecto (cada turno guarda el suyo).                      |

### Turnos y vehículo (VEH-03) · conductor

| Método y ruta                                         | Descripción                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| `GET /api/v1/conductor/turnos`                        | Mis turnos con vehículo y recorridos.                           |
| `GET /api/v1/conductor/turnos/:id`                    | Detalle de uno de mis turnos.                                   |
| `POST /api/v1/conductor/turnos/:id/iniciar`           | Inicia el turno y registra el estado del vehículo.              |
| `POST /api/v1/conductor/turnos/:id/finalizar`         | Finaliza el turno y registra el estado del vehículo.            |
| `POST /api/v1/conductor/turnos/:id/estado-vehiculo`   | Cambia el estado del vehículo (con observación si corresponde). |
| `POST /api/v1/conductor/turnos/:id/incidencias`       | Registra una incidencia del vehículo o del recorrido.           |
| `PUT /api/v1/conductor/turnos/:id/justificacion`      | Justifica atraso o término anticipado del turno.                |
| `POST /api/v1/conductor/viajes/:id/iniciar`           | Inicia un viaje (en orden y con el turno en curso).             |
| `POST /api/v1/conductor/viajes/:id/finalizar`         | Finaliza el viaje y cierra sus solicitudes de parada.           |
| `GET /api/v1/conductor/viajes/:id/solicitudes-parada` | Solicitudes abiertas agrupadas por paradero, en orden.          |
| `PUT /api/v1/conductor/viajes/:id/justificacion`      | Justifica atraso o término anticipado del viaje.                |
| `GET /api/v1/admin/incidencias`                       | (administrador) Incidencias registradas por los conductores.    |
| `GET /api/v1/admin/vehiculos/:id/historial`           | (administrador) Historial de estados de un vehículo.            |

### Solicitud de parada (VIA-02) · pasajero

| Método y ruta                                   | Descripción                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/v1/viajes/:id/paraderos-disponibles`  | Paraderos del recorrido que el vehículo aún no supera.                  |
| `POST /api/v1/viajes/:id/solicitudes-parada`    | Solicita parada. Body: `{ "paradero_id": 3 }`. Una pendiente por viaje. |
| `GET /api/v1/viajes/:id/solicitudes-parada/mia` | Mi solicitud y su estado.                                               |

Estados de una solicitud: `enviada` → `proxima` (es el siguiente paradero) → `cerrada`
(motivo `paradero_superado` o `viaje_finalizado`).

### Simulador (solo desarrollo)

Existe mientras `NODE_ENV` no sea `production`. Mueve el vehículo para probar sin GPS real:

| Método y ruta                               | Descripción                               |
| ------------------------------------------- | ----------------------------------------- |
| `POST /api/v1/simulador/viajes/:id/avanzar` | Avanza el vehículo al siguiente paradero. |

## Base de datos

- SQLite en modo WAL, con una sola conexión y transacciones inmediatas.
- Dentro de `sequelize.transaction(...)` toda consulta debe recibir `{ transaction }`;
  si no, queda esperando la única conexión.
- Cambios de esquema: crear una migración nueva en `src/database/migrations/`
  (no editar las ya aplicadas).

## Pendiente

- Autenticación real (sesiones) en `src/middleware/auth.js`.
- Comprobar la vinculación del pasajero al viaje (VIA-01) en `viajes.service`.
