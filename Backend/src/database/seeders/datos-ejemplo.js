// Datos de ejemplo de VoyBus. Hay dos catálogos de red:
//  - "prueba": una red pequeña y fija (coordenadas aproximadas). La usan las pruebas automáticas.
//  - "antofagasta": líneas reales de Antofagasta con su trazado por las calles, generadas con
//    `npm run catalogo:antofagasta` (ver scripts/antofagasta). Si el archivo no existe, se usa
//    el de prueba.
// Los usuarios y vehículos de demostración son los mismos en ambos.
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const ARCHIVO_ANTOFAGASTA = path.join(__dirname, 'antofagasta.json');

const PASSWORD_DEMO = 'Clave123!';

const LINEAS = [
  { codigo: '103', nombre: 'Costanera – Universidad', color: '#1E5FC9', estado_servicio: 'activa' },
  { codigo: '107', nombre: 'Centro – Terminal Norte', color: '#3D9BE0', estado_servicio: 'activa' },
  {
    codigo: '211',
    nombre: 'Sur – Zona Industrial',
    color: '#0F2A4A',
    estado_servicio: 'suspendida',
  },
  {
    codigo: '305',
    nombre: 'Cerro – Plaza (fuera de operación)',
    color: '#5B6573',
    estado_servicio: 'desactivada',
  },
];

const PARADEROS = [
  ['PA-001', 'Terminal Rodoviario', -23.6345, -70.3975],
  ['PA-002', 'Plaza Colón', -23.65, -70.3975],
  ['PA-003', 'Mall Plaza Antofagasta', -23.636, -70.402],
  ['PA-004', 'Hospital Regional', -23.619, -70.4],
  ['PA-005', 'Universidad de Antofagasta', -23.5805, -70.3985],
  ['PA-006', 'Universidad Católica del Norte', -23.68, -70.411],
  ['PA-007', 'Costanera Norte', -23.612, -70.392],
  ['PA-008', 'Costanera Sur', -23.67, -70.4],
  ['PA-009', 'Terminal Norte', -23.595, -70.39],
  ['PA-010', 'Zona Industrial', -23.7, -70.405],
  ['PA-011', 'Estadio Regional', -23.665, -70.415],
  ['PA-012', 'Av. Argentina', -23.642, -70.408],
  ['PA-013', 'Paradero fuera de uso', -23.63, -70.42, 0],
];

// código de línea -> paraderos de la ida en orden (la vuelta es el mismo orden al revés)
const RECORRIDOS = {
  103: {
    ida: ['PA-001', 'PA-003', 'PA-004', 'PA-007', 'PA-005'],
    dias: 'Lunes a domingo',
    horarios: '06:00 - 23:00, cada 10 min',
  },
  107: {
    ida: ['PA-002', 'PA-001', 'PA-012', 'PA-004', 'PA-009'],
    dias: 'Lunes a sábado',
    horarios: '06:30 - 22:00, cada 15 min',
  },
  211: {
    ida: ['PA-002', 'PA-008', 'PA-006', 'PA-011', 'PA-010'],
    dias: 'Lunes a viernes',
    horarios: '07:00 - 20:00, cada 20 min',
  },
  305: {
    ida: ['PA-002', 'PA-012', 'PA-013'],
    dias: 'Lunes a viernes',
    horarios: '08:00 - 18:00, cada 30 min',
  },
};

// Usuarios de demostración. Todos comparten PASSWORD_DEMO y ya están verificados.
const USUARIOS = [
  {
    rol: 'administrador',
    nombre_visible: 'Admin VoyBus',
    alias: 'admin',
    correo: 'admin@voybus.cl',
    estado: 'habilitado',
  },
  {
    rol: 'conductor',
    nombre_visible: 'Carlos Rojas',
    alias: 'crojas',
    correo: 'carlos.rojas@voybus.cl',
    estado: 'habilitado',
    identificador: 'COND-001',
  },
  {
    rol: 'conductor',
    nombre_visible: 'María Soto',
    alias: 'msoto',
    correo: 'maria.soto@voybus.cl',
    estado: 'habilitado',
    identificador: 'COND-002',
  },
  {
    rol: 'conductor',
    nombre_visible: 'Luis Pérez',
    alias: 'lperez',
    correo: 'luis.perez@voybus.cl',
    estado: 'deshabilitado',
    identificador: 'COND-003',
  },
  {
    rol: 'pasajero',
    nombre_visible: 'Ana Pasajera',
    alias: 'ana',
    correo: 'ana.pasajera@voybus.cl',
    estado: 'habilitado',
  },
];

const ESTADOS_VEHICULO = {
  8: 'operativo_con_observaciones',
  9: 'en_mantenimiento',
  10: 'fuera_de_servicio',
};

