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
| `npm test`             | Ejecuta las pruebas automáticas (127)                          |
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
│   │   ├── auth.js             # autenticación JWT y roles de las rutas privadas
│   │   └── validar.js          # valida params, query y body con Zod
│   ├── modules/
│   │   ├── auth/               # ACC-01 a ACC-04
│   │   ├── red/                # RED-01 y RED-02
│   │   ├── favoritos/          # RED-02: paraderos favoritos
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
  `400 SOLICITUD_INVALIDA / VALIDACION`, `401 NO_AUTENTICADO / TOKEN_INVALIDO / SESION_CERRADA`,
  `403 SIN_PERMISO`, `404 NO_ENCONTRADO`, `409 CONFLICTO`, `429 DEMASIADOS_INTENTOS`.
- Las fechas se guardan y envían en formato ISO 8601.

## Autenticación

ACC-01, ACC-02 y ACC-03 emiten, validan y cierran JWT (`Authorization: Bearer <token>`); ACC-04
usa ese mismo token para cambiar la contraseña. La verificación en dos pasos de ACC-01 y ACC-02
usa además un desafío temporal que **no** es una sesión. En `src/middleware/auth.js`:

- `crearAutenticacion({ models })` exige el JWT en las rutas privadas (`/admin`, `/conductor` y
  `/viajes`). Sin `Authorization` responde `401 NO_AUTENTICADO`; un token inválido, expirado o
  cerrado responde `401`; el válido deja la identidad en `req.auth`.
- `requireRole(...roles)` exige que `req.auth.rol` esté entre los roles permitidos
  (`403 SIN_PERMISO`).
- `usuarioActual(req)` devuelve el `usuarioId` del token; ya no existe el encabezado `x-user-id`.
- Cada JWT incluye `token_version`, la versión de sesiones de la cuenta, y el middleware la compara
  con `usuarios.token_version`. Si no coinciden, responde `401 SESION_CERRADA`: al cambiar o
  restablecer la contraseña se incrementa la versión y todos los tokens emitidos antes dejan de
  servir, aunque su firma y su vencimiento sigan siendo válidos.

El frontend debe enviar `Authorization: Bearer <token>` en todas las rutas privadas. Las cuentas
de ejemplo del selector de usuario todavía no tienen token: hasta que exista el login de ACC-02 en
la app, esas pantallas responderán `401`.

Al cerrar sesión se guarda la huella SHA-256 del token en `sesiones_revocadas` hasta que expira,
así que el token deja de servir también después de reiniciar el servidor. No se borra nada de la
cuenta: perfil, favoritos e historial se conservan.

Las cuentas de ejemplo usan la contraseña `Clave123!` y correos `@voybus.cl`; se cargan con
`npm run db:reset`:

- `1` Admin VoyBus · administrador · `admin@voybus.cl`
- `2` Carlos Rojas · conductor · `carlos.rojas@voybus.cl`
- `3` María Soto · conductor · `maria.soto@voybus.cl`
- `4` Luis Pérez · conductor deshabilitado · `luis.perez@voybus.cl`
- `5` Ana Pasajera · pasajero · `ana.pasajera@voybus.cl`

Seguridad de las cuentas:

- En producción (`NODE_ENV=production`) **no** se cargan las cuentas de ejemplo. El primer
  administrador se crea con `ADMIN_CORREO` y `ADMIN_PASSWORD` (ver `.env.example`).
- Una cuenta deshabilitada pierde el acceso de inmediato (`403 CUENTA_DESHABILITADA`), aunque su
  token siga vigente.
- Tras 5 códigos de verificación incorrectos hay que esperar, igual que en el inicio de sesión
  (`429 DEMASIADOS_INTENTOS`).

## Endpoints

### Registro de pasajero (ACC-01) · público

