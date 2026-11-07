require('dotenv').config();

const { createApp } = require('./app');
const { openDatabase } = require('./db/connection');
const { seed } = require('./db/seed');

const PORT = Number(process.env.PORT) || 3000;

const db = openDatabase();
// Primera ejecución: carga los datos de ejemplo para poder probar de inmediato.
if (db.prepare('SELECT COUNT(*) n FROM lineas').get().n === 0) seed(db);

// 0.0.0.0 permite que el celular (misma red Wi-Fi) llegue al servidor del PC.
createApp({ db }).listen(PORT, '0.0.0.0', () => {
  console.log(`VoyBus backend escuchando en http://localhost:${PORT}`);
});