/**
 * Sin usuarios de demostración (producción) no existiría ningún administrador. Si el entorno
 * define ADMIN_CORREO y ADMIN_PASSWORD, se crea con esos datos; la contraseña conocida de la
 * demo (PASSWORD_DEMO) nunca llega a producción.
 */
async function crearAdministradorInicial(Usuario, rondas) {
  const correo = (process.env.ADMIN_CORREO || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!correo || password.length < 8) return;
  await Usuario.create({
    rol: 'administrador',
    nombre_visible: 'Administrador',
    correo,
    estado: 'habilitado',
    password_hash: await bcrypt.hash(password, rondas),
    correo_verificado: 1,
    terminos_aceptados_en: new Date().toISOString(),
  });
}

/** El catálogo de prueba en el mismo formato que el de Antofagasta. */
function catalogoPrueba() {
  return {
    lineas: LINEAS.map((l) => {
      const r = RECORRIDOS[l.codigo];
      const base = { dias: r.dias, horarios: r.horarios, trazado: null };
      return {
        ...l,
        recorridos: {
          ida: { ...base, paraderos: r.ida },
          vuelta: { ...base, paraderos: [...r.ida].reverse() },
        },
      };
    }),
    paraderos: PARADEROS,
  };
}

/** El catálogo pedido ("prueba" o "antofagasta"). */
function leerCatalogo(nombre) {
  if (nombre !== 'antofagasta') return { nombre: 'prueba', ...catalogoPrueba() };
  if (!fs.existsSync(ARCHIVO_ANTOFAGASTA)) {
    console.warn(
      'No existe src/database/seeders/antofagasta.json: se carga la red de prueba. Para generarlo: npm run catalogo:antofagasta',
    );
    return { nombre: 'prueba', ...catalogoPrueba() };
  }
  const datos = JSON.parse(fs.readFileSync(ARCHIVO_ANTOFAGASTA, 'utf8'));
  return { nombre: 'antofagasta', lineas: datos.lineas, paraderos: datos.paraderos };
}

/**
 * Carga los datos de ejemplo. Pensado para una base recién migrada.
 * @param {{ usuariosDemo?: boolean, catalogo?: 'prueba' | 'antofagasta' }} [opciones]
 * @returns {Promise<{ catalogo: string }>} el catálogo que se cargó
 */
async function cargarDatosEjemplo(
  { Usuario, Linea, Recorrido, Paradero, RecorridoParadero, Vehiculo },
  { usuariosDemo = true, catalogo = 'prueba' } = {},
) {
  const red = leerCatalogo(catalogo);
  const ahora = new Date().toISOString();

  const paraderoId = {};
  for (const [codigo, nombre, latitud, longitud, activo = 1] of red.paraderos) {
    paraderoId[codigo] = (await Paradero.create({ codigo, nombre, latitud, longitud, activo })).id;
  }

  for (const { recorridos, ...datosLinea } of red.lineas) {
    const linea = await Linea.create(datosLinea);
    for (const [sentido, r] of Object.entries(recorridos)) {
      const recorrido = await Recorrido.create({
        linea_id: linea.id,
        sentido,
        dias_funcionamiento: r.dias,
        horarios: r.horarios,
        trazado: r.trazado ? JSON.stringify(r.trazado) : null,
        trazado_actualizado_en: r.trazado ? ahora : null,
      });
      await RecorridoParadero.bulkCreate(
        r.paraderos.map((p, i) => ({
          recorrido_id: recorrido.id,
          orden: i + 1,
          paradero_id: paraderoId[p],
        })),
      );
    }
  }

  const rondas = Number(process.env.BCRYPT_ROUNDS) || 10;
  if (usuariosDemo) {
    const passwordHash = await bcrypt.hash(PASSWORD_DEMO, rondas);
    for (const u of USUARIOS) {
      await Usuario.create({
        ...u,
        password_hash: passwordHash,
        correo_verificado: 1,
        terminos_aceptados_en: new Date().toISOString(),
      });
    }
  } else {
    await crearAdministradorInicial(Usuario, rondas);
  }

  for (let i = 1; i <= 10; i++) {
    await Vehiculo.create({
      identificador: `BUS-${String(i).padStart(2, '0')}`,
      patente: `VB${10 + i - 1}-${20 + i - 1}`,
      capacidad: 40 + ((i - 1) % 3) * 5,
      estado_operativo: ESTADOS_VEHICULO[i] || 'operativo',
    });
  }
  return { catalogo: red.nombre };
}

module.exports = { cargarDatosEjemplo, catalogoPrueba, ARCHIVO_ANTOFAGASTA };