| Método y ruta                          | Descripción                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/v1/auth/registro`           | Crea una cuenta de pasajero y envía un código al contacto (ver abajo).                                                                                 |
| `POST /api/v1/auth/verificar-contacto` | Confirma el código, habilita la cuenta y devuelve un JWT.                                                                                              |
| `POST /api/v1/auth/reenviar-codigo`    | Envía un código nuevo a una cuenta sin verificar (`{ "correo" }` o `{ "telefono" }`). El anterior deja de servir; hay que esperar 60 s entre reenvíos. |
| `POST /api/v1/auth/invitado`           | Crea una cuenta temporal de pasajero invitado y devuelve un JWT.                                                                                       |

Cuerpo de `POST /api/v1/auth/registro`:

```json
{
  "nombre": "Ana Pérez",
  "correo": "ana@example.com",
  "password": "Clave123!",
  "confirmacion": "Clave123!",
  "acepta_terminos": true
}
```

También se acepta `"telefono": "+56912345678"` en lugar de `correo` (o ambos; se verifica el
correo si está presente). Reglas de ACC-01:

- Correo o teléfono no pueden repetir una cuenta existente (409 `CUENTA_DUPLICADA`).
- Contraseña de 8 a 15 caracteres con mayúscula, minúscula, número y símbolo.
- La confirmación debe coincidir y los términos de privacidad son obligatorios.
- El registro público siempre crea `rol: "pasajero"`; cualquier `rol` enviado se ignora.
- La cuenta queda `sin_verificar` hasta confirmar el código de 6 dígitos.

En desarrollo (`NODE_ENV` distinto de `production`) la respuesta incluye
`data.verificacion.codigo_desarrollo` para poder probar sin un servicio de correo/SMS.
En producción ese código se enviaría al contacto y no se expondría en la respuesta.

Cuerpo de `POST /api/v1/auth/verificar-contacto`:

```json
{ "correo": "ana@example.com", "codigo": "123456" }
```

### Inicio de sesión (ACC-02) · público

| Método y ruta                      | Descripción                                                      |
| ---------------------------------- | ---------------------------------------------------------------- |
| `POST /api/v1/auth/iniciar-sesion` | Ingresa con el correo o teléfono del registro y devuelve un JWT. |

Cuerpo (un solo medio de contacto y la contraseña):

```json
{ "correo": "ana@example.com", "password": "Clave123!" }
```

También se acepta `{ "telefono": "+56912345678", "password": "Clave123!" }`.

La respuesta tiene la misma forma que la verificación de ACC-01:
`{ "data": { "usuario": ..., "token": ..., "token_type": "Bearer", "expira_en": ... } }`.

Si la cuenta tiene la verificación en dos pasos activa, la respuesta no incluye `token`: incluye
`requiere_2fa` y un `desafio` que se cambia por la sesión en `/auth/2fa/verificar` (ver la sección
siguiente).

Reglas de ACC-02:

- El medio de contacto debe ser el usado al registrarse.
- Credenciales incorrectas responden `401 CREDENCIALES_INVALIDAS` con un mensaje general que no
  distingue si falló el contacto o la contraseña.
- Tras `LOGIN_MAX_INTENTOS` fallos dentro de `LOGIN_VENTANA_MINUTOS`, la cuenta espera
  `LOGIN_BLOQUEO_MINUTOS` y responde `429 DEMASIADOS_INTENTOS` con el encabezado `Retry-After`.
- Las cuentas `sin_verificar` responden `403 CUENTA_SIN_VERIFICAR` con instrucciones para
  completar la verificación; las `deshabilitadas` responden `403 CUENTA_DESHABILITADA`.
- Cuando la verificación en dos pasos está activa, la contraseña sola no inicia sesión: se exige el
  código de la aplicación autenticadora.

### Verificación en dos pasos (ACC-01 / ACC-02) · requiere JWT

ACC-01 permite activar la verificación en dos pasos con una aplicación autenticadora (TOTP,
SHA-1, 6 dígitos y pasos de 30 segundos). ACC-02 la exige al iniciar sesión si está activa.

| Método y ruta                      | Descripción                                                           |
| ---------------------------------- | --------------------------------------------------------------------- |
| `POST /api/v1/auth/2fa/iniciar`    | Genera el secreto y la URL `otpauth://` para el QR (requiere JWT).    |
| `POST /api/v1/auth/2fa/confirmar`  | Activa la 2FA al confirmar un código de 6 dígitos (requiere JWT).     |
| `POST /api/v1/auth/2fa/desactivar` | Desactiva la 2FA con la contraseña actual y un código (requiere JWT). |
| `POST /api/v1/auth/2fa/verificar`  | Cambia el desafío de ACC-02 por la sesión (público).                  |

**Iniciar:** sin cuerpo. Responde el secreto en base32, la URL para el QR y los datos que necesita
la aplicación autenticadora:

