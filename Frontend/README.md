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

## Usuario de prueba

Todavía no hay inicio de sesión. La pestaña **Usuario** permite elegir un usuario de ejemplo
(pasajero, conductor o administrador) o **crear una cuenta de pasajero** (ACC-01). Tras verificar
el código, la cuenta queda activa y la app envía su id en el encabezado `x-user-id`, igual que el
placeholder del backend. El JWT que devuelve ACC-01 se guarda en `src/api/client.ts` para cuando
el backend reemplace ese encabezado. También se puede entrar como invitado.

Cuando existan las sesiones, solo hay que cambiar `src/api/client.ts` y
`src/session/UsuarioContext.tsx`.

| Rol           | Pestañas que ve                        |
| ------------- | -------------------------------------- |
| Pasajero      | Líneas, Paraderos, Viajar, Usuario     |
| Conductor     | Líneas, Paraderos, Mis turnos, Usuario |
| Administrador | Líneas, Paraderos, Turnos, Usuario     |

## Estructura

```
Frontend/
├── app/                        # pantallas (Expo Router: cada archivo es una ruta)
│   ├── _layout.tsx             # navegación principal y usuario de prueba
│   ├── (tabs)/                 # pestañas: líneas, paraderos, turnos, mis-turnos, viajar, usuario
│   ├── registro.tsx            # ACC-01: crear cuenta de pasajero y verificar el contacto
│   ├── linea/[id].tsx          # RED-01: línea con recorridos
│   ├── paradero/[id].tsx       # RED-02: paradero con sus líneas
│   ├── turno/                  # ADM-03: detalle y formulario de turnos
│   ├── conductor/              # VEH-03: turno del conductor y solicitudes de parada
│   └── viaje/[id].tsx          # VIA-02: elegir destino y solicitar parada
├── src/
│   ├── api/                    # cliente de la API y una función por consulta
│   ├── components/             # piezas reutilizables (formularios, estados, etiquetas)
│   ├── hooks/                  # useApi, useBusqueda, useRecorridos
│   ├── session/                # usuario de prueba
│   ├── theme/colors.ts         # paleta de VoyBus
│   └── utils/                  # fechas y textos
└── .env.example
```

## Requisitos cubiertos

| Requisito | Pantallas                                                                          |
| --------- | ---------------------------------------------------------------------------------- |
| ACC-01    | Pestaña Usuario: crear cuenta de pasajero, verificar código y entrar como invitado |
| RED-01    | Pestaña Líneas y detalle de la línea (recorridos, días, horarios, paraderos)       |
| RED-02    | Pestaña Paraderos y detalle del paradero (líneas que pasan)                        |
| VIA-02    | Pestaña Viajar: elegir viaje, destino y solicitar parada                           |
| VEH-03    | Pestaña Mis turnos: iniciar/finalizar turno y viaje, estado, incidencias           |
| ADM-03    | Pestaña Turnos: lista, creación, modificación y margen de tolerancia               |

## Pendiente

- Inicio de sesión real (Daslav) y vinculación al viaje por QR (VIA-01), que reemplaza la lista
  provisoria de la pestaña Viajar.
- Mapa con la ubicación de los vehículos.
