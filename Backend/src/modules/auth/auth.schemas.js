// Esquemas Zod de ACC-01: registro de pasajero y verificación del contacto.
const { z } = require('zod');

/** Convierte los campos de texto vacíos en "no enviados" (útil cuando el formulario usa uno u otro). */
const opcional = (esquema) =>
  z.preprocess((valor) => {
    if (typeof valor === 'string' && valor.trim() === '') return undefined;
    return valor;
  }, esquema.optional());

const correo = opcional(
  z
    .string({ error: 'El correo electrónico debe ser un texto' })
    .trim()
    .toLowerCase()
    .pipe(z.email('El correo electrónico no es válido')),
);

const telefono = opcional(
  z
    .string({ error: 'El teléfono debe ser un texto' })
    .trim()
    // Acepta +56 9 1234 5678, (56) 9-1234-5678, etc. Se guarda solo con dígitos.
    .transform((valor) => valor.replace(/\D/g, ''))
    .pipe(z.string().regex(/^\d{8,15}$/, 'El teléfono debe tener entre 8 y 15 dígitos')),
);

// La contraseña se valida sin recortar espacios: un espacio no cuenta como símbolo.
const password = z
  .string({ error: 'La contraseña es obligatoria' })
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(15, 'La contraseña debe tener como máximo 15 caracteres')
  .regex(/\p{Lu}/u, 'La contraseña debe incluir al menos una letra mayúscula')
  .regex(/\p{Ll}/u, 'La contraseña debe incluir al menos una letra minúscula')
  .regex(/\d/, 'La contraseña debe incluir al menos un número')
  .regex(/[^\p{L}\p{N}\s]/u, 'La contraseña debe incluir al menos un símbolo');

const registroBody = z
  .object({
    nombre: z
      .string({ error: 'El nombre es obligatorio' })
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(80, 'El nombre admite hasta 80 caracteres'),
    correo,
    telefono,
    password,
    confirmacion: z.string({ error: 'Debes confirmar la contraseña' }),
    acepta_terminos: z.literal(true, {
      error: 'Debes aceptar los términos de privacidad para crear la cuenta',
    }),
  })
  .superRefine((datos, ctx) => {
    if (!datos.correo && !datos.telefono) {
      ctx.addIssue({
        code: 'custom',
        path: ['correo'],
        message: 'Debes indicar un correo electrónico o un teléfono',
      });
    }
    if (datos.password !== datos.confirmacion) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmacion'],
        message: 'La confirmación no coincide con la contraseña',
      });
    }
  });

/** Exige exactamente uno de los dos medios de contacto. */
function unSoloContacto(datos, ctx) {
  const contactos = [datos.correo, datos.telefono].filter(Boolean);
  if (contactos.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['correo'],
      message: 'Indica el correo o el teléfono con el que te registraste',
    });
  }
  if (contactos.length > 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['telefono'],
      message: 'Indica solo un medio de contacto: el correo o el teléfono',
    });
  }
}

const verificacionBody = z
  .object({
    correo,
    telefono,
    codigo: z
      .string({ error: 'El código de verificación es obligatorio' })
      .trim()
      .regex(/^\d{6}$/, 'El código de verificación debe tener 6 dígitos'),
  })
  .superRefine(unSoloContacto);

// ACC-02: para iniciar sesión no se exige la complejidad de una contraseña nueva,
// solo que venga escrita. Así una cuenta antigua también puede ingresar.
const passwordIngreso = z
  .string({ error: 'La contraseña es obligatoria' })
  .min(1, 'La contraseña es obligatoria')
  .max(100, 'La contraseña es demasiado larga');

const sesionBody = z
  .object({
    correo,
    telefono,
    password: passwordIngreso,
  })
  .superRefine(unSoloContacto);

module.exports = { registroBody, verificacionBody, sesionBody };
