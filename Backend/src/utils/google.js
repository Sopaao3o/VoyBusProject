// ACC-01/ACC-02: conexión con Google (OAuth 2.0 / OpenID Connect) usando solo fetch.
// El canje del código se hace desde el servidor con la clave secreta: el teléfono nunca la ve.
const crypto = require('node:crypto');

const URL_AUTORIZACION = 'https://accounts.google.com/o/oauth2/v2/auth';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const EMISORES = ['https://accounts.google.com', 'accounts.google.com'];

/** Lee el contenido (payload) de un JWT sin verificar la firma. */
function leerJwt(token) {
  const partes = String(token).split('.');
  if (partes.length !== 3) throw new Error('El id_token de Google no tiene formato JWT');
  return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
}

/**
 * @param {{ clientId?: string, clientSecret?: string, urlPublica?: string, fetch?: typeof fetch }} opciones
 * `urlPublica` es la dirección HTTPS con la que Google llega al backend (por ejemplo, la del túnel).
 */
function createGoogleOAuth({
  clientId = process.env.GOOGLE_CLIENT_ID,
  clientSecret = process.env.GOOGLE_CLIENT_SECRET,
  urlPublica = process.env.URL_PUBLICA,
  fetch: hacerFetch = globalThis.fetch,
} = {}) {
  const configurado = Boolean(clientId && clientSecret && urlPublica);
  const redirectUri = configurado
    ? `${urlPublica.replace(/\/$/, '')}/api/v1/auth/google/callback`
    : null;

  return {
    configurado,
    redirectUri,

    /** Dirección de Google donde el usuario elige su cuenta. */
    urlAutorizacion(estado) {
      const parametros = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state: estado,
        prompt: 'select_account',
      });
      return `${URL_AUTORIZACION}?${parametros}`;
    },

    /**
     * Canjea el código que devuelve Google y entrega el perfil de la cuenta.
     * El id_token llega directo de Google por HTTPS en respuesta a nuestra clave secreta, por lo
     * que OpenID Connect permite usarlo sin verificar su firma; igual se revisan aud, iss y exp.
     */
    async canjearCodigo(codigo) {
      const respuesta = await hacerFetch(URL_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: codigo,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok || !datos.id_token) {
        throw new Error(`Google rechazó el código: ${datos.error || respuesta.status}`);
      }
      const perfil = leerJwt(datos.id_token);
      if (perfil.aud !== clientId) throw new Error('El id_token no es para esta aplicación');
      if (!EMISORES.includes(perfil.iss)) throw new Error('El id_token no lo emitió Google');
      if (!(perfil.exp * 1000 > Date.now())) throw new Error('El id_token de Google expiró');
      return {
        sub: String(perfil.sub),
        correo: perfil.email ? String(perfil.email).toLowerCase() : null,
        correoVerificado: perfil.email_verified === true || perfil.email_verified === 'true',
        nombre: perfil.name || perfil.given_name || null,
      };
    },
  };
}

/** Valor aleatorio para el parámetro `state` y para los códigos de un solo uso. */
const valorAleatorio = () => crypto.randomBytes(24).toString('base64url');

module.exports = { createGoogleOAuth, leerJwt, valorAleatorio };
