// Los controllers de ACC-01 a ACC-04 reciben la petición ya validada y arman la respuesta.
const { HttpError } = require('../../utils/httpErrors');

const sinHtml = (texto) => String(texto).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Página mínima para el navegador cuando no se puede volver a la app. */
const paginaDeError = (mensaje) =>
  `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
  `<title>VoyBus</title><body style="font-family:Arial;padding:24px"><h1>VoyBus</h1>` +
  `<p>${sinHtml(mensaje)}</p><p>Cierra esta ventana y vuelve a la app.</p></body></html>`;

const PAGINA_INICIO =
  `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
  `<title>VoyBus</title><body style="font-family:Arial;padding:24px;text-align:center">` +
  `<h1 style="color:#002344">VoyBus</h1>`;

/**
 * Página final del navegador.
 * - iPhone: el navegador de inicio de sesión detecta el enlace de vuelta y regresa solo a la app.
 * - Android con Expo Go: Chrome no deja volver a Expo Go desde la página, así que se pide cerrar
 *   la pestaña. Da lo mismo: al cerrarla, la app retira la sesión con su código (google.flujo.js).
 */
function volverALaApp(req, res, url) {
  const conError = /[?&]error=/.test(url);
  const mensaje = conError
    ? 'No se pudo iniciar sesión con Google.'
    : 'Listo. Ya iniciaste sesión con Google.';
  let html;
  if (/android/i.test(req.get('user-agent') || '')) {
    html =
      PAGINA_INICIO +
      `<p>${sinHtml(mensaje)}</p>` +
      `<p style="font-size:18px"><b>Cierra esta pestaña con la X de arriba</b> para volver a VoyBus.</p>` +
      `</body></html>`;
  } else {
    html =
      PAGINA_INICIO +
      `<p>${sinHtml(mensaje)}</p>` +
      `<p><a id="volver" data-retorno="${sinHtml(url)}" href="${sinHtml(url)}" ` +
      `style="display:inline-block;background:#1E5FC9;color:#fff;padding:14px 22px;border-radius:10px;` +
      `text-decoration:none;font-weight:bold">Volver a VoyBus</a></p>` +
      `<script>window.location.href=${JSON.stringify(url).replace(/</g, '\\u003c')};</script></body></html>`;
  }
  res.status(200).type('html').send(html);
}

function createAuthController(
  service,
  {
    exponerCodigoVerificacion = false,
    exponerTokenRecuperacion = exponerCodigoVerificacion,
    googleFlujo,
  } = {},
) {
  return {
    googlePreparar: async (req, res) => {
      res.json({ data: googleFlujo.preparar(req.datos.body.retorno) });
    },

    googleCallback: async (req, res) => {
      const valor = (k) => (typeof req.query[k] === 'string' ? req.query[k] : undefined);
      try {
        const url = await googleFlujo.completar({
          state: valor('state'),
          code: valor('code'),
          error: valor('error'),
        });
        volverALaApp(req, res, url);
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        res.status(error.status).type('html').send(paginaDeError(error.message));
      }
    },

    googleCanjear: async (req, res) => {
      res.json({ data: googleFlujo.canjear(req.datos.body.codigo) });
    },

    registrar: async (req, res) => {
      const { usuario, verificacion, codigo } = await service.registrar(req.datos.body);
      const data = { usuario, verificacion };
      // Sin un servicio de correo/SMS, en desarrollo se devuelve el código para poder probar.
      // En producción se enviaría al contacto y nunca se incluiría en la respuesta.
      if (exponerCodigoVerificacion) data.verificacion.codigo_desarrollo = codigo;
      res.status(201).json({ data });
    },

    iniciarSesion: async (req, res) => {
      try {
        res.json({ data: await service.iniciarSesion(req.datos.body) });
      } catch (error) {
        // 429: indica cuántos segundos debe esperar el cliente antes de reintentar.
        if (error.retryAfterSegundos) res.set('Retry-After', String(error.retryAfterSegundos));
        throw error;
      }
    },

    cerrarSesion: async (req, res) => {
      res.json({ data: await service.cerrarSesion({ autorizacion: req.headers.authorization }) });
    },

    recuperarPassword: async (req, res) => {
      const { mensaje, token, expira_en } = await service.recuperarPassword(req.datos.body);
      const data = { mensaje };
      // Sin servicio de correo, en desarrollo se devuelve el enlace para poder probar.
      // En producción el token solo se enviaría al correo verificado.
      if (exponerTokenRecuperacion && token) {
        data.token_desarrollo = token;
        data.expira_en = expira_en;
      }
      res.json({ data });
    },

    restablecerPassword: async (req, res) => {
      res.json({ data: await service.restablecerPassword(req.datos.body) });
    },

    cambiarPassword: async (req, res) => {
      try {
        res.json({
          data: await service.cambiarPassword({ sesion: req.auth, ...req.datos.body }),
        });
      } catch (error) {
        if (error.retryAfterSegundos) res.set('Retry-After', String(error.retryAfterSegundos));
        throw error;
      }
    },

    verificarContacto: async (req, res) => {
      try {
        res.json({ data: await service.verificarContacto(req.datos.body) });
      } catch (error) {
        if (error.retryAfterSegundos) res.set('Retry-After', String(error.retryAfterSegundos));
        throw error;
      }
    },

    reenviarCodigo: async (req, res) => {
      try {
        const { mensaje, codigo, expira_en } = await service.reenviarCodigo(req.datos.body);
        const data = { mensaje };
        // Igual que en el registro: sin correo/SMS, en desarrollo se devuelve el código.
        if (exponerCodigoVerificacion && codigo) {
          data.codigo_desarrollo = codigo;
          data.expira_en = expira_en;
        }
        res.json({ data });
      } catch (error) {
        if (error.retryAfterSegundos) res.set('Retry-After', String(error.retryAfterSegundos));
        throw error;
      }
    },

    iniciarDosFactores: async (req, res) => {
      res.json({ data: await service.iniciarConfiguracion2fa({ sesion: req.auth }) });
    },

    confirmarDosFactores: async (req, res) => {
      try {
        res.json({
          data: await service.confirmarConfiguracion2fa({
            sesion: req.auth,
            ...req.datos.body,
          }),
        });
      } catch (error) {
        if (error.retryAfterSegundos) res.set('Retry-After', String(error.retryAfterSegundos));
        throw error;
      }
    },

    desactivarDosFactores: async (req, res) => {
      try {
        res.json({
          data: await service.desactivar2fa({ sesion: req.auth, ...req.datos.body }),
        });
      } catch (error) {
        if (error.retryAfterSegundos) res.set('Retry-After', String(error.retryAfterSegundos));
        throw error;
      }
    },

    verificarDosFactores: async (req, res) => {
      try {
        res.json({ data: await service.verificarSegundoFactor(req.datos.body) });
      } catch (error) {
        if (error.retryAfterSegundos) res.set('Retry-After', String(error.retryAfterSegundos));
        throw error;
      }
    },

    registrarInvitado: async (req, res) => {
      res.status(201).json({ data: await service.registrarInvitado() });
    },
  };
}

module.exports = { createAuthController };