```json
{
  "data": {
    "secreto": "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
    "cuenta": "ana@example.com",
    "emisor": "VoyBus",
    "algoritmo": "SHA1",
    "digitos": 6,
    "periodo": 30,
    "otpauth_url": "otpauth://totp/VoyBus%3Aana%40example.com?secret=...&issuer=VoyBus&algorithm=SHA1&digits=6&period=30",
    "instrucciones": "Escanea el código QR con tu aplicación autenticadora y confirma el código de 6 dígitos"
  }
}
```

**Confirmar:** `{ "codigo": "123456" }`. Activa la cuenta (`usuario.dos_factores_activo: true`).
Un código incorrecto responde `400 CODIGO_2FA_INVALIDO` y no activa nada.

**Inicio de sesión con 2FA:** con la 2FA activa, `iniciar-sesion` responde `200` con
`{ "requiere_2fa": true, "desafio": "...", "expira_en": "..." }` y **no** entrega el token de
sesión. El desafío vence a los `DOS_FACTORES_MINUTOS` (5 por defecto) y no sirve para las rutas
privadas (`401 SEGUNDO_FACTOR_PENDIENTE`). Después se envía:

```json
{ "desafio": "...", "codigo": "123456" }
```

a `POST /api/v1/auth/2fa/verificar`; solo entonces se devuelve el JWT de sesión.

**Desactivar:** `{ "password_actual": "Clave123!", "codigo": "123456" }`.

Reglas de la 2FA:

- El código es de 6 dígitos, SHA-1 y cambia cada 30 s; se acepta un paso de margen por desfase de
  reloj. Cada código se puede usar una sola vez (`dos_factores_ultimo_paso`).
- Tras `LOGIN_MAX_INTENTOS` códigos incorrectos se aplica la misma espera de ACC-02
  (`429 DEMASIADOS_INTENTOS` con `Retry-After`).
- Las cuentas de invitado no pueden activarla (`403 CUENTA_INVITADA`).
- Si una cuenta tiene `dos_factores_activo` pero no tiene secreto (datos antiguos), el inicio de
  sesión responde `403 SEGUNDO_FACTOR_NO_CONFIGURADO` en vez de omitir el segundo factor.
- El secreto se guarda en la cuenta para poder validar los códigos. En producción conviene
  cifrarlo en la base de datos.

### Cierre de sesión (ACC-03) · requiere JWT

| Método y ruta                     | Descripción                                      |
| --------------------------------- | ------------------------------------------------ |
| `POST /api/v1/auth/cerrar-sesion` | Cierra la sesión del token y lo deja sin acceso. |

Encabezado `Authorization: Bearer <token>` y cuerpo con la confirmación explícita:

```json
{ "confirmar": true }
```

Respuesta `200`:

```json
{
  "data": {
    "sesion_cerrada": true,
    "ya_estaba_cerrada": false,
    "cerrada_en": "2026-11-13T12:00:00.000Z"
  }
}
```

Reglas de ACC-03:

- `confirmar: true` es obligatorio; sin él responde `400 VALIDACION` en `body.confirmar`.
- Sin `Authorization` responde `401 NO_AUTENTICADO`; con un encabezado mal formado o un token con
  firma inválida responde `401 TOKEN_INVALIDO`.
- Es idempotente: cerrar dos veces (o con un token ya vencido) responde `200` con
  `ya_estaba_cerrada: true`. Así el reintento tras un fallo de conexión nunca deja un error.
- El token cerrado responde `401 SESION_CERRADA` en cualquier ruta privada, aunque el cliente
  vuelva con el botón "atrás"; la huella queda guardada en `sesiones_revocadas` hasta su
  expiración.
- Solo se cierra la sesión de ese token: otros inicios de sesión de la misma cuenta siguen
  vigentes. No se elimina el perfil, ni los favoritos, ni el historial.
- La confirmación en pantalla y el borrado del token en el dispositivo pertenecen al frontend de
  ACC-03 (aún no implementado).

### Recuperar y cambiar contraseña (ACC-04)

| Método y ruta                            | Descripción                                                        |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `POST /api/v1/auth/recuperar-password`   | Envía un enlace temporal al correo verificado (público).           |
| `POST /api/v1/auth/restablecer-password` | Consume el enlace temporal y define la nueva contraseña (público). |
| `POST /api/v1/auth/cambiar-password`     | Cambia la contraseña desde el perfil (requiere JWT).               |

