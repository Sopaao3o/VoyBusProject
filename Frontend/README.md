# VoyBus · App móvil

App móvil de VoyBus con React Native, Expo (SDK 58), TypeScript y Expo Router.
Funciona sin servicios de pago: se prueba con **Expo Go** y el backend local.

## Ejecutar

1. Levanta el backend (ver [`Backend/README.md`](../Backend/README.md)): `npm run db:reset` y `npm run dev`.
2. Configura la dirección del backend:

   ```bash
   cd Frontend
   npm install
   cp .env.example .env        # en Windows (PowerShell): Copy-Item .env.example .env
   ```

   Edita `.env` y pon la IP de tu PC en la red Wi-Fi (`ipconfig` → Dirección IPv4):

   ```
   EXPO_PUBLIC_API_URL=http://192.168.1.50:3000
   ```

   Con un emulador de Android usa `http://10.0.2.2:3000`.

3. Arranca la app:

   ```bash
   npx expo start
   ```

   Escanea el QR con **Expo Go** (el celular y el PC deben estar en la misma red). Si cambias el
   `.env`, reinicia con `npx expo start -c`.

   Para comprobar la conexión, abre `http://TU_IP:3000/api/health` en el navegador del celular.

## Scripts

| Comando                | Qué hace                                     |
| ---------------------- | -------------------------------------------- |
| `npm start`            | Arranca Expo                                 |
| `npm run typecheck`    | Revisa los tipos de TypeScript               |
| `npm run lint`         | Revisa el código con ESLint (reglas de Expo) |
| `npm run format`       | Da formato a todos los archivos con Prettier |
| `npm run format:check` | Comprueba el formato sin modificar nada      |

## Sesión y cuentas

La pantalla principal es un **mapa** con los paraderos y un panel deslizable para buscar líneas y
paraderos; se usa sin cuenta. El botón redondo de arriba a la izquierda abre **Tu cuenta** (iniciar
sesión, crear cuenta, seguridad). La app envía el JWT en el encabezado
`Authorization: Bearer <token>`.

Cuentas de ejemplo (`npm run db:reset` en el backend), todas con la contraseña `Clave123!`:

| Rol           | Correo                   | Qué ve                                                |
| ------------- | ------------------------ | ----------------------------------------------------- |
| Pasajero      | `ana.pasajera@voybus.cl` | Mapa sin pestañas, con el botón **Subir a una micro** |
| Conductor     | `carlos.rojas@voybus.cl` | Pestañas Mapa y Mis turnos                            |
| Conductor     | `maria.soto@voybus.cl`   | Pestañas Mapa y Mis turnos                            |
| Administrador | `admin@voybus.cl`        | Pestañas Mapa, Turnos y Flota                         |

- La sesión se guarda cifrada en el teléfono (`expo-secure-store`): al reabrir la app sigue
  iniciada. Al cerrar sesión, o si el servidor la rechaza, se borra y la app vuelve al acceso.
- Como el backend no tiene servicio de correo ni SMS, en desarrollo el código de verificación y
  el código del enlace de recuperación llegan en la respuesta y la app los muestra.
- **Continuar con Google** (en Iniciar sesión y en Crear cuenta) abre el navegador del teléfono y
  vuelve a la app. Necesita que el backend tenga Google configurado (ver `Backend/README.md`).
- El mapa usa `react-native-maps`, que funciona en Expo Go sin clave: Google Maps en Android y
  Apple Maps en iOS. El botón de ubicación pide permiso recién al tocarlo (`expo-location`).
- Los términos y la política de privacidad (`app/terminos.tsx`) son un borrador pendiente de
  aprobación del cliente.
- La verificación en dos pasos usa una aplicación autenticadora (Google Authenticator, Authy...).
  La app muestra el código QR, y también permite abrir la aplicación instalada en el mismo
  teléfono o copiar la clave a mano.

## Estructura

```
Frontend/
├── app/                        # pantallas (Expo Router: cada archivo es una ruta)
│   ├── _layout.tsx             # navegación principal y sesión
│   ├── (tabs)/                 # mapa de inicio y pestañas de trabajo: turnos, flota, mis-turnos
│   ├── cuenta.tsx              # ACC-03: tu cuenta, seguridad y cierre de sesión
│   ├── terminos.tsx            # ACC-01: términos de uso y política de privacidad (borrador)
│   ├── viajar.tsx              # VIA-02: elegir la micro en la que vas (lista provisoria)
│   ├── login.tsx               # ACC-02: iniciar sesión (con código 2FA si corresponde) y Google
│   ├── google.tsx              # ACC-01/02: retorno desde Google (solo se cierra)
│   ├── registro.tsx            # ACC-01: crear cuenta de pasajero
│   ├── verificar.tsx           # ACC-01: código de verificación del contacto (y reenvío)
│   ├── dos-factores.tsx        # ACC-01: activar o desactivar la verificación en dos pasos
│   ├── recuperar.tsx           # ACC-04: recuperar la contraseña
│   ├── cambiar-password.tsx    # ACC-04: cambiar la contraseña
│   ├── linea/[id].tsx          # RED-01: recorrido de la línea dibujado en el mapa
│   ├── paradero/[id].tsx       # RED-02: paradero en el mapa con sus líneas
│   ├── turno/                  # ADM-03: detalle y formulario de turnos
│   ├── conductor/              # VEH-03: turno del conductor y solicitudes de parada
│   ├── vehiculo/[id].tsx       # VEH-03: historial de estados e incidencias (administrador)
│   └── viaje/[id].tsx          # VIA-02: elegir destino y solicitar parada
├── src/
│   ├── api/                    # cliente de la API y una función por consulta
│   ├── components/             # piezas reutilizables (formularios, estados, etiquetas)
│   │   └── mapa/               # mapa, marcadores, panel deslizable y botones flotantes
│   ├── hooks/                  # useApi, useBusqueda, useFavoritos, useMiUbicacion, usePantallaMapa...
│   ├── session/                # sesión
│   ├── theme/colors.ts         # paleta de VoyBus
│   └── utils/                  # fechas y textos
└── .env.example
```

## Requisitos cubiertos

| Requisito | Pantallas                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ACC-01    | Crear cuenta con correo, teléfono o Google; verificar código, invitado y verificación en dos pasos                                                           |
| ACC-02    | Iniciar sesión con correo, teléfono o Google, con código 2FA si la cuenta lo tiene                                                                           |
| ACC-03    | Tu cuenta: cerrar sesión                                                                                                                                     |
| ACC-04    | Recuperar la contraseña y cambiarla desde la cuenta                                                                                                          |
| RED-01    | Mapa de inicio (lista de líneas) y detalle con el recorrido en el mapa, sentido, días y horarios                                                             |
| RED-02    | Paraderos en el mapa y en el panel (con favoritos); detalle: líneas, sentidos y favorito                                                                     |
| VIA-02    | Subir a una micro: elegir viaje, destino (nombre, código y orden) y solicitar parada                                                                         |
| VEH-03    | Pestaña Mis turnos: iniciar/finalizar turno y viaje, estado, incidencias. Pestaña Flota (administrador): incidencias e historial de estados de cada vehículo |
| ADM-03    | Pestaña Turnos: lista, creación, modificación y margen de tolerancia                                                                                         |

## Pendiente

- Vinculación al viaje por QR (VIA-01), que reemplaza la lista provisoria de Subir a una micro.
- Ubicación de los vehículos en el mapa (VEH-01 y RED-03). Por ahora el recorrido se dibuja con
  líneas rectas entre paraderos, no por las calles.
