// ACC-03: tokens cerrados. Se guarda la huella del JWT (no el token) hasta que expire.
const { ejecutar } = require('../sql');

module.exports = {
  up: (qi) =>
    ejecutar(qi, [
      `CREATE TABLE sesiones_revocadas (
        token_hash TEXT PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        expira_en TEXT NOT NULL,
        revocado_en TEXT NOT NULL
      )`,
      'CREATE INDEX idx_sesiones_revocadas_expira ON sesiones_revocadas(expira_en)',
    ]),
  down: (qi) =>
    ejecutar(qi, ['DROP INDEX idx_sesiones_revocadas_expira', 'DROP TABLE sesiones_revocadas']),
};
