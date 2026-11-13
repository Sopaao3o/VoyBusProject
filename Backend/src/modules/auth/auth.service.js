// ACC-01: creación de cuentas de pasajero y verificación del medio de contacto.
// No incluye Google/Apple ni verificación en dos pasos (fuera del alcance pedido).
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const { HttpError, conflict, notFound, badRequest } = require('../../utils/httpErrors');

const CODIGO_MINUTOS_POR_DEFECTO = 15;

/** Secreto de JWT: en producción es obligatorio definirlo en el .env. */
function secretoJwt() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es obligatorio cuando NODE_ENV=production');
  }
  return 'voybus-dev-secret-no-usar-en-produccion';
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

function firmarToken(usuario) {
  const token = jwt.sign(
    { sub: String(usuario.id), rol: usuario.rol, tipo_acceso: usuario.tipo_acceso },
    secretoJwt(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  );
  const { exp } = jwt.decode(token);
  return { token, token_type: 'Bearer', expira_en: new Date(exp * 1000).toISOString() };
}

/**
 * @param {ReturnType<import('../../database/models').initModels>} models
 * @param {{ ahora?: () => Date }} [opciones] `ahora` permite controlar el reloj en las pruebas
 */
function createAuthService({ sequelize, Usuario }, { ahora = () => new Date() } = {}) {
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
