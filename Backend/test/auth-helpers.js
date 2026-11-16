// Utilidades de las pruebas: firman un JWT para una cuenta sin pasar por el login.
const jwt = require('jsonwebtoken');

// Roles de los usuarios que carga cargarDatosEjemplo (npm run db:reset).
const ROLES = {
  1: 'administrador',
  2: 'conductor',
  3: 'conductor',
  4: 'conductor',
  5: 'pasajero',
};

/**
 * Firma un token para un id de los datos de ejemplo o para una cuenta creada en la prueba
 * (objeto con `id` y `rol`, por ejemplo una instancia del modelo Usuario).
 */
function tokenPara(usuario) {
  const datos = typeof usuario === 'number' ? { id: usuario, rol: ROLES[usuario] } : usuario;
  if (!datos?.id || !datos.rol) {
    throw new Error(`Usuario de prueba sin rol asignado: ${JSON.stringify(usuario)}`);
  }
  return jwt.sign(
    {
      sub: String(datos.id),
      rol: datos.rol,
      tipo_acceso: datos.tipo_acceso || 'registrado',
      token_version: Number(datos.token_version) || 0,
    },
    process.env.JWT_SECRET || 'voybus-dev-secret-no-usar-en-produccion',
    { expiresIn: '1h' },
  );
}

module.exports = { tokenPara };
