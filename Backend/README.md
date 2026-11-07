# VoyBus · Backend

API REST de VoyBus con Node.js (v22 o superior), Express y SQLite (`better-sqlite3`).

## Ejecutar

```bash
cd Backend
npm install
cp .env.example .env      # en Windows (PowerShell): Copy-Item .env.example .env
npm run dev               # reinicia solo al guardar cambios
```

La primera vez que arranca crea `data/voybus.db` y carga datos de ejemplo (líneas, paraderos, recorridos y 10 vehículos). Para recrear la base desde cero: `npm run db:reset`.

Comprobar: <http://localhost:3000/api/health> y <http://localhost:3000/api/lineas>.

## Estructura

```
Backend/
├── src/
│   ├── app.js                       # Express (middlewares, rutas, errores)
│   ├── server.js                    # arranque: abre la BD, carga datos de ejemplo
│   ├── db/
│   │   ├── schema.sql               # esquema SQLite (fuente de verdad de la BD)
│   │   ├── connection.js            # abre la BD y aplica el esquema
│   │   ├── seed.js                  # datos de ejemplo
│   │   └── init.js                  # npm run db:reset
│   ├── routes/health.routes.js
│   └── modules/
│       └── network/                 # RED-01 y RED-02
│           ├── network.service.js
│           └── network.routes.js
├── test/network.test.js
└── .env.example
```

## API · Red de transporte (RED-01, RED-02)

Consultas públicas (no requieren sesión).

| Método y ruta | Descripción |
|---|---|
| `GET /api/lineas?q=` | Líneas activas y suspendidas (las suspendidas traen `aviso`). `q` busca por código o nombre, sin distinguir mayúsculas ni tildes. |
| `GET /api/lineas/:id` | Línea con sus recorridos (ida/vuelta), días, horarios y paraderos en orden. |
| `GET /api/recorridos/:id` | Un recorrido con sus paraderos ordenados. |
| `GET /api/paraderos?q=` | Paraderos activos con coordenadas. `q` busca por nombre o código. |
| `GET /api/paraderos/:id` | Paradero y las líneas que pasan por él. |

Las líneas desactivadas no se listan ni se pueden consultar (404). Un id inválido responde 400 con `{ "error": "..." }`.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm start` | Arranca el servidor |
| `npm run dev` | Arranca con recarga automática |
| `npm run db:reset` | Borra y recrea la base con datos de ejemplo |
| `npm test` | Ejecuta las pruebas automáticas |
