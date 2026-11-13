// ACC-01: creación de cuentas de pasajero, verificación del medio de contacto y configuración
// de la verificación en dos pasos (TOTP). ACC-02: inicio de sesión. ACC-03: cierre de sesión.
// No incluye Google/Apple (fuera del alcance pedido).
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

const { HttpError, conflict, notFound, badRequest } = require('../../utils/httpErrors');
const {
  firmarToken,
  verificarToken,
  firmarDesafio2fa,
  verificarDesafio2fa,
  huellaToken,
  tokenDeAutorizacion,
} = require('../../utils/jwt');
const { generarSecreto, verificarCodigoTotp, urlOtpauth } = require('../../utils/totp');

const CODIGO_MINUTOS_POR_DEFECTO = 15;
const RECUPERACION_MINUTOS_POR_DEFECTO = 30;
const LOGIN_MAX_INTENTOS_POR_DEFECTO = 5;
const LOGIN_VENTANA_MINUTOS_POR_DEFECTO = 15;
const LOGIN_BLOQUEO_MINUTOS_POR_DEFECTO = 5;

/** Número positivo desde el entorno, o el valor por defecto. */
function numeroPositivo(valor, defecto) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : defecto;
}

const rondasBcrypt = () => Number(process.env.BCRYPT_ROUNDS) || 10;
const minutosCodigo = () =>
  Number(process.env.CODIGO_VERIFICACION_MINUTOS) || CODIGO_MINUTOS_POR_DEFECTO;
const minutosRecuperacion = () =>
  Number(process.env.RECUPERACION_EXPIRA_MINUTOS) || RECUPERACION_MINUTOS_POR_DEFECTO;

const MENSAJE_RECUPERACION =
  'Si el correo pertenece a una cuenta verificada, enviamos un enlace temporal para restablecer la contraseña';
const MENSAJE_PASSWORD_ACTUALIZADA = 'Tu contraseña fue actualizada';

/** Datos del usuario que sí pueden salir en una respuesta (nunca el hash ni el código). */
function usuarioPublico(usuario) {
  return {
    id: usuario.id,
    nombre: usuario.nombre_visible,
    correo: usuario.correo ?? null,
    telefono: usuario.telefono ?? null,
    rol: usuario.rol,
    estado: usuario.estado,
    tipo_acceso: usuario.tipo_acceso,
    correo_verificado: Boolean(usuario.correo_verificado),
    telefono_verificado: Boolean(usuario.telefono_verificado),
    dos_factores_activo: Boolean(usuario.dos_factores_activo),
    fecha_registro: usuario.fecha_registro,
  };
}

/** Código numérico de 6 dígitos, con ceros a la izquierda. */
function generarCodigo() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * @param {ReturnType<import('../../database/models').initModels>} models
 * @param {{ ahora?: () => Date }} [opciones] `ahora` permite controlar el reloj en las pruebas
 */
