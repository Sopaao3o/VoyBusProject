// ACC-01: TOTP (RFC 6238) para la verificación en dos pasos con una aplicación autenticadora.
// Se usa SHA-1, 6 dígitos y pasos de 30 segundos, que es lo que aceptan Google Authenticator,
// Authy, Microsoft Authenticator y similares.
const crypto = require('node:crypto');

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Codifica bytes en base32 sin relleno (el formato que usan los secretos TOTP). */
function base32Codificar(buffer) {
  let bits = 0;
  let valor = 0;
  let salida = '';

  for (const byte of buffer) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  return salida;
}

/** Decodifica base32 ignorando espacios, guiones y relleno. */
function base32Decodificar(texto) {
  const limpio = String(texto)
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, '');
  if (!limpio) throw new Error('El secreto TOTP está vacío');

  let bits = 0;
  let valor = 0;
  const bytes = [];
  for (const caracter of limpio) {
    const indice = ALFABETO_BASE32.indexOf(caracter);
    if (indice < 0) throw new Error(`El secreto TOTP contiene un carácter inválido: ${caracter}`);
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Secreto aleatorio de 160 bits (20 bytes), como recomienda el RFC 4226. */
function generarSecreto(bytes = 20) {
  return base32Codificar(crypto.randomBytes(bytes));
}

/** Paso de 30 segundos al que corresponde una fecha. */
function pasoDe(fecha = new Date(), periodo = 30) {
  return Math.floor(fecha.getTime() / 1000 / periodo);
}

/** Código TOTP para un paso concreto. */
function codigoEnPaso(secreto, paso, digitos = 6) {
  const clave = base32Decodificar(secreto);
  const contador = Buffer.alloc(8);
  contador.writeUInt32BE(Math.floor(paso / 0x100000000), 0);
  contador.writeUInt32BE(paso >>> 0, 4);

  const hmac = crypto.createHmac('sha1', clave).update(contador).digest();
  const desplazamiento = hmac[hmac.length - 1] & 0x0f;
  const binario =
    ((hmac[desplazamiento] & 0x7f) << 24) |
    ((hmac[desplazamiento + 1] & 0xff) << 16) |
    ((hmac[desplazamiento + 2] & 0xff) << 8) |
    (hmac[desplazamiento + 3] & 0xff);

  return String(binario % 10 ** digitos).padStart(digitos, '0');
}

/** Código TOTP de una fecha (o de un paso concreto, útil en las pruebas). */
function codigoTotp(secreto, { fecha, paso, periodo = 30, digitos = 6 } = {}) {
  return codigoEnPaso(secreto, paso ?? pasoDe(fecha, periodo), digitos);
}

/**
 * Comprueba un código permitiendo un paso de margen por desfase de reloj (anterior y siguiente).
 * Devuelve el paso usado, o null si el código no sirve.
 * `ultimoPaso` evita reutilizar un código ya aceptado dentro de su ventana de validez.
 */
function verificarCodigoTotp(
  secreto,
  codigo,
  { fecha, periodo = 30, digitos = 6, ventana = 1, ultimoPaso = null } = {},
) {
  if (typeof codigo !== 'string' || !new RegExp(`^\\d{${digitos}}$`).test(codigo)) return null;

  const paso = pasoDe(fecha, periodo);
  const esperado = Buffer.from(codigo);
  for (let desplazamiento = -ventana; desplazamiento <= ventana; desplazamiento += 1) {
    const candidato = paso + desplazamiento;
    if (ultimoPaso !== null && ultimoPaso !== undefined && candidato <= Number(ultimoPaso)) {
      continue;
    }
    const calculado = Buffer.from(codigoEnPaso(secreto, candidato, digitos));
    if (calculado.length === esperado.length && crypto.timingSafeEqual(calculado, esperado)) {
      return candidato;
    }
  }
  return null;
}

/** URL otpauth:// que el frontend convierte en el QR para la aplicación autenticadora. */
function urlOtpauth({ secreto, cuenta, emisor = 'VoyBus', periodo = 30, digitos = 6 }) {
  const etiqueta = encodeURIComponent(`${emisor}:${cuenta}`);
  const parametros = new URLSearchParams({
    secret: secreto,
    issuer: emisor,
    algorithm: 'SHA1',
    digits: String(digitos),
    period: String(periodo),
  });
  return `otpauth://totp/${etiqueta}?${parametros.toString()}`;
}

module.exports = {
  base32Codificar,
  base32Decodificar,
  generarSecreto,
  pasoDe,
  codigoEnPaso,
  codigoTotp,
  verificarCodigoTotp,
  urlOtpauth,
};
