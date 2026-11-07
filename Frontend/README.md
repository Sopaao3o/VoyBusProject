# VoyBus · App móvil

App móvil de VoyBus con React Native y Expo.

## Ejecutar

```bash
cd Frontend
npm install
npm start
```

Se abre el panel de Expo. Para verla en el celular, instala **Expo Go** y escanea el código QR (el celular y el PC deben estar en la misma red Wi-Fi). También se puede abrir en un emulador de Android con `npm run android`.

## Estructura

```
Frontend/
├── App.js              # pantalla raíz
├── index.js            # punto de entrada (registra App)
├── app.json            # configuración de Expo
├── assets/             # íconos y splash
└── src/
    └── theme/
        └── colors.js   # paleta de colores de VoyBus
```

Las pantallas, componentes y servicios se irán agregando dentro de `src/`.
