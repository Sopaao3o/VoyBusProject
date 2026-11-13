// ACC-04: enlace temporal para recuperar la contraseña desde la pantalla de acceso.
const { ejecutar } = require('../sql');

module.exports = {
  up: (qi) =>
    ejecutar(qi, [
      'ALTER TABLE usuarios ADD COLUMN token_recuperacion TEXT',
      'ALTER TABLE usuarios ADD COLUMN token_recuperacion_expira TEXT',
      `CREATE UNIQUE INDEX uq_usuarios_token_recuperacion ON usuarios(token_recuperacion) WHERE token_recuperacion IS NOT NULL`,
    ]),
  down: (qi) =>
    ejecutar(qi, [
      'DROP INDEX uq_usuarios_token_recuperacion',
      'ALTER TABLE usuarios DROP COLUMN token_recuperacion_expira',
      'ALTER TABLE usuarios DROP COLUMN token_recuperacion',
    ]),
};
