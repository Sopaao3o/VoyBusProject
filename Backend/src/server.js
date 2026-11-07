require('dotenv').config();

const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;

// 0.0.0.0 permite que el celular (misma red Wi-Fi) llegue al servidor del PC.
createApp().listen(PORT, '0.0.0.0', () => {
  console.log(`VoyBus backend escuchando en http://localhost:${PORT}`);
});
