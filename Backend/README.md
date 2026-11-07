# VoyBus · Backend

API REST de VoyBus con Node.js y Express. La base de datos será SQLite (aún no conectada).

## Ejecutar

```bash
cd Backend
npm install
cp .env.example .env      # en Windows (PowerShell): Copy-Item .env.example .env
npm run dev               # reinicia solo al guardar cambios
```

Comprobar que funciona: abrir <http://localhost:3000/api/health>. Debe responder:

```json
{ "status": "ok", "servicio": "voybus-backend", "hora": "..." }
```

## Estructura

```
Backend/
├── src/
│   ├── app.js               # configuración de Express (middlewares, rutas, errores)
│   ├── server.js            # arranque del servidor
│   └── routes/
│       └── health.routes.js # GET /api/health
├── .env.example             # variables de entorno de ejemplo
└── package.json
```

Los módulos de negocio (acceso, red de transporte, viajes, turnos, administración) se agregarán como carpetas dentro de `src/` en las siguientes etapas.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm start` | Arranca el servidor |
| `npm run dev` | Arranca con recarga automática (`node --watch`) |
