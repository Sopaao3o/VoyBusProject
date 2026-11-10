// Datos de ejemplo de VoyBus (coordenadas aproximadas de Antofagasta, solo para demostración).
const LINEAS = [
  { codigo: '103', nombre: 'Costanera – Universidad', color: '#1E5FC9', estado_servicio: 'activa' },
  { codigo: '107', nombre: 'Centro – Terminal Norte', color: '#3D9BE0', estado_servicio: 'activa' },
  { codigo: '211', nombre: 'Sur – Zona Industrial', color: '#0F2A4A', estado_servicio: 'suspendida' },
  { codigo: '305', nombre: 'Cerro – Plaza (fuera de operación)', color: '#5B6573', estado_servicio: 'desactivada' },
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
  '103': { ida: ['PA-001', 'PA-003', 'PA-004', 'PA-007', 'PA-005'], dias: 'Lunes a domingo', horarios: '06:00 - 23:00, cada 10 min' },
  '107': { ida: ['PA-002', 'PA-001', 'PA-012', 'PA-004', 'PA-009'], dias: 'Lunes a sábado', horarios: '06:30 - 22:00, cada 15 min' },
  '211': { ida: ['PA-002', 'PA-008', 'PA-006', 'PA-011', 'PA-010'], dias: 'Lunes a viernes', horarios: '07:00 - 20:00, cada 20 min' },
  '305': { ida: ['PA-002', 'PA-012', 'PA-013'], dias: 'Lunes a viernes', horarios: '08:00 - 18:00, cada 30 min' },
};

// Usuarios de demostración. password_hash queda vacío: el login lo implementa Daslav.
const USUARIOS = [
  { rol: 'administrador', nombre_visible: 'Admin VoyBus', alias: 'admin', estado: 'habilitado' },
  { rol: 'conductor', nombre_visible: 'Carlos Rojas', alias: 'crojas', estado: 'habilitado', identificador: 'COND-001' },
  { rol: 'conductor', nombre_visible: 'María Soto', alias: 'msoto', estado: 'habilitado', identificador: 'COND-002' },
  { rol: 'conductor', nombre_visible: 'Luis Pérez', alias: 'lperez', estado: 'deshabilitado', identificador: 'COND-003' },
  { rol: 'pasajero', nombre_visible: 'Ana Pasajera', alias: 'ana', estado: 'habilitado' },
];

const ESTADOS_VEHICULO = { 8: 'operativo_con_observaciones', 9: 'en_mantenimiento', 10: 'fuera_de_servicio' };

/** Carga los datos de ejemplo. Pensado para una base recién migrada. */
async function cargarDatosEjemplo({ Usuario, Linea, Recorrido, Paradero, RecorridoParadero, Vehiculo }) {
  const lineaId = {};
  for (const l of LINEAS) lineaId[l.codigo] = (await Linea.create(l)).id;

  const paraderoId = {};
  for (const [codigo, nombre, latitud, longitud, activo = 1] of PARADEROS) {
    paraderoId[codigo] = (await Paradero.create({ codigo, nombre, latitud, longitud, activo })).id;
  }

  for (const [codigo, r] of Object.entries(RECORRIDOS)) {
    const sentidos = { ida: r.ida, vuelta: [...r.ida].reverse() };
    for (const [sentido, paradas] of Object.entries(sentidos)) {
      const recorrido = await Recorrido.create({
        linea_id: lineaId[codigo],
        sentido,
        dias_funcionamiento: r.dias,
        horarios: r.horarios,
      });
      await RecorridoParadero.bulkCreate(
        paradas.map((p, i) => ({ recorrido_id: recorrido.id, orden: i + 1, paradero_id: paraderoId[p] })),
      );
    }
  }

  for (const u of USUARIOS) await Usuario.create(u);

  for (let i = 1; i <= 10; i++) {
    await Vehiculo.create({
      identificador: `BUS-${String(i).padStart(2, '0')}`,
      patente: `VB${10 + i - 1}-${20 + i - 1}`,
      capacidad: 40 + ((i - 1) % 3) * 5,
      estado_operativo: ESTADOS_VEHICULO[i] || 'operativo',
    });
  }
}

module.exports = { cargarDatosEjemplo };