// Líneas reales de micros de Antofagasta que carga el catálogo "antofagasta" de VoyBus.
//
// Fuente de los itinerarios: Letreros Únicos de Recorrido (LUR) del Perímetro de Exclusión de
// Antofagasta, Dirección de Transporte Público Regional (DTPR), Ministerio de Transportes:
// https://www.dtpr.gob.cl/pdf/perimetros/antofagasta/Resoluciones_Generales/MNG_Antofagasta.pdf
// Los LUR listan los ejes principales en orden; el generador traza el camino por esas calles.
//
// `calles`: el itinerario oficial, en orden. `buscar`: cómo se llama la calle en OpenStreetMap
// (expresión sobre el nombre en minúsculas y sin tildes). `inicio` y `fin`: un punto
// aproximado del terminal [latitud, longitud]; el generador lo lleva a la primera y a la
// última calle del itinerario.
//
// Los días, horarios y colores no vienen en la fuente: son de demostración.

/** Calles de los itinerarios y cómo encontrarlas en OpenStreetMap. */
const CALLES = {
  'Av. Angamos': /\bangamos\b/,
  'Av. Argentina': /\bargentina\b/,
  'Av. Pedro Aguirre Cerda': /aguirre cerda/,
  'Av. Bonilla': /\bbonilla\b/,
  'Av. Pérez Canto': /perez canto/,
  'Av. Salvador Allende': /salvador allende/,
  'Jaime Guzmán': /jaime guzman/,
  Croacia: /\bcroacia\b/,
  Uribe: /\buribe\b/,
  Condell: /\bcondell\b/,
  'Oviedo Cavada': /oviedo cavada/,
  'Nicolás Tirado': /nicolas tirado/,
  'Oficina Petronila': /petronila/,
  Bandera: /\bbandera\b/,
  Llanquihue: /llanquihue/,
  Matta: /\bmatta\b/,
  Maipú: /\bmaipu\b/,
  Ossa: /\bossa\b/,
  'Simón Bolívar': /simon bolivar/,
  'Víctor Jara': /victor jara/,
  Huamachuco: /huamachuco/,
  'Juan Bolívar': /juan bolivar/,
  'Isabel Riquelme': /isabel riquelme/,
  '21 de Mayo': /\b21 de mayo\b/,
  'Andrés Sabella': /sabella/,
  'Padre Alberto Hurtado': /alberto hurtado/,
  Paraguay: /\bparaguay\b/,
  Sucre: /\bsucre\b/,
  Ricaventura: /ricaventura/,
  'Oficina Carmela': /carmela/,
  'Antonio Rendic': /\brendic\b/,
  Iquique: /\biquique\b/,
  'San Martín': /\bsan martin\b/,
  'Los Zafiros': /zafiros/,
  'Gladys Marín': /gladys marin/,
  Orella: /\borella\b/,
  'Eduardo Orchard': /orchard/,
  Teatinos: /teatinos/,
  Latorre: /\blatorre\b/,
  Copiapó: /\bcopiapo\b/,
};

// Puntos aproximados de los terminales.
const T = {
  elHuascar: [-23.6985, -70.4125],
  uAntofagasta: [-23.7036, -70.4196],
  llacolen: [-23.712, -70.418],
  plazaMatta: [-23.6455, -70.3963],
  petronila: [-23.5635, -70.3805],
  chanida: [-23.5565, -70.382],
  carmela: [-23.5705, -70.3815],
  zafiros: [-23.566, -70.378],
  parqueRecuerdo: [-23.5585, -70.3775],
  costaLaguna: [-23.5605, -70.3795],
  oviedoCavada: [-23.6395, -70.3925],
};

const SERVICIO = { dias: 'Lunes a domingo', horarios: '06:00 - 23:00, cada 10 a 15 min' };

