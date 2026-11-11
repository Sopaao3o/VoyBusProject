# VoyBus

Aplicación móvil para transporte público que permite ubicar vehículos en tiempo real, solicitar paradas mediante QR y monitorear el cumplimiento del servicio.

## ¿De qué trata el proyecto?

El transporte público requiere herramientas que permitan conocer la ubicación de los vehículos, reducir la incertidumbre de espera y mejorar la coordinación entre pasajeros, conductores y empresas operadoras. En muchos vehículos, la solicitud de parada todavía depende de un timbre físico, mientras que el control del recorrido y de los atrasos se realiza con información limitada o mediante procesos manuales.

VoyBus propone una aplicación móvil que permite consultar paraderos y visualizar vehículos en circulación. Una vez a bordo, el pasajero puede escanear un código QR instalado dentro del vehículo, seleccionar su parada de destino y enviar una solicitud de detención. El conductor visualiza la solicitud junto con su recorrido, y la empresa puede monitorear el cumplimiento del servicio, los tiempos de viaje y las desviaciones respecto de la planificación.

## Roles

- **Pasajero** (registrado o invitado): consulta líneas, paraderos y vehículos; se vincula a un viaje y solicita su parada.
- **Conductor**: gestiona su viaje y turno, comparte su ubicación y recibe alertas de parada.
- **Administrador**: configura la red de transporte, gestiona conductores, vehículos y turnos, y monitorea la operación.

## Stack

| Componente | Tecnología |
|---|---|
| App móvil | React Native con Expo |
| Backend | Node.js + Express (API REST) |
| Base de datos | SQLite |

## Estructura del repositorio

```
VoyBusProject/
├── Backend/    # API REST (Express)
├── Frontend/   # App móvil (Expo)
└── README.md
```

Cada carpeta tiene su propio `package.json` y su propio README con las instrucciones de ejecución.

## Cómo ejecutar

1. **Backend:** ver [`Backend/README.md`](Backend/README.md).
2. **App móvil:** pendiente de crear (se generará con `create-expo-app` dentro de `Frontend/`).

## Flujo de trabajo

Ramas: `main` (versión estable), `dev` (integración y pruebas), y una rama de trabajo por integrante (`DaslavZuvic`, `JavierEspinoza`). Los commits siguen [Conventional Commits](https://www.conventionalcommits.org/es/) (`feat:`, `fix:`, `docs:`, `chore:`).

## Equipo

- Daslav Zuvic
- Javier Espinoza