**Recuperar:** cuerpo `{ "correo": "ana@example.com" }`. La respuesta es siempre la misma para no
revelar si el correo tiene cuenta:

```json
{
  "data": {
    "mensaje": "Si el correo pertenece a una cuenta verificada, enviamos un enlace temporal para restablecer la contraseña"
  }
}
```

En desarrollo (`NODE_ENV` distinto de `production`) se agrega `data.token_desarrollo` y
`data.expira_en` para poder probar sin un servicio de correo; en producción el enlace solo se
enviaría al correo. El enlace vence según `RECUPERACION_EXPIRA_MINUTOS` (30 por defecto) y solo se
genera para cuentas `habilitado` con `correo_verificado`.

**Restablecer:** cuerpo `{ "token": "...", "password": "NuevaClave1", "confirmacion": "NuevaClave1" }`.
Responde `{ "data": { "mensaje": "Tu contraseña fue actualizada" } }`. El token es de un solo uso,
por lo que un enlace ya usado o vencido responde `400 TOKEN_RECUPERACION_INVALIDO` /
`TOKEN_RECUPERACION_EXPIRADO`.

**Cambiar:** cuerpo `{ "password_actual": "...", "password": "NuevaClave1", "confirmacion": "..." }`
con `Authorization: Bearer <token>`. No acepta `x-user-id`: sin JWT responde `401 NO_AUTENTICADO`.
La respuesta incluye un `token` nuevo para la sesión actual; el token usado en la petición deja de
servir, igual que las demás sesiones abiertas de la cuenta.

Reglas de ACC-04:

- La contraseña actual es obligatoria para cambiar; si no coincide, `401 PASSWORD_ACTUAL_INCORRECTA`
  con un mensaje general, y los fallos repetidos responden `429 DEMASIADOS_INTENTOS` con
  `Retry-After` (mismos `LOGIN_MAX_INTENTOS`, `LOGIN_VENTANA_MINUTOS` y `LOGIN_BLOQUEO_MINUTOS`
  que ACC-02).
- La nueva contraseña debe tener entre 8 y 64 caracteres, con al menos una letra y un número; el
  símbolo es recomendado, no obligatorio.
- La confirmación debe coincidir exactamente y la nueva contraseña debe ser distinta a la actual
  (`400 PASSWORD_REPETIDA`).
- Restablecer o cambiar la contraseña invalida cualquier enlace de recuperación pendiente y limpia
  el bloqueo de intentos de inicio de sesión de esa cuenta.
- Al cambiar la contraseña se incrementa `token_version`: las demás sesiones quedan cerradas y la
  respuesta entrega un token nuevo para que la sesión actual continúe. Al restablecerla con el
  enlace se cierran todas las sesiones abiertas.

### Red de transporte (RED-01, RED-02) · públicos

| Método y ruta                | Descripción                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/lineas?q=`      | Líneas activas y suspendidas (con aviso), con su punto de inicio y de término. `q` busca por código o nombre, sin tildes. |
| `GET /api/v1/lineas/:id`     | Línea con sus recorridos (ida/vuelta), días, horarios y paraderos en orden.                                               |
| `GET /api/v1/recorridos/:id` | Un recorrido con sus paraderos ordenados.                                                                                 |
| `GET /api/v1/paraderos?q=`   | Paraderos activos con coordenadas.                                                                                        |
| `GET /api/v1/paraderos/:id`  | Paradero y las líneas que pasan por él, con los sentidos (recorridos) de cada una.                                        |

### Paraderos favoritos (RED-02) · pasajero registrado

Requieren `Authorization: Bearer <token>`. Los invitados responden `403 CUENTA_INVITADA`.

| Método y ruta                            | Descripción                                              |
| ---------------------------------------- | -------------------------------------------------------- |
| `GET /api/v1/favoritos/paraderos`        | Paraderos favoritos de la cuenta, por nombre.            |
| `PUT /api/v1/favoritos/paraderos/:id`    | Guarda el paradero como favorito (repetirlo no falla).   |
| `DELETE /api/v1/favoritos/paraderos/:id` | Lo quita de los favoritos (si no estaba, tampoco falla). |

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

- Comprobar la vinculación del pasajero al viaje (VIA-01) en `viajes.service`.
