// PLACEHOLDER de autenticación.
// Daslav implementará el login (JWT). Cuando esté listo, solo hay que reemplazar
// el cuerpo de requireRole: verificar el token, cargar req.user y comprobar el rol.
// Las rutas ya lo usan, así que no habrá que tocarlas.

function requireRole(...roles) {
  // eslint-disable-next-line no-unused-vars
  return (req, res, next) => {
    // TODO(auth): validar token y que req.user.rol esté en `roles`.
    next();
  };
}

module.exports = { requireRole };