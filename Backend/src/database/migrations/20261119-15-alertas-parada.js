// VEH-02: cuándo se le avisó al conductor cada solicitud de parada. Así, al reconectarse,
// solo recibe avisos de solicitudes nuevas y nunca se repiten los que ya recibió.
const { ejecutar } = require('../sql');

module.exports = {
  up: (qi) => ejecutar(qi, ['ALTER TABLE solicitudes_parada ADD COLUMN avisada_en TEXT']),
  down: (qi) => ejecutar(qi, ['ALTER TABLE solicitudes_parada DROP COLUMN avisada_en']),
};
