// Firma y verificación de los JWT de sesión (ACC-01, ACC-02 y ACC-03).
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

/** Secreto de JWT: en producción es obligatorio definirlo en el .env. */
function secretoJwt() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es obligatorio cuando NODE_ENV=production');
  }
  return 'voybus-dev-secret-no-usar-en-produccion';
}

// Marca de los tokens temporales que solo sirven para completar la verificación en dos pasos.
// Nunca dan acceso a una ruta privada: el middleware de autenticación los rechaza.
const ALCANCE_DOS_FACTORES = '2fa';

/** Firma el token de una cuenta y devuelve los datos públicos de la sesión. */
function firmarToken(usuario) {
  const token = jwt.sign(
    {
      sub: String(usuario.id),
      rol: usuario.rol,
      tipo_acceso: usuario.tipo_acceso,
      // Permite invalidar todas las sesiones de la cuenta al cambiar la contraseña.
      token_version: Number(usuario.token_version) || 0,
    },
    secretoJwt(),
    // jti hace que dos inicios de sesión seguidos no compartan token, para poder cerrarlos por separado.
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d', jwtid: crypto.randomUUID() },
  );
  const { exp } = jwt.decode(token);
  return { token, token_type: 'Bearer', expira_en: new Date(exp * 1000).toISOString() };
}

/**
 * ACC-02: tras validar la contraseña de una cuenta con 2FA, se entrega este desafío temporal.
 * No es una sesión: solo permite enviar el código de la aplicación autenticadora.
 */
function firmarDesafio2fa(usuario) {
  const minutos = Number(process.env.DOS_FACTORES_MINUTOS) || 5;
  const token = jwt.sign(
    {
      sub: String(usuario.id),
      rol: usuario.rol,
      tipo_acceso: usuario.tipo_acceso,
      token_version: Number(usuario.token_version) || 0,
      alcance: ALCANCE_DOS_FACTORES,
    },
    secretoJwt(),
    { expiresIn: `${minutos}m`, jwtid: crypto.randomUUID() },
  );
  const { exp } = jwt.decode(token);
  return { desafio: token, expira_en: new Date(exp * 1000).toISOString() };
}

/** Verifica un desafío de 2FA y comprueba que no sea un token de sesión normal. */
function verificarDesafio2fa(token) {
  const payload = jwt.verify(token, secretoJwt());
  if (payload.alcance !== ALCANCE_DOS_FACTORES) {
    const error = new Error('El token no es un desafío de verificación en dos pasos');
    error.name = 'JsonWebTokenError';
    throw error;
  }
  return payload;
}

/** Verifica la firma y la expiración. Lanza el error de jsonwebtoken si no sirve. */
function verificarToken(token) {
  return jwt.verify(token, secretoJwt());
}

/**
 * Huella del token para guardarlo en la lista de sesiones cerradas sin almacenar el JWT.
 * Se usa SHA-256 porque el token ya es un valor aleatorio firmado.
 */
function huellaToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Extrae el token de "Authorization: Bearer <token>". Devuelve null si el encabezado no sirve. */
function tokenDeAutorizacion(encabezado) {
  if (typeof encabezado !== 'string') return null;
  const [tipo, token, ...resto] = encabezado.trim().split(/\s+/);
  if (resto.length > 0 || !tipo || tipo.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

module.exports = {
  ALCANCE_DOS_FACTORES,
  secretoJwt,
  firmarToken,
  verificarToken,
  firmarDesafio2fa,
  verificarDesafio2fa,
  huellaToken,
  tokenDeAutorizacion,
};
