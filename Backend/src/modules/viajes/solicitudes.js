// VIA-02 y VIA-03: estado de las solicitudes de parada según hasta dónde llegó el vehículo.
// Lo usan el GPS del conductor (VEH-01) y el simulador de desarrollo.
const { Op } = require('sequelize');

/**
 * Pone al día las solicitudes abiertas de un viaje según `viaje.ultimo_orden_superado`:
 *  - el vehículo superó el paradero → cerrada (motivo: paradero_superado)
 *  - el paradero es el siguiente → próxima
 *  - si no → enviada
 * Pasar cerca de un paradero no prueba que el vehículo se haya detenido: nunca se marca "atendida".
 * @returns {Promise<number>} cuántas solicitudes se cerraron
 */
async function actualizarSolicitudes(models, viaje, ahoraISO, transaction) {
  const { SolicitudParada, RecorridoParadero } = models;
  const abiertas = await SolicitudParada.findAll({
    where: { viaje_id: viaje.id, estado: { [Op.ne]: 'cerrada' } },
    transaction,
  });
  if (abiertas.length === 0) return 0;
  const paradas = await RecorridoParadero.findAll({
    where: { recorrido_id: viaje.recorrido_id },
    transaction,
  });
  const ordenDe = new Map(paradas.map((p) => [p.paradero_id, p.orden]));

  let cerradas = 0;
  for (const s of abiertas) {
    const orden = ordenDe.get(s.paradero_id);
    if (orden <= viaje.ultimo_orden_superado) {
      await s.update(
        { estado: 'cerrada', motivo_cierre: 'paradero_superado', cerrada_en: ahoraISO() },
        { transaction },
      );
      cerradas++;
    } else {
      const estado = orden === viaje.ultimo_orden_superado + 1 ? 'proxima' : 'enviada';
      if (s.estado !== estado) await s.update({ estado }, { transaction });
    }
  }
  return cerradas;
}

module.exports = { actualizarSolicitudes };
