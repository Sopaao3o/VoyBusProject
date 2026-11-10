/**
 * Arma el turno completo (conductor, vehículo y viajes con su línea) como un objeto simple.
 * Lo usan el administrador (ADM-03) y el conductor (VEH-03).
 * Con una sola conexión SQLite, dentro de una transacción hay que pasar `{ transaction }`.
 */
async function turnoCompleto({ Turno, Usuario, Vehiculo, Viaje, Recorrido, Linea }, id, opciones = {}) {
  const turno = await Turno.findByPk(id, {
    include: [
      { model: Usuario, as: 'conductor' },
      { model: Vehiculo, as: 'vehiculo' },
    ],
    ...opciones,
  });
  if (!turno) return null;
  const viajes = await Viaje.findAll({
    where: { turno_id: id },
    include: [{ model: Recorrido, as: 'recorrido', include: [{ model: Linea, as: 'linea' }] }],
    order: [['orden_en_turno', 'ASC']],
    ...opciones,
  });

  const { conductor, vehiculo, ...datos } = turno.get({ plain: true });
  return {
    ...datos,
    conductor_nombre: conductor.nombre_visible,
    vehiculo_identificador: vehiculo.identificador,
    vehiculo: { identificador: vehiculo.identificador, patente: vehiculo.patente, estado_operativo: vehiculo.estado_operativo },
    viajes: viajes.map((v) => {
      const { recorrido, ...viaje } = v.get({ plain: true });
      return {
        ...viaje,
        sentido: recorrido.sentido,
        linea_id: recorrido.linea.id,
        linea_codigo: recorrido.linea.codigo,
        linea_nombre: recorrido.linea.nombre,
      };
    }),
  };
}

module.exports = { turnoCompleto };