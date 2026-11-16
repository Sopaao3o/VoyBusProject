// RED-02: paraderos favoritos de los pasajeros registrados. Se conservan entre sesiones.
const { UniqueConstraintError } = require('sequelize');
const { HttpError, notFound } = require('../../utils/httpErrors');

/** @param {ReturnType<import('../../database/models').initModels>} models */
function createFavoritosService({ Favorito, Paradero }) {
  /** Los invitados tienen una cuenta temporal: no pueden guardar favoritos. */
  function exigirRegistrado(sesion) {
    if (sesion.tipoAcceso === 'invitado') {
      throw new HttpError(403, 'Crea una cuenta para guardar paraderos favoritos', {
        code: 'CUENTA_INVITADA',
      });
    }
  }

  async function paraderoActivo(id) {
    const paradero = await Paradero.findOne({ where: { id, activo: 1 } });
    if (!paradero) throw notFound('El paradero no existe o no está disponible');
    return paradero;
  }

  return {
    /** Paraderos favoritos del pasajero, por nombre. Los que se desactivaron no se muestran. */
    async listarParaderos(sesion) {
      exigirRegistrado(sesion);
      const favoritos = await Favorito.findAll({
        where: { usuario_id: sesion.usuarioId },
        include: [{ model: Paradero, as: 'paradero', where: { activo: 1 } }],
      });
      return favoritos
        .map(({ paradero: p }) => ({
          id: p.id,
          codigo: p.codigo,
          nombre: p.nombre,
          latitud: p.latitud,
          longitud: p.longitud,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
    },

    /** Guarda el paradero como favorito. Repetirlo no falla ni lo duplica. */
    async agregarParadero(sesion, paraderoId) {
      exigirRegistrado(sesion);
      await paraderoActivo(paraderoId);
      try {
        await Favorito.findOrCreate({
          where: { usuario_id: sesion.usuarioId, paradero_id: paraderoId },
        });
      } catch (err) {
        // Dos toques seguidos: el índice único de la base deja pasar solo uno.
        if (!(err instanceof UniqueConstraintError)) throw err;
      }
      return { paradero_id: paraderoId, favorito: true };
    },

    /** Quita el paradero de los favoritos. Si no estaba, tampoco falla. */
    async quitarParadero(sesion, paraderoId) {
      exigirRegistrado(sesion);
      await Favorito.destroy({ where: { usuario_id: sesion.usuarioId, paradero_id: paraderoId } });
      return { paradero_id: paraderoId, favorito: false };
    },
  };
}

module.exports = { createFavoritosService };
