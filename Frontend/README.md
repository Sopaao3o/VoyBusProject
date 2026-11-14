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

Las líneas y los paraderos se consultan sin cuenta. Lo demás exige iniciar sesión en la pestaña
**Cuenta**; la app envía el JWT en el encabezado `Authorization: Bearer <token>`.

Cuentas de ejemplo (`npm run db:reset` en el backend), todas con la contraseña `Clave123!`:

| Rol           | Correo                   | Pestañas que ve                       |
| ------------- | ------------------------ | ------------------------------------- |
| Pasajero      | `ana.pasajera@voybus.cl` | Líneas, Paraderos, Viajar, Cuenta     |
| Conductor     | `carlos.rojas@voybus.cl` | Líneas, Paraderos, Mis turnos, Cuenta |
| Conductor     | `maria.soto@voybus.cl`   | Líneas, Paraderos, Mis turnos, Cuenta |
| Administrador | `admin@voybus.cl`        | Líneas, Paraderos, Turnos, Cuenta     |

- La sesión se guarda cifrada en el teléfono (`expo-secure-store`): al reabrir la app sigue
  iniciada. Al cerrar sesión, o si el servidor la rechaza, se borra y la app vuelve al acceso.
- Como el backend no tiene servicio de correo ni SMS, en desarrollo el código de verificación y
  el código del enlace de recuperación llegan en la respuesta y la app los muestra.
- La verificación en dos pasos usa una aplicación autenticadora (Google Authenticator, Authy...).
  La app muestra el código QR, y también permite abrir la aplicación instalada en el mismo
  teléfono o copiar la clave a mano.

## Estructura

```
Frontend/
├── app/                        # pantallas (Expo Router: cada archivo es una ruta)
│   ├── _layout.tsx             # navegación principal y sesión
│   ├── (tabs)/                 # pestañas: líneas, paraderos, turnos, mis-turnos, viajar, usuario
│   ├── login.tsx               # ACC-02: iniciar sesión (con código 2FA si corresponde)
│   ├── registro.tsx            # ACC-01: crear cuenta de pasajero
│   ├── verificar.tsx           # ACC-01: código de verificación del contacto (y reenvío)
│   ├── dos-factores.tsx        # ACC-01: activar o desactivar la verificación en dos pasos
│   ├── recuperar.tsx           # ACC-04: recuperar la contraseña
│   ├── cambiar-password.tsx    # ACC-04: cambiar la contraseña
│   ├── linea/[id].tsx          # RED-01: línea con recorridos
│   ├── paradero/[id].tsx       # RED-02: paradero con sus líneas
│   ├── turno/                  # ADM-03: detalle y formulario de turnos
│   ├── conductor/              # VEH-03: turno del conductor y solicitudes de parada
│   └── viaje/[id].tsx          # VIA-02: elegir destino y solicitar parada
├── src/
│   ├── api/                    # cliente de la API y una función por consulta
│   ├── components/             # piezas reutilizables (formularios, estados, etiquetas)
│   ├── hooks/                  # useApi, useBusqueda, useRecorridos
│   ├── session/                # sesión
│   ├── theme/colors.ts         # paleta de VoyBus
│   └── utils/                  # fechas y textos
└── .env.example
```

## Requisitos cubiertos

| Requisito | Pantallas                                                                        |
| --------- | -------------------------------------------------------------------------------- |
| ACC-01    | Crear cuenta de pasajero, verificar código, invitado y verificación en dos pasos |
| ACC-02    | Iniciar sesión con correo o teléfono, con código 2FA si la cuenta lo tiene       |
| ACC-03    | Pestaña Cuenta: cerrar sesión                                                    |
| ACC-04    | Recuperar la contraseña y cambiarla desde la cuenta                              |
| RED-01    | Pestaña Líneas y detalle de la línea (recorridos, días, horarios, paraderos)     |
| RED-02    | Pestaña Paraderos y detalle del paradero (líneas que pasan)                      |
| VIA-02    | Pestaña Viajar: elegir viaje, destino y solicitar parada                         |
| VEH-03    | Pestaña Mis turnos: iniciar/finalizar turno y viaje, estado, incidencias         |
| ADM-03    | Pestaña Turnos: lista, creación, modificación y margen de tolerancia             |

## Pendiente

- Vinculación al viaje por QR (VIA-01), que reemplaza la lista provisoria de la pestaña Viajar.
- Mapa con la ubicación de los vehículos.
