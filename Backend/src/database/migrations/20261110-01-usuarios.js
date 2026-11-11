// Cuentas de usuario. (Dominio de acceso: lo ampliará Daslav con sesiones, 2FA, etc.)
const { ejecutar } = require('../sql');

module.exports = {
  up: (qi) =>
    ejecutar(qi, [
      `CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rol TEXT NOT NULL CHECK (rol IN ('pasajero','conductor','administrador')),
        nombre_visible TEXT NOT NULL,
        alias TEXT UNIQUE,
        correo TEXT UNIQUE,
        telefono TEXT UNIQUE,
        password_hash TEXT,
        estado TEXT NOT NULL DEFAULT 'habilitado' CHECK (estado IN ('habilitado','deshabilitado','sin_verificar')),
        dos_factores_activo INTEGER NOT NULL DEFAULT 0 CHECK (dos_factores_activo IN (0,1)),
        tipo_acceso TEXT NOT NULL DEFAULT 'registrado' CHECK (tipo_acceso IN ('registrado','invitado')),
        identificador TEXT UNIQUE,
        datos_contacto TEXT,
        fecha_registro TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )`,
    ]),
  down: (qi) => ejecutar(qi, ['DROP TABLE usuarios']),
};
