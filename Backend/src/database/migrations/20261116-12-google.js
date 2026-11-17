// ACC-01/ACC-02: inicio de sesión con Google. Se guarda el identificador estable de la cuenta
// de Google ("sub"), no el correo, porque el correo de una cuenta de Google puede cambiar.
const { ejecutar } = require('../sql');

module.exports = {
  up: (qi) =>
    ejecutar(qi, [
      'ALTER TABLE usuarios ADD COLUMN google_sub TEXT',
      'CREATE UNIQUE INDEX uq_usuarios_google ON usuarios(google_sub) WHERE google_sub IS NOT NULL',
    ]),
  down: (qi) =>
    ejecutar(qi, ['DROP INDEX uq_usuarios_google', 'ALTER TABLE usuarios DROP COLUMN google_sub']),
};
