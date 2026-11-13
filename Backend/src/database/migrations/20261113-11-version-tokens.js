// ACC-04: versión de los tokens de cada cuenta. Al cambiar o restablecer la contraseña se
// incrementa, y los JWT emitidos antes dejan de servir (incluidas las demás sesiones).
const { ejecutar } = require('../sql');

module.exports = {
  up: (qi) =>
    ejecutar(qi, ['ALTER TABLE usuarios ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0']),
  down: (qi) => ejecutar(qi, ['ALTER TABLE usuarios DROP COLUMN token_version']),
};
