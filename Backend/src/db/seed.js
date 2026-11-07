// Datos de ejemplo de VoyBus (coordenadas aproximadas de Antofagasta, solo para demo).
const LINEAS = [
  { codigo: '103', nombre: 'Costanera – Universidad', color: '#1E5FC9', estado: 'activa' },
  { codigo: '107', nombre: 'Centro – Terminal Norte', color: '#3D9BE0', estado: 'activa' },
  { codigo: '211', nombre: 'Sur – Zona Industrial', color: '#0F2A4A', estado: 'suspendida' },
  { codigo: '305', nombre: 'Cerro – Plaza (fuera de operación)', color: '#5B6573', estado: 'desactivada' },
];

const PARADEROS = [
  ['PA-001', 'Terminal Rodoviario', -23.6345, -70.3975],
  ['PA-002', 'Plaza Colón', -23.6500, -70.3975],
  ['PA-003', 'Mall Plaza Antofagasta', -23.6360, -70.4020],
  ['PA-004', 'Hospital Regional', -23.6190, -70.4000],
  ['PA-005', 'Universidad de Antofagasta', -23.5805, -70.3985],
  ['PA-006', 'Universidad Católica del Norte', -23.6800, -70.4110],
  ['PA-007', 'Costanera Norte', -23.6120, -70.3920],
  ['PA-008', 'Costanera Sur', -23.6700, -70.4000],
  ['PA-009', 'Terminal Norte', -23.5950, -70.3900],
  ['PA-010', 'Zona Industrial', -23.7000, -70.4050],
  ['PA-011', 'Estadio Regional', -23.6650, -70.4150],
  ['PA-012', 'Av. Argentina', -23.6420, -70.4080],
  ['PA-013', 'Paradero fuera de uso', -23.6300, -70.4200, 0],
];

// línea -> { ida: [códigos de paradero en orden], vuelta: ... }
const RECORRIDOS = {
  '103': { ida: ['PA-001', 'PA-003', 'PA-004', 'PA-007', 'PA-005'], dias: 'Lunes a domingo', horarios: '06:00 - 23:00, cada 10 min' },
  '107': { ida: ['PA-002', 'PA-001', 'PA-012', 'PA-004', 'PA-009'], dias: 'Lunes a sábado', horarios: '06:30 - 22:00, cada 15 min' },
  '211': { ida: ['PA-002', 'PA-008', 'PA-006', 'PA-011', 'PA-010'], dias: 'Lunes a viernes', horarios: '07:00 - 20:00, cada 20 min' },
  '305': { ida: ['PA-002', 'PA-012', 'PA-013'], dias: 'Lunes a viernes', horarios: '08:00 - 18:00, cada 30 min' },
};

const VEHICULOS = Array.from({ length: 10 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  const estados = { 8: 'operativo_con_observaciones', 9: 'en_mantenimiento', 10: 'fuera_de_servicio' };
  return {
    identificador: `BUS-${n}`,
    patente: `VB${String(10 + i)}-${String(20 + i)}`,
    capacidad: 40 + (i % 3) * 5,
    estado: estados[i + 1] || 'operativo',
  };
});

function seed(db) {
  const tx = db.transaction(() => {
    const insLinea = db.prepare('INSERT INTO lineas (codigo,nombre,color,estado_servicio) VALUES (?,?,?,?)');
    const insPar = db.prepare('INSERT INTO paraderos (codigo,nombre,latitud,longitud,activo) VALUES (?,?,?,?,?)');
    const insRec = db.prepare('INSERT INTO recorridos (linea_id,sentido,dias_funcionamiento,horarios,activo) VALUES (?,?,?,?,1)');
    const insRP = db.prepare('INSERT INTO recorrido_paraderos (recorrido_id,orden,paradero_id) VALUES (?,?,?)');
    const insVeh = db.prepare('INSERT INTO vehiculos (identificador,patente,capacidad,estado_operativo) VALUES (?,?,?,?)');

    const lineaId = {};
    for (const l of LINEAS) lineaId[l.codigo] = insLinea.run(l.codigo, l.nombre, l.color, l.estado).lastInsertRowid;

    const parId = {};
    for (const [codigo, nombre, lat, lon, activo = 1] of PARADEROS) {
      parId[codigo] = insPar.run(codigo, nombre, lat, lon, activo).lastInsertRowid;
    }

    for (const [codigo, r] of Object.entries(RECORRIDOS)) {
      const sentidos = { ida: r.ida, vuelta: [...r.ida].reverse() };
      for (const [sentido, paradas] of Object.entries(sentidos)) {
        const recId = insRec.run(lineaId[codigo], sentido, r.dias, r.horarios).lastInsertRowid;
        paradas.forEach((p, i) => insRP.run(recId, i + 1, parId[p]));
      }
    }

    for (const v of VEHICULOS) insVeh.run(v.identificador, v.patente, v.capacidad, v.estado);
  });
  tx();
}

module.exports = { seed };
