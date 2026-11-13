// ACC-01: datos de verificación del contacto y aceptación de términos al registrarse.
const { ejecutar } = require('../sql');

module.exports = {
  up: (qi) =>
    ejecutar(qi, [
      'ALTER TABLE usuarios ADD COLUMN correo_verificado INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE usuarios ADD COLUMN telefono_verificado INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE usuarios ADD COLUMN terminos_aceptados_en TEXT',
      'ALTER TABLE usuarios ADD COLUMN codigo_verificacion TEXT',
      'ALTER TABLE usuarios ADD COLUMN codigo_verificacion_expira TEXT',
      'ALTER TABLE usuarios ADD COLUMN canal_verificacion TEXT',
    ]),
  down: (qi) =>
    ejecutar(qi, [
      'ALTER TABLE usuarios DROP COLUMN canal_verificacion',
      'ALTER TABLE usuarios DROP COLUMN codigo_verificacion_expira',
      'ALTER TABLE usuarios DROP COLUMN codigo_verificacion',
      'ALTER TABLE usuarios DROP COLUMN terminos_aceptados_en',
      'ALTER TABLE usuarios DROP COLUMN telefono_verificado',
      'ALTER TABLE usuarios DROP COLUMN correo_verificado',
    ]),
};
