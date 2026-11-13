// ACC-01: secreto de la aplicación autenticadora y estado de la verificación en dos pasos.
// `dos_factores_activo` ya existe desde la tabla inicial; aquí se guarda el secreto y el
// último paso aceptado, que evita reutilizar el mismo código de 6 dígitos.
const { ejecutar } = require('../sql');

module.exports = {
  up: (qi) =>
    ejecutar(qi, [
      'ALTER TABLE usuarios ADD COLUMN dos_factores_secreto TEXT',
      'ALTER TABLE usuarios ADD COLUMN dos_factores_confirmado_en TEXT',
      'ALTER TABLE usuarios ADD COLUMN dos_factores_ultimo_paso INTEGER',
    ]),
  down: (qi) =>
    ejecutar(qi, [
      'ALTER TABLE usuarios DROP COLUMN dos_factores_ultimo_paso',
      'ALTER TABLE usuarios DROP COLUMN dos_factores_confirmado_en',
      'ALTER TABLE usuarios DROP COLUMN dos_factores_secreto',
    ]),
};
