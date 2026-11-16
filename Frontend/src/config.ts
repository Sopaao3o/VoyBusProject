// Dirección del backend. Se define en Frontend/.env (EXPO_PUBLIC_API_URL).
// Celular con Expo Go: la IP de tu PC en la red Wi-Fi. Emulador de Android: http://10.0.2.2:3000
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