const LINEAS = [
  {
    codigo: '102',
    nombre: 'El Huáscar – Parque del Recuerdo',
    color: '#E07A1F',
    ida: {
      inicio: T.elHuascar,
      fin: T.petronila,
      calles: [
        'Croacia',
        'Av. Argentina',
        'Uribe',
        'Condell',
        'Oviedo Cavada',
        'Nicolás Tirado',
        'Av. Pedro Aguirre Cerda',
        'Oficina Petronila',
      ],
    },
    vuelta: {
      inicio: T.petronila,
      fin: T.elHuascar,
      calles: [
        'Oficina Petronila',
        'Nicolás Tirado',
        'Bandera',
        'Llanquihue',
        'Matta',
        'Maipú',
        'Av. Angamos',
        'Croacia',
      ],
    },
  },
  {
    codigo: '103',
    nombre: 'El Huáscar – Chanida',
    color: '#1E5FC9',
    ida: {
      inicio: T.elHuascar,
      fin: T.chanida,
      calles: [
        'Av. Angamos',
        'Ossa',
        'Simón Bolívar',
        'Víctor Jara',
        'Av. Bonilla',
        'Huamachuco',
        'Juan Bolívar',
        'Av. Pedro Aguirre Cerda',
      ],
    },
    vuelta: {
      inicio: T.chanida,
      fin: T.elHuascar,
      calles: [
        'Av. Pedro Aguirre Cerda',
        'Juan Bolívar',
        'Huamachuco',
        'Av. Bonilla',
        'Isabel Riquelme',
        'Víctor Jara',
        'Maipú',
        'Av. Angamos',
      ],
    },
  },
  {
    codigo: '107',
    nombre: 'Llacolén – La Chimba',
    color: '#2E7D32',
    ida: {
      inicio: T.llacolen,
      fin: T.petronila,
      calles: [
        'Jaime Guzmán',
        'Av. Angamos',
        'Av. Argentina',
        '21 de Mayo',
        'Ossa',
        'Andrés Sabella',
        'Padre Alberto Hurtado',
        'Av. Bonilla',
        'Oficina Petronila',
      ],
    },
    vuelta: {
      inicio: T.petronila,
      fin: T.llacolen,
      calles: [
        'Oficina Petronila',
        'Av. Pérez Canto',
        'Av. Bonilla',
        'Padre Alberto Hurtado',
        'Andrés Sabella',
        'Matta',
        'Uribe',
        'Av. Angamos',
        'Jaime Guzmán',
      ],
    },
  },
  {
    codigo: '108',
    nombre: 'Plaza Matta – La Chimba',
    color: '#7B3FB2',
    ida: {
      inicio: T.oviedoCavada,
      fin: T.carmela,
      calles: [
        'Oviedo Cavada',
        'Paraguay',
        'Padre Alberto Hurtado',
        'Sucre',
        'Av. Salvador Allende',
        'Av. Bonilla',
        'Isabel Riquelme',
        'Av. Pedro Aguirre Cerda',
        'Ricaventura',
      ],
    },
    vuelta: {
      inicio: T.carmela,
      fin: T.plazaMatta,
      calles: [
        'Oficina Carmela',
        'Ricaventura',
        'Av. Pedro Aguirre Cerda',
        'Antonio Rendic',
        'Av. Bonilla',
        'Padre Alberto Hurtado',
        '21 de Mayo',
        'Iquique',
        'Llanquihue',
      ],
    },
  },
  {
    codigo: '119',
    nombre: 'Universidad de Antofagasta – La Chimba',
    color: '#D92B3A',
    ida: {
      inicio: T.uAntofagasta,
      fin: T.zafiros,
      calles: [
        'Av. Angamos',
        'Uribe',
        'San Martín',
        'Av. Pedro Aguirre Cerda',
        'Oficina Petronila',
        'Ricaventura',
        'Oficina Carmela',
        'Los Zafiros',
      ],
    },
    vuelta: {
      inicio: T.zafiros,
      fin: T.uAntofagasta,
      calles: [
        'Los Zafiros',
        'Gladys Marín',
        'Av. Pedro Aguirre Cerda',
        'Ricaventura',
        'Orella',
        'Matta',
        'Av. Angamos',
        'Av. Argentina',
      ],
    },
  },
  {
    codigo: '129',
    nombre: 'Universidad de Antofagasta – Parque del Recuerdo',
    color: '#0F2A4A',
    ida: {
      inicio: T.uAntofagasta,
      fin: T.parqueRecuerdo,
      calles: [
        'Av. Angamos',
        'Eduardo Orchard',
        'Ossa',
        'Condell',
        'Antonio Rendic',
        'Teatinos',
        'Nicolás Tirado',
        'Av. Pérez Canto',
      ],
    },
    vuelta: {
      inicio: T.costaLaguna,
      fin: T.uAntofagasta,
      calles: [
        'Av. Pedro Aguirre Cerda',
        'Av. Pérez Canto',
        'Nicolás Tirado',
        'Antonio Rendic',
        'Latorre',
        'Copiapó',
        'Av. Angamos',
      ],
    },
  },
];

/** Rectángulo de Antofagasta urbano: sur, oeste, norte, este. */
const ZONA = [-23.75, -70.45, -23.53, -70.36];

module.exports = { CALLES, LINEAS, SERVICIO, ZONA };
