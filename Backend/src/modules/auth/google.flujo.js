// ACC-01/ACC-02: pasos del inicio de sesión con Google entre la app, el navegador y Google.
//
//  1. La app pide POST /auth/google/preparar: recibe la dirección de Google y un `codigo` propio.
//  2. La app abre esa dirección en el navegador; la persona elige su cuenta de Google.
//  3. Google vuelve a GET /auth/google/callback; el backend canjea el código de Google, entra o
//     crea la cuenta y guarda el resultado bajo el `codigo` de la app. La página intenta volver a
//     la app, y si el teléfono no lo permite basta con cerrar la pestaña.
//  4. Al volver (o al cerrarse el navegador), la app pide POST /auth/google/canjear con su
//     `codigo` y recibe la sesión como en ACC-02. El JWT nunca viaja en una URL.
//
// Los estados y códigos viven en memoria y vencen solos: basta para un backend de un proceso.
const { HttpError } = require('../../utils/httpErrors');
const { valorAleatorio } = require('../../utils/google');

const ESPERA_MINUTOS = 10; // tiempo para elegir la cuenta en Google
const RESULTADO_MINUTOS = 5; // tiempo para que la app retire el resultado

// Solo se vuelve a la app (Expo Go usa exp://, la app instalada usa voybus://).
// Así nadie puede usar el backend para redirigir a un sitio cualquiera.
const RETORNO_VALIDO = /^(exps?|voybus):\/\/[^\s]+$/i;

function agregarParametros(url, parametros) {
  const separador = url.includes('?') ? '&' : '?';
  return `${url}${separador}${new URLSearchParams(parametros)}`;
}

function createGoogleFlujo({ google, service, ahora = () => new Date() }) {
  const estados = new Map(); // state de Google -> { retorno, codigo, vence }
  const codigos = new Map(); // código de la app -> { pendiente | resultado | error, vence }

  const enMinutos = (m) => ahora().getTime() + m * 60_000;

  function limpiar() {
    const t = ahora().getTime();
    for (const [k, v] of estados) if (v.vence <= t) estados.delete(k);
    for (const [k, v] of codigos) if (v.vence <= t) codigos.delete(k);
  }

  return {
    /** Paso 1: prepara el inicio de sesión y devuelve la dirección de Google y el código de la app. */
    preparar(retorno) {
      if (!google.configurado) {
        throw new HttpError(
          409,
          'El inicio de sesión con Google no está configurado en el servidor',
          {
            code: 'GOOGLE_NO_CONFIGURADO',
          },
        );
      }
      if (!RETORNO_VALIDO.test(retorno || '')) {
        throw new HttpError(400, 'La dirección de retorno a la app no es válida', {
          code: 'GOOGLE_RETORNO_INVALIDO',
        });
      }
      limpiar();
      const estado = valorAleatorio();
      const codigo = valorAleatorio();
      estados.set(estado, { retorno, codigo, vence: enMinutos(ESPERA_MINUTOS) });
      codigos.set(codigo, { pendiente: true, vence: enMinutos(ESPERA_MINUTOS) });
      return { url: google.urlAutorizacion(estado), codigo };
    },

    /**
     * Paso 3: guarda el resultado bajo el código de la app y devuelve la dirección para volver.
     * Si el `state` no sirve no se sabe a qué app volver: lanza un error (se muestra en el navegador).
     */
    async completar({ state, code, error }) {
      limpiar();
      const pendiente = state ? estados.get(state) : null;
      if (!pendiente) {
        throw new HttpError(
          400,
          'El inicio de sesión con Google expiró. Vuelve a la app e inténtalo de nuevo',
          { code: 'GOOGLE_ESTADO_INVALIDO' },
        );
      }
      estados.delete(state); // un solo uso

      const guardarError = (mensaje) => {
        codigos.set(pendiente.codigo, { error: mensaje, vence: enMinutos(RESULTADO_MINUTOS) });
        return agregarParametros(pendiente.retorno, { error: mensaje });
      };

      if (error || !code) {
        return guardarError(
          error === 'access_denied'
            ? 'Cancelaste el inicio de sesión con Google'
            : 'Google no completó el inicio de sesión',
        );
      }

      try {
        const perfil = await google.canjearCodigo(code);
        const resultado = await service.iniciarConGoogle(perfil);
        codigos.set(pendiente.codigo, { resultado, vence: enMinutos(RESULTADO_MINUTOS) });
        return agregarParametros(pendiente.retorno, { listo: '1' });
      } catch (err) {
        // Los errores esperables (cuenta deshabilitada, solo pasajeros...) llegan a la app con su
        // mensaje; uno inesperado (Google caído, código inválido) se informa de forma general.
        if (!(err instanceof HttpError)) console.error(err);
        return guardarError(
          err instanceof HttpError && err.status < 500
            ? err.message
            : 'No se pudo completar el inicio de sesión con Google',
        );
      }
    },

    /** Paso 4: entrega la sesión (o el motivo del error) una sola vez. */
    canjear(codigo) {
      limpiar();
      const guardado = codigos.get(codigo);
      if (!guardado) {
        throw new HttpError(400, 'El inicio de sesión con Google expiró. Inténtalo de nuevo', {
          code: 'GOOGLE_CODIGO_INVALIDO',
        });
      }
      if (guardado.pendiente) {
        throw new HttpError(409, 'Todavía no terminas de elegir tu cuenta de Google', {
          code: 'GOOGLE_PENDIENTE',
        });
      }
      codigos.delete(codigo);
      if (guardado.error) {
        throw new HttpError(400, guardado.error, { code: 'GOOGLE_RECHAZADO' });
      }
      return guardado.resultado;
    },
  };
}

module.exports = { createGoogleFlujo, RETORNO_VALIDO };
