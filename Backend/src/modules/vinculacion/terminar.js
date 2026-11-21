// VIA-01: la vinculación termina sola cuando el viaje del vehículo finaliza.
const { Op } = require('sequelize');

/** Termina las vinculaciones activas de un viaje que finalizó. */
async function terminarVinculacionesDelViaje(models, viajeId, ahoraISO, transaction) {
  await models.Vinculacion.update(
    { terminada_en: ahoraISO(), motivo_termino: 'viaje_finalizado' },
    { where: { viaje_id: viajeId, terminada_en: { [Op.is]: null } }, transaction },
  );
}

module.exports = { terminarVinculacionesDelViaje };