function createAuthService(
  { sequelize, Usuario, TokenRevocado },
  { ahora = () => new Date() } = {},
) {
  /** Busca una cuenta que ya use el correo o el teléfono y explica cuál chocó. */
  async function exigirContactoLibre(correo, telefono, transaction) {
    const condiciones = [];
    if (correo) condiciones.push({ correo });
    if (telefono) condiciones.push({ telefono });

    const existente = await Usuario.findOne({
      where: { [Op.or]: condiciones },
      transaction,
    });
    if (!existente) return;

    const detalles = [];
    if (correo && existente.correo === correo) {
      detalles.push({
        campo: 'body.correo',
        mensaje: 'Ya existe una cuenta con este correo electrónico',
      });
    }
    if (telefono && existente.telefono === telefono) {
      detalles.push({ campo: 'body.telefono', mensaje: 'Ya existe una cuenta con este teléfono' });
    }
    throw new HttpError(409, 'Ya existe una cuenta con el correo o teléfono indicado', {
      code: 'CUENTA_DUPLICADA',
      details: detalles,
    });
  }

  // ACC-02: intentos fallidos por contacto. Es memoria del proceso, suficiente para el
  // backend local de un solo proceso; en producción convendría un almacén compartido.
  const loginMaxIntentos = Math.floor(
    numeroPositivo(process.env.LOGIN_MAX_INTENTOS, LOGIN_MAX_INTENTOS_POR_DEFECTO),
  );
  const loginVentanaMs =
    numeroPositivo(process.env.LOGIN_VENTANA_MINUTOS, LOGIN_VENTANA_MINUTOS_POR_DEFECTO) * 60_000;
  const loginBloqueoMs =
    numeroPositivo(process.env.LOGIN_BLOQUEO_MINUTOS, LOGIN_BLOQUEO_MINUTOS_POR_DEFECTO) * 60_000;
  const intentosLogin = new Map();

  // Hash de relleno: permite comparar siempre con bcrypt aunque el contacto no exista,
  // para no revelar por tiempo de respuesta qué credencial falló.
  const hashDeRelleno = bcrypt.hashSync('voybus-login-sin-usuario', rondasBcrypt());

  function limpiarIntentosVencidos(ahoraMs) {
    for (const [clave, registro] of intentosLogin) {
      if (registro.bloqueadoHasta <= ahoraMs && ahoraMs - registro.desde >= loginVentanaMs) {
        intentosLogin.delete(clave);
      }
    }
  }

  /** Lanza 429 si el contacto está en espera por intentos fallidos repetidos. */
  function exigirSinBloqueo(clave) {
    const ahoraMs = ahora().getTime();
    limpiarIntentosVencidos(ahoraMs);
    const registro = intentosLogin.get(clave);
    if (!registro || registro.bloqueadoHasta <= ahoraMs) return;

    const segundos = Math.max(1, Math.ceil((registro.bloqueadoHasta - ahoraMs) / 1000));
    const error = new HttpError(
      429,
      `Demasiados intentos fallidos. Espera ${segundos} segundos e inténtalo de nuevo`,
      {
        code: 'DEMASIADOS_INTENTOS',
        details: [{ campo: 'espera_segundos', mensaje: String(segundos) }],
      },
    );
    // El controlador lo usa para responder con el encabezado Retry-After.
    error.retryAfterSegundos = segundos;
    throw error;
  }

  function registrarIntentoFallido(clave) {
    const ahoraMs = ahora().getTime();
    const actual = intentosLogin.get(clave);
    const registro =
      actual && actual.bloqueadoHasta <= ahoraMs && ahoraMs - actual.desde < loginVentanaMs
        ? actual
        : { fallos: 0, desde: ahoraMs, bloqueadoHasta: 0 };

    registro.fallos += 1;
    if (registro.fallos >= loginMaxIntentos) {
      registro.fallos = 0;
      registro.desde = ahoraMs;
      registro.bloqueadoHasta = ahoraMs + loginBloqueoMs;
    }
    intentosLogin.set(clave, registro);
  }

  /** Tras una contraseña nueva, no tiene sentido seguir bloqueando los intentos anteriores. */
  function olvidarIntentosDe(usuario) {
    const claves = [`usuario:${usuario.id}`];
    if (usuario.correo) claves.push(`correo:${usuario.correo}`);
    if (usuario.telefono) claves.push(`telefono:${usuario.telefono}`);
    for (const clave of claves) intentosLogin.delete(clave);
  }

  /** Guarda el hash del enlace temporal; el token en claro solo viaja al correo. */
  async function guardarTokenRecuperacion(usuario) {
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(ahora().getTime() + minutosRecuperacion() * 60 * 1000).toISOString();
    await usuario.update({
      token_recuperacion: huellaToken(token),
      token_recuperacion_expira: expira,
    });
    return { token, expira };
  }

  /** Cuenta autenticada por el JWT, lista para las operaciones sensibles del perfil. */
  async function usuarioDeSesion(sesion) {
    const usuarioId = sesion?.usuarioId;
    if (!usuarioId) {
      throw new HttpError(401, 'Falta la sesión para esta operación', {
        code: 'NO_AUTENTICADO',
      });
    }
    const usuario = await Usuario.findByPk(usuarioId);
    if (!usuario) {
      throw new HttpError(401, 'La sesión no es válida', { code: 'NO_AUTENTICADO' });
    }
    if (usuario.estado === 'deshabilitado') {
      throw new HttpError(403, 'La cuenta está deshabilitada. Contacta al administrador', {
        code: 'CUENTA_DESHABILITADA',
      });
    }
    return usuario;
  }

  /** Solo las cuentas registradas con contraseña pueden usar la aplicación autenticadora. */
  function exigirCuentaConPassword(usuario) {
    if (usuario.tipo_acceso === 'invitado' || !usuario.password_hash) {
      throw new HttpError(
        403,
        'Las cuentas de invitado no pueden activar la verificación en dos pasos',
        { code: 'CUENTA_INVITADA' },
      );
    }
  }

  /**
   * Comprueba el código TOTP con la misma espera que ACC-02 tras varios fallos.
   * El paso aceptado se devuelve para guardarlo y no reutilizar el mismo código.
   */
  function exigirCodigo2fa(usuario, codigo, { status = 400 } = {}) {
    const clave = `2fa:${usuario.id}`;
    exigirSinBloqueo(clave);

    const paso = verificarCodigoTotp(usuario.dos_factores_secreto, codigo, {
      fecha: ahora(),
      ultimoPaso: usuario.dos_factores_ultimo_paso,
    });
    if (paso === null) {
      registrarIntentoFallido(clave);
      throw new HttpError(status, 'El código de verificación en dos pasos no es correcto', {
        code: 'CODIGO_2FA_INVALIDO',
      });
    }
    intentosLogin.delete(clave);
    return paso;
  }

  return {
    /**
     * Registro público: siempre crea un pasajero, aunque el cuerpo intente enviar otro rol.
     * La cuenta queda "sin_verificar" hasta que se confirme el código del contacto.
     */
    async registrar({ nombre, correo, telefono, password }) {
      const rounds = rondasBcrypt();
      const codigo = generarCodigo();
      const [passwordHash, hashDelCodigo] = await Promise.all([
        bcrypt.hash(password, rounds),
        bcrypt.hash(codigo, rounds),
      ]);

      const expira = new Date(ahora().getTime() + minutosCodigo() * 60 * 1000).toISOString();

      let usuario;
      try {
        usuario = await sequelize.transaction(async (transaction) => {
          await exigirContactoLibre(correo, telefono, transaction);
          return Usuario.create(
            {
              rol: 'pasajero', // la validación pública nunca crea admin ni conductor
              nombre_visible: nombre,
              correo: correo ?? null,
              telefono: telefono ?? null,
              password_hash: passwordHash,
              estado: 'sin_verificar',
              tipo_acceso: 'registrado',
              correo_verificado: 0,
              telefono_verificado: 0,
              terminos_aceptados_en: ahora().toISOString(),
              codigo_verificacion: hashDelCodigo,
              codigo_verificacion_expira: expira,
              canal_verificacion: correo ? 'correo' : 'telefono',
              fecha_registro: ahora().toISOString(),
            },
            { transaction },
          );
        });
      } catch (err) {
        // Carrera entre dos registros simultáneos: la base también tiene UNIQUE.
        if (err.name === 'SequelizeUniqueConstraintError') {
          throw new HttpError(409, 'Ya existe una cuenta con el correo o teléfono indicado', {
            code: 'CUENTA_DUPLICADA',
          });
        }
        throw err;
      }

      return {
        usuario: usuarioPublico(usuario),
        verificacion: {
          requerida: true,
          canal: usuario.correo ? 'correo' : 'telefono',
          expira_en: expira,
        },
        codigo,
      };
    },

    /**
     * ACC-02: inicia sesión con el mismo medio de contacto usado al registrarse.
     * Ante credenciales incorrectas responde siempre lo mismo, sin decir qué falló.
     */
    async iniciarSesion({ correo, telefono, password }) {
      const clave = correo ? `correo:${correo}` : `telefono:${telefono}`;
      exigirSinBloqueo(clave);

      const usuario = await Usuario.findOne({ where: correo ? { correo } : { telefono } });
      const tienePassword = Boolean(usuario?.password_hash);
      // Se compara siempre (también si no hay cuenta) para no filtrar información por tiempo.
      const coincide = await bcrypt.compare(password, usuario?.password_hash || hashDeRelleno);

      if (!usuario || !tienePassword || !coincide) {
        registrarIntentoFallido(clave);
        throw new HttpError(401, 'El usuario o la contraseña no son correctos', {
          code: 'CREDENCIALES_INVALIDAS',
        });
      }

      // Las credenciales son correctas: los errores de estado no cuentan como intento fallido.
      intentosLogin.delete(clave);

      if (usuario.estado === 'deshabilitado') {
        throw new HttpError(403, 'La cuenta está deshabilitada. Contacta al administrador', {
          code: 'CUENTA_DESHABILITADA',
        });
      }

      if (usuario.estado === 'sin_verificar') {
        const canal = usuario.canal_verificacion || (usuario.correo ? 'correo' : 'telefono');
        const medio = canal === 'correo' ? 'correo electrónico' : 'teléfono';
        throw new HttpError(
          403,
          `Tu cuenta aún no está verificada. Revisa el código que enviamos a tu ${medio} y completa la verificación antes de iniciar sesión`,
          { code: 'CUENTA_SIN_VERIFICAR' },
        );
      }

      // ACC-02: si la cuenta tiene la verificación en dos pasos activa, la contraseña sola no
      // inicia sesión. Se entrega un desafío temporal y se pide el código de la app autenticadora.
      if (usuario.dos_factores_activo) {
        if (!usuario.dos_factores_secreto) {
          throw new HttpError(
            403,
            'La verificación en dos pasos está activada, pero la cuenta no tiene un secreto configurado. Contacta al administrador',
            { code: 'SEGUNDO_FACTOR_NO_CONFIGURADO' },
          );
        }
        return {
          requiere_2fa: true,
          usuario: usuarioPublico(usuario),
          ...firmarDesafio2fa(usuario),
        };
      }

      return { usuario: usuarioPublico(usuario), ...firmarToken(usuario) };
    },

    /**
     * ACC-02: segundo paso del inicio de sesión. Cambia el desafío temporal por una sesión
     * solo si el código de la aplicación autenticadora es correcto.
     */
    async verificarSegundoFactor({ desafio, codigo }) {
      let payload;
      try {
        payload = verificarDesafio2fa(desafio);
      } catch {
        throw new HttpError(
          401,
          'La verificación en dos pasos expiró. Inicia sesión de nuevo para continuar',
          { code: 'DESAFIO_2FA_INVALIDO' },
        );
      }

      const usuarioId = Number(payload.sub);
      if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
        throw new HttpError(401, 'El desafío de verificación en dos pasos no es válido', {
          code: 'DESAFIO_2FA_INVALIDO',
        });
      }

      const usuario = await Usuario.findByPk(usuarioId);
      if (!usuario) {
        throw new HttpError(401, 'El desafío de verificación en dos pasos no es válido', {
          code: 'DESAFIO_2FA_INVALIDO',
        });
      }
      if (usuario.estado === 'deshabilitado') {
        throw new HttpError(403, 'La cuenta está deshabilitada. Contacta al administrador', {
          code: 'CUENTA_DESHABILITADA',
        });
      }
      if (usuario.estado === 'sin_verificar') {
        throw new HttpError(403, 'La cuenta todavía no está verificada', {
          code: 'CUENTA_SIN_VERIFICAR',
        });
      }
      if (!usuario.dos_factores_activo || !usuario.dos_factores_secreto) {
        throw new HttpError(
          409,
          'La verificación en dos pasos ya no está activa. Inicia sesión de nuevo',
          { code: 'DESAFIO_2FA_INVALIDO' },
        );
      }

      // Si la contraseña cambió mientras se esperaba el código, el desafío queda sin efecto.
      if ((Number(payload.token_version) || 0) !== (Number(usuario.token_version) || 0)) {
        throw new HttpError(
          401,
          'La verificación en dos pasos expiró. Inicia sesión de nuevo para continuar',
          { code: 'DESAFIO_2FA_INVALIDO' },
        );
      }

      const paso = exigirCodigo2fa(usuario, codigo, { status: 401 });
      await usuario.update({ dos_factores_ultimo_paso: paso });

      return { usuario: usuarioPublico(usuario), ...firmarToken(usuario) };
    },

    /**
     * ACC-01 (configurar 2FA): genera el secreto y la URL otpauth:// que el frontend muestra
     * como QR. Todavía no se activa: falta confirmar un código de 6 dígitos.
     */
    async iniciarConfiguracion2fa({ sesion }) {
      const usuario = await usuarioDeSesion(sesion);
      exigirCuentaConPassword(usuario);

      if (usuario.dos_factores_activo) {
        throw conflict(
          'La verificación en dos pasos ya está activa. Desactívala antes de configurarla de nuevo',
          { code: 'DOS_FACTORES_YA_ACTIVO' },
        );
      }

      const secreto = generarSecreto();
      await usuario.update({
        dos_factores_secreto: secreto,
        dos_factores_confirmado_en: null,
        dos_factores_ultimo_paso: null,
      });

      const cuenta = usuario.correo || usuario.telefono || usuario.nombre_visible;
      return {
        secreto,
        cuenta,
        emisor: 'VoyBus',
        algoritmo: 'SHA1',
        digitos: 6,
        periodo: 30,
        otpauth_url: urlOtpauth({ secreto, cuenta }),
        instrucciones:
          'Escanea el código QR con tu aplicación autenticadora y confirma el código de 6 dígitos',
      };
    },

    /**
     * ACC-01 (activar 2FA): confirma el código de la aplicación autenticadora y activa la
     * verificación en dos pasos. Un código inválido no activa nada.
     */
    async confirmarConfiguracion2fa({ sesion, codigo }) {
      const usuario = await usuarioDeSesion(sesion);
      exigirCuentaConPassword(usuario);

      if (usuario.dos_factores_activo) {
        throw conflict('La verificación en dos pasos ya está activa', {
          code: 'DOS_FACTORES_YA_ACTIVO',
        });
      }
      if (!usuario.dos_factores_secreto) {
        throw badRequest(
          'Primero inicia la configuración de la verificación en dos pasos para obtener el código QR',
          { code: 'DOS_FACTORES_SIN_CONFIGURAR' },
        );
      }

      // El paso no se marca como usado: así el mismo código sirve para entrar de inmediato.
      exigirCodigo2fa(usuario, codigo);
      await usuario.update({
        dos_factores_activo: 1,
        dos_factores_confirmado_en: ahora().toISOString(),
        dos_factores_ultimo_paso: null,
      });

      return {
        mensaje: 'Verificación en dos pasos activada',
        usuario: usuarioPublico(usuario),
      };
    },

    /**
     * ACC-01: desactiva la verificación en dos pasos. Exige la contraseña actual y un código
     * válido para que un token robado no pueda desactivarla por sí solo.
     */
    async desactivar2fa({ sesion, password_actual, codigo }) {
      const usuario = await usuarioDeSesion(sesion);
      exigirCuentaConPassword(usuario);

      if (!usuario.dos_factores_activo || !usuario.dos_factores_secreto) {
        throw conflict('La verificación en dos pasos no está activa', {
          code: 'DOS_FACTORES_NO_ACTIVO',
        });
      }

      const clavePassword = `usuario:${usuario.id}`;
      exigirSinBloqueo(clavePassword);
      const coincide = await bcrypt.compare(password_actual, usuario.password_hash);
      if (!coincide) {
        registrarIntentoFallido(clavePassword);
        throw new HttpError(401, 'La contraseña actual no es correcta', {
          code: 'PASSWORD_ACTUAL_INCORRECTA',
        });
      }
      intentosLogin.delete(clavePassword);

      exigirCodigo2fa(usuario, codigo);

      await usuario.update({
        dos_factores_activo: 0,
        dos_factores_secreto: null,
        dos_factores_confirmado_en: null,
        dos_factores_ultimo_paso: null,
      });

      return {
        mensaje: 'Verificación en dos pasos desactivada',
        usuario: usuarioPublico(usuario),
      };
    },

    /**
     * ACC-03: cierra la sesión del token recibido. Es idempotente para que reintentar (o
     * cerrar sesión dos veces) nunca falle, y no toca el perfil, los favoritos ni el historial.
     */
    async cerrarSesion({ autorizacion }) {
      const token = tokenDeAutorizacion(autorizacion);
      if (!token) {
        // Distingue "no envió sesión" de "envió un encabezado con otro formato".
        if (!autorizacion) {
          throw new HttpError(401, 'Falta el token de la sesión que quieres cerrar', {
            code: 'NO_AUTENTICADO',
          });
        }
        throw new HttpError(401, 'El encabezado Authorization debe ser "Bearer <token>"', {
          code: 'TOKEN_INVALIDO',
        });
      }

      let payload;
      try {
        payload = verificarToken(token);
      } catch (error) {
        // Un token expirado ya no da acceso: la sesión está cerrada y el reintento es seguro.
        if (error.name === 'TokenExpiredError') {
          return {
            sesion_cerrada: true,
            ya_estaba_cerrada: true,
            cerrada_en: ahora().toISOString(),
          };
        }
        throw new HttpError(401, 'El token de sesión no es válido', { code: 'TOKEN_INVALIDO' });
      }

      const usuarioId = Number(payload.sub);
      if (!Number.isInteger(usuarioId) || usuarioId <= 0 || !Number.isFinite(payload.exp)) {
        throw new HttpError(401, 'El token de sesión no es válido', { code: 'TOKEN_INVALIDO' });
      }

      // Limpieza oportunista: las huellas de tokens vencidos ya no hacen falta.
      await TokenRevocado.destroy({ where: { expira_en: { [Op.lte]: ahora().toISOString() } } });

      const tokenHash = huellaToken(token);
      const yaRevocado = await TokenRevocado.findByPk(tokenHash);
      if (yaRevocado) {
        return {
          sesion_cerrada: true,
          ya_estaba_cerrada: true,
          cerrada_en: yaRevocado.revocado_en,
        };
      }

      const cerradaEn = ahora().toISOString();
      await TokenRevocado.create({
        token_hash: tokenHash,
        usuario_id: Number(payload.sub),
        expira_en: new Date(payload.exp * 1000).toISOString(),
        revocado_en: cerradaEn,
      });

      return { sesion_cerrada: true, ya_estaba_cerrada: false, cerrada_en: cerradaEn };
    },

    /**
     * ACC-04 (recuperar): genera un enlace temporal solo para cuentas con correo verificado.
     * La respuesta es siempre la misma para no revelar si el correo tiene cuenta.
     */
    async recuperarPassword({ correo }) {
      const respuesta = { mensaje: MENSAJE_RECUPERACION };
      const usuario = await Usuario.findOne({ where: { correo } });

      if (!usuario || usuario.estado === 'deshabilitado' || !usuario.correo_verificado) {
        return respuesta;
      }

      const { token, expira } = await guardarTokenRecuperacion(usuario);
      return { ...respuesta, token, expira_en: expira };
    },

    /**
     * ACC-04 (restablecer): consume el enlace temporal. El token es de un solo uso y la
     * contraseña nueva debe cumplir las reglas y ser distinta a la actual.
     */
    async restablecerPassword({ token, password }) {
      const usuario = await Usuario.findOne({
        where: { token_recuperacion: huellaToken(token) },
      });
      if (!usuario) {
        throw badRequest('El enlace de recuperación no es válido o ya fue utilizado', {
          code: 'TOKEN_RECUPERACION_INVALIDO',
        });
      }
      if (
        !usuario.token_recuperacion_expira ||
        new Date(usuario.token_recuperacion_expira).getTime() <= ahora().getTime()
      ) {
        throw badRequest('El enlace de recuperación expiró. Solicita uno nuevo', {
          code: 'TOKEN_RECUPERACION_EXPIRADO',
        });
      }
      if (usuario.estado === 'deshabilitado') {
        throw new HttpError(403, 'La cuenta está deshabilitada. Contacta al administrador', {
          code: 'CUENTA_DESHABILITADA',
        });
      }
      if (usuario.password_hash && (await bcrypt.compare(password, usuario.password_hash))) {
        throw badRequest('La nueva contraseña debe ser distinta a la actual', {
          code: 'PASSWORD_REPETIDA',
        });
      }

      await usuario.update({
        password_hash: await bcrypt.hash(password, rondasBcrypt()),
        token_recuperacion: null,
        token_recuperacion_expira: null,
        // Cierra todas las sesiones abiertas: el enlace se usa, por lo general, desde otro
        // dispositivo o después de haber perdido el acceso.
        token_version: (Number(usuario.token_version) || 0) + 1,
      });
      olvidarIntentosDe(usuario);

      return { mensaje: MENSAJE_PASSWORD_ACTUALIZADA };
    },

    /**
     * ACC-04 (cambiar): desde el perfil, con la contraseña actual como confirmación.
     * Los fallos repetidos de la contraseña actual aplican la misma espera que ACC-02.
     */
    async cambiarPassword({ sesion, password_actual, password }) {
      const usuarioId = sesion?.usuarioId;
      if (!usuarioId) {
        throw new HttpError(401, 'Falta la sesión para cambiar la contraseña', {
          code: 'NO_AUTENTICADO',
        });
      }

      const clave = `usuario:${usuarioId}`;
      exigirSinBloqueo(clave);

      const usuario = await Usuario.findByPk(usuarioId);
      if (!usuario) {
        throw new HttpError(401, 'La sesión no es válida', { code: 'NO_AUTENTICADO' });
      }
      if (usuario.estado === 'deshabilitado') {
        throw new HttpError(403, 'La cuenta está deshabilitada. Contacta al administrador', {
          code: 'CUENTA_DESHABILITADA',
        });
      }

      // Se compara siempre, aunque la cuenta no tenga contraseña (invitado), sin filtrar detalles.
      const coincide = await bcrypt.compare(
        password_actual,
        usuario.password_hash || hashDeRelleno,
      );
      if (!coincide) {
        registrarIntentoFallido(clave);
        throw new HttpError(401, 'La contraseña actual no es correcta', {
          code: 'PASSWORD_ACTUAL_INCORRECTA',
        });
      }
      intentosLogin.delete(clave);

      if (usuario.password_hash && (await bcrypt.compare(password, usuario.password_hash))) {
        throw badRequest('La nueva contraseña debe ser distinta a la actual', {
          code: 'PASSWORD_REPETIDA',
        });
      }

      await usuario.update({
        password_hash: await bcrypt.hash(password, rondasBcrypt()),
        token_recuperacion: null,
        token_recuperacion_expira: null,
        // Cierra las demás sesiones. La sesión actual continúa con el token nuevo de abajo.
        token_version: (Number(usuario.token_version) || 0) + 1,
      });

      return {
        mensaje: MENSAJE_PASSWORD_ACTUALIZADA,
        ...firmarToken(usuario),
      };
    },

    /** Confirma el código enviado al correo o teléfono y habilita la cuenta. */
    async verificarContacto({ correo, telefono, codigo }) {
      const where = correo ? { correo } : { telefono };
      const canal = correo ? 'correo' : 'telefono';
      const usuario = await Usuario.findOne({ where });
      if (!usuario) throw notFound('No existe una cuenta con ese medio de contacto');

      if (usuario.canal_verificacion && usuario.canal_verificacion !== canal) {
        throw badRequest(
          `El código de verificación se envió por ${usuario.canal_verificacion === 'correo' ? 'correo electrónico' : 'teléfono'}`,
          { code: 'CANAL_INCORRECTO' },
        );
      }
      if (usuario.estado === 'deshabilitado') {
        throw new HttpError(403, 'La cuenta está deshabilitada. Contacta al administrador');
      }
      if (usuario.estado === 'habilitado' && !usuario.codigo_verificacion) {
        throw conflict('La cuenta ya está verificada');
      }
      if (!usuario.codigo_verificacion || !usuario.codigo_verificacion_expira) {
        throw conflict('No hay una verificación pendiente para esta cuenta');
      }
      if (new Date(usuario.codigo_verificacion_expira).getTime() <= ahora().getTime()) {
        throw new HttpError(409, 'El código de verificación expiró', { code: 'CODIGO_EXPIRADO' });
      }
      if (!(await bcrypt.compare(codigo, usuario.codigo_verificacion))) {
        throw badRequest('El código de verificación no es correcto', { code: 'CODIGO_INVALIDO' });
      }

      await usuario.update({
        estado: 'habilitado',
        correo_verificado: correo ? 1 : usuario.correo_verificado,
        telefono_verificado: telefono ? 1 : usuario.telefono_verificado,
        codigo_verificacion: null,
        codigo_verificacion_expira: null,
        canal_verificacion: null,
      });

      return { usuario: usuarioPublico(usuario), ...firmarToken(usuario) };
    },

    /** Acceso como invitado: una cuenta de pasajero temporal, sin correo ni contraseña. */
    async registrarInvitado() {
      const usuario = await sequelize.transaction((transaction) =>
        Usuario.create(
          {
            rol: 'pasajero',
            nombre_visible: 'Invitado',
            estado: 'habilitado',
            tipo_acceso: 'invitado',
            identificador: `INV-${crypto.randomUUID()}`,
            fecha_registro: ahora().toISOString(),
          },
          { transaction },
        ),
      );

      return { usuario: usuarioPublico(usuario), ...firmarToken(usuario) };
    },
  };
}

module.exports = { createAuthService };
