// ACC-01: creación de cuentas de pasajero y verificación del medio de contacto.
// ACC-02: inicio de sesión. ACC-03: cierre de sesión.
// No incluye Google/Apple ni verificación en dos pasos (fuera del alcance pedido).
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

const { HttpError, conflict, notFound, badRequest } = require('../../utils/httpErrors');
const {
  firmarToken,
  verificarToken,
  huellaToken,
  tokenDeAutorizacion,
} = require('../../utils/jwt');

const CODIGO_MINUTOS_POR_DEFECTO = 15;
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

      // La configuración de 2FA pertenece a ACC-01 y quedó fuera de este alcance: el esquema
      // no guarda el secreto del autenticador. Si una cuenta lo tuviera activo, no se omite
      // el segundo factor: se le pide contactar al administrador.
      if (usuario.dos_factores_activo) {
        throw new HttpError(
          403,
          'Esta cuenta tiene la verificación en dos pasos activada, pero aún no está configurada. Contacta al administrador',
          { code: 'SEGUNDO_FACTOR_REQUERIDO' },
        );
      }

      return { usuario: usuarioPublico(usuario), ...firmarToken(usuario) };
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
