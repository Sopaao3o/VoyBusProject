// Arma el catálogo "antofagasta" a partir de los itinerarios oficiales (lineas.js), las calles
// de OpenStreetMap y el motor de rutas OSRM. Aquí están los cálculos; generar.js descarga los
// datos y escribe los archivos. Todo en metros, con una proyección plana local.

const { simplificar } = require('../../ubicacion/geo');

const M_LAT = 110_540;
const M_LNG = 111_320;

/** Separación mínima entre paraderos de un mismo recorrido. */
const SEPARACION_MINIMA_M = 350;
/** Si queda un tramo más largo que esto sin paradero, se agregan paraderos intermedios. */
const TRAMO_MAXIMO_M = 900;
/** Paraderos de recorridos distintos a menos de esto son el mismo paradero. */
const MISMO_PARADERO_M = 30;
/** Distancia a la que se buscan cruces entre dos calles del itinerario. */
const RADIO_CRUCE_M = 25;
/** Si dos calles no se cruzan, se acepta su punto más cercano hasta esta distancia. */
const CRUCE_LEJANO_M = 400;
/** Cuánto se entra en la calle siguiente después de doblar (para que OSRM tome esa calle). */
const ENTRADA_M = 35;

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Proyección plana alrededor de un origen [lat, lng]. */
function crearProyeccion([lat0, lng0]) {
  const coseno = Math.cos((lat0 * Math.PI) / 180);
  return {
    aXY: ([lat, lng]) => ({ x: (lng - lng0) * M_LNG * coseno, y: (lat - lat0) * M_LAT }),
    aLatLng: ({ x, y }) => [
      Number((lat0 + y / M_LAT).toFixed(6)),
      Number((lng0 + x / (M_LNG * coseno)).toFixed(6)),
    ],
  };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Punto de [a, b] más cercano a p, con su distancia y la fracción t del segmento. */
function cercanoEnSegmento(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0), 1);
  const q = { x: a.x + t * dx, y: a.y + t * dy };
  return { punto: q, d: dist(p, q), t };
}

/** Si los segmentos [a, b] y [c, d] se cortan, el punto de corte; si no, null. */
function corte(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

/** Distancia mínima entre dos segmentos y el punto medio entre sus puntos más cercanos. */
function segmentoASegmento(a, b, c, d) {
  const x = corte(a, b, c, d);
  if (x) return { d: 0, punto: x };
  const opciones = [
    { p: a, q: cercanoEnSegmento(a, c, d).punto },
    { p: b, q: cercanoEnSegmento(b, c, d).punto },
    { p: cercanoEnSegmento(c, a, b).punto, q: c },
    { p: cercanoEnSegmento(d, a, b).punto, q: d },
  ];
  let mejor = null;
  for (const o of opciones) {
    const dd = dist(o.p, o.q);
    if (!mejor || dd < mejor.d) {
      mejor = { d: dd, punto: { x: (o.p.x + o.q.x) / 2, y: (o.p.y + o.q.y) / 2 } };
    }
  }
  return mejor;
}

/** Segmentos con su caja, para descartar rápido los que están lejos. */
function segmentos(lineas) {
  const lista = [];
  for (const puntos of lineas) {
    for (let i = 1; i < puntos.length; i++) {
      const a = puntos[i - 1];
      const b = puntos[i];
      lista.push({
        a,
        b,
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxY: Math.max(a.y, b.y),
      });
    }
  }
  return lista;
}

const cajasCerca = (s, o, r) =>
  s.minX - r <= o.maxX && o.minX - r <= s.maxX && s.minY - r <= o.maxY && o.minY - r <= s.maxY;

/**
 * Lugares donde la calle A se junta con la calle B (puede haber varios: calles largas o con
 * el mismo nombre en otro sector). Si no se tocan, el punto más cercano (si está razonablemente
 * cerca), marcado como `lejano`.
 */
function cruces(segsA, segsB) {
  const encontrados = [];
  let masCercano = null;
  for (const s of segsA) {
    for (const o of segsB) {
      if (!cajasCerca(s, o, CRUCE_LEJANO_M)) continue;
      const r = segmentoASegmento(s.a, s.b, o.a, o.b);
      if (!masCercano || r.d < masCercano.d) masCercano = r;
      if (r.d <= RADIO_CRUCE_M) encontrados.push(r);
    }
  }
  // Se agrupan los puntos a menos de 80 m (un mismo cruce aparece en varios segmentos).
  const grupos = [];
  for (const e of encontrados.sort((x, y) => x.d - y.d)) {
    if (!grupos.some((g) => dist(g.punto, e.punto) < 80)) grupos.push(e);
  }
  if (grupos.length > 0) return grupos.map((g) => ({ ...g.punto, d: g.d, lejano: false }));
  if (masCercano && masCercano.d <= CRUCE_LEJANO_M) {
    return [{ ...masCercano.punto, d: masCercano.d, lejano: true }];
  }
  return [];
}

/**
 * Elige un cruce por capa de modo que el camino inicio → cruces → fin sea lo más corto
 * posible (las micros no dan vueltas innecesarias). Programación dinámica por capas.
 */
function elegirCamino(inicio, capas, fin) {
  let anterior = [{ punto: inicio, costo: 0, camino: [] }];
  for (const capa of capas) {
    anterior = capa.map((c) => {
      let mejor = null;
      for (const a of anterior) {
        const costo = a.costo + dist(a.punto, c);
        if (!mejor || costo < mejor.costo) mejor = { costo, camino: [...a.camino, c] };
      }
      return { punto: c, ...mejor };
    });
  }
  let mejor = null;
  for (const a of anterior) {
    const costo = a.costo + dist(a.punto, fin);
    if (!mejor || costo < mejor.costo) mejor = { costo, camino: a.camino };
  }
  return mejor.camino;
}

/** Punto de la calle más cercano a p. */
function llevarACalle(p, segs) {
  let mejor = null;
  for (const s of segs) {
    const r = cercanoEnSegmento(p, s.a, s.b);
    if (!mejor || r.d < mejor.d) mejor = r;
  }
  return mejor ? { ...mejor.punto, d: mejor.d } : { ...p, d: Infinity };
}

/**
 * Un punto de la calle `segs` a `metros` del cruce, del lado que va hacia `siguiente`.
 * Así OSRM entiende que la micro dobla y sigue por esa calle.
 */
function entrarEnCalle(cruce, segs, siguiente, metros = ENTRADA_M) {
  let mejor = null;
  for (const s of segs) {
    if (!cajasCerca(s, { minX: cruce.x, maxX: cruce.x, minY: cruce.y, maxY: cruce.y }, metros + 5))
      continue;
    // Puntos del segmento a exactamente `metros` del cruce (corte con un círculo).
    const dx = s.b.x - s.a.x;
    const dy = s.b.y - s.a.y;
    const fx = s.a.x - cruce.x;
    const fy = s.a.y - cruce.y;
    const A = dx * dx + dy * dy;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - metros * metros;
    const disc = B * B - 4 * A * C;
    if (A === 0 || disc < 0) continue;
    for (const t of [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)]) {
      if (t < 0 || t > 1) continue;
      const p = { x: s.a.x + t * dx, y: s.a.y + t * dy };
      const costo = dist(p, siguiente);
      if (!mejor || costo < mejor.costo) mejor = { punto: p, costo };
    }
  }
  // Solo sirve si de verdad acerca al siguiente punto.
  if (mejor && mejor.costo < dist(cruce, siguiente)) return mejor.punto;
  return cruce;
}

/** Índice de calles para saber el nombre de la calle en un punto y su calle transversal. */
function crearIndiceCalles(vias) {
  const CELDA = 100;
  const celdas = new Map();
  const clave = (cx, cy) => `${cx}:${cy}`;
  for (const via of vias) {
    for (const s of segmentos([via.puntos])) {
      const item = { ...s, nombre: via.nombre, norm: via.norm };
      for (let cx = Math.floor(s.minX / CELDA); cx <= Math.floor(s.maxX / CELDA); cx++) {
        for (let cy = Math.floor(s.minY / CELDA); cy <= Math.floor(s.maxY / CELDA); cy++) {
          const k = clave(cx, cy);
          if (!celdas.has(k)) celdas.set(k, []);
          celdas.get(k).push(item);
        }
      }
    }
  }
  /** Calles con nombre a menos de `radio` m de p, de la más cercana a la más lejana (una por nombre). */
  function cerca(p, radio) {
    const vistos = new Map();
    const r = Math.ceil(radio / CELDA);
    const cx0 = Math.floor(p.x / CELDA);
    const cy0 = Math.floor(p.y / CELDA);
    for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
      for (let cy = cy0 - r; cy <= cy0 + r; cy++) {
        for (const s of celdas.get(clave(cx, cy)) ?? []) {
          const d = cercanoEnSegmento(p, s.a, s.b).d;
          if (d > radio) continue;
          const previo = vistos.get(s.norm);
          if (!previo || d < previo.d) vistos.set(s.norm, { nombre: s.nombre, norm: s.norm, d });
        }
      }
    }
    return [...vistos.values()].sort((a, b) => a.d - b.d);
  }
  return { cerca };
}

/** Recorre una polilínea en metros: largo acumulado y proyección de puntos sobre ella. */
function crearLinea(puntos) {
  const acumulado = [0];
  for (let i = 1; i < puntos.length; i++)
    acumulado.push(acumulado[i - 1] + dist(puntos[i - 1], puntos[i]));
  return {
    puntos,
    largo: acumulado[acumulado.length - 1],
    /** Dónde cae p sobre la línea: metros desde el inicio y distancia a ella. */
    proyectar(p) {
      let mejor = null;
      for (let i = 1; i < puntos.length; i++) {
        const r = cercanoEnSegmento(p, puntos[i - 1], puntos[i]);
        if (!mejor || r.d < mejor.d) {
          mejor = {
            s: acumulado[i - 1] + r.t * (acumulado[i] - acumulado[i - 1]),
            d: r.d,
            punto: r.punto,
          };
        }
      }
      return mejor;
    },
    /** El punto a `s` metros del inicio y si la línea va hacia el norte en ese lugar. */
    puntoEn(s) {
      for (let i = 1; i < puntos.length; i++) {
        if (s <= acumulado[i] || i === puntos.length - 1) {
          const largo = acumulado[i] - acumulado[i - 1] || 1;
          const t = Math.min(Math.max((s - acumulado[i - 1]) / largo, 0), 1);
          const a = puntos[i - 1];
          const b = puntos[i];
          return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), alNorte: b.y >= a.y };
        }
      }
      return { ...puntos[0], alNorte: true };
    },
  };
}

/** Nombre de un paradero: "Calle / Calle que cruza", según las calles que tiene cerca. */
function nombrarParadero(indice, p, preferida) {
  const calles = indice.cerca(p, 60);
  const principal =
    (preferida && calles.find((c) => c.norm === normalizar(preferida) && c.d < 25)) ??
    calles.find((c) => c.d < 20) ??
    calles[0];
  if (!principal) return null;
  const cruce = calles.find((c) => c.norm !== principal.norm && c.d < 60);
  return cruce ? `${principal.nombre} / ${cruce.nombre}` : principal.nombre;
}

/**
 * Elige los paraderos de un recorrido sobre su trazado. Prioriza los paraderos de
 * OpenStreetMap, después los puntos donde la micro dobla, y rellena los tramos largos.
 * @returns {{ s: number, punto: object, nombre: string | null, tipo: string, calle?: string }[]}
 */
function elegirParaderos(linea, candidatos) {
  const elegidos = [
    { s: 0, ...candidatos.inicio },
    { s: linea.largo, ...candidatos.fin },
  ];
  const libre = (s, separacion) => elegidos.every((e) => Math.abs(e.s - s) >= separacion);
  for (const grupo of [candidatos.osm, candidatos.giros]) {
    for (const c of [...grupo].sort((a, b) => a.s - b.s)) {
      if (libre(c.s, SEPARACION_MINIMA_M)) elegidos.push(c);
    }
  }
  elegidos.sort((a, b) => a.s - b.s);
  // Tramos largos sin paradero: se agregan paraderos repartidos parejo.
  const completos = [elegidos[0]];
  for (let i = 1; i < elegidos.length; i++) {
    const desde = elegidos[i - 1].s;
    const tramo = elegidos[i].s - desde;
    if (tramo > TRAMO_MAXIMO_M) {
      const extra = Math.ceil(tramo / 550) - 1;
      for (let k = 1; k <= extra; k++) {
        const s = desde + (tramo * k) / (extra + 1);
        completos.push({ s, punto: linea.puntoEn(s), nombre: null, tipo: 'intermedio' });
      }
    }
    completos.push(elegidos[i]);
  }
  return completos;
}

/**
 * Calcula los waypoints de un recorrido según su itinerario.
 * @param {{ inicio: number[], fin: number[], calles: string[] }} itinerario
 * @param {Map<string, object[]>} segsPorCalle segmentos de cada calle del itinerario
 */
function puntosDelItinerario(itinerario, segsPorCalle, proyeccion) {
  const avisos = [];
  const { calles } = itinerario;
  const segs = calles.map((c) => {
    const s = segsPorCalle.get(c) ?? [];
    if (s.length === 0) avisos.push(`No se encontró la calle "${c}" en OpenStreetMap.`);
    return s;
  });
  const inicioAprox = proyeccion.aXY(itinerario.inicio);
  const finAprox = proyeccion.aXY(itinerario.fin);
  const inicio = segs[0].length ? llevarACalle(inicioAprox, segs[0]) : inicioAprox;
  const fin = segs[segs.length - 1].length
    ? llevarACalle(finAprox, segs[segs.length - 1])
    : finAprox;
  if (inicio.d > 1500)
    avisos.push(`El terminal de inicio queda a ${Math.round(inicio.d)} m de ${calles[0]}.`);
  if (fin.d > 1500)
    avisos.push(
      `El terminal final queda a ${Math.round(fin.d)} m de ${calles[calles.length - 1]}.`,
    );

  const capas = [];
  const pares = [];
  for (let i = 0; i < calles.length - 1; i++) {
    if (segs[i].length === 0 || segs[i + 1].length === 0) continue;
    const c = cruces(segs[i], segs[i + 1]);
    if (c.length === 0) {
      avisos.push(`"${calles[i]}" y "${calles[i + 1]}" no se juntan (se omite ese giro).`);
      continue;
    }
    if (c.every((x) => x.lejano)) {
      avisos.push(
        `"${calles[i]}" y "${calles[i + 1]}" no se tocan: se usa su punto más cercano (${Math.round(c[0].d)} m).`,
      );
    }
    capas.push(c);
    pares.push(i);
  }
  const camino = elegirCamino(inicio, capas, fin);
  // Cada giro se corre un poco hacia adentro de la calle siguiente.
  const giros = camino.map((cruce, k) => {
    const i = pares[k];
    const siguiente = camino[k + 1] ?? fin;
    return {
      punto: entrarEnCalle(cruce, segs[i + 1], siguiente),
      desde: calles[i],
      hacia: calles[i + 1],
    };
  });
  return { inicio, fin, giros, avisos };
}

/** Une los paraderos de todos los recorridos: los que están a menos de 30 m son el mismo. */
function crearRegistroParaderos() {
  const lista = [];
  return {
    lista,
    agregar(punto, nombre, alNorte) {
      const existente = lista.find((p) => dist(p.punto, punto) < MISMO_PARADERO_M);
      if (existente) return existente;
      const nuevo = {
        codigo: `AF-${String(lista.length + 1).padStart(3, '0')}`,
        punto,
        nombre,
        alNorte,
      };
      lista.push(nuevo);
      return nuevo;
    },
    /** Nombres repetidos: se distingue el sentido y, si hace falta, se numeran. */
    nombresUnicos() {
      const porNombre = new Map();
      for (const p of lista) {
        if (!porNombre.has(p.nombre)) porNombre.set(p.nombre, []);
        porNombre.get(p.nombre).push(p);
      }
      for (const [nombre, grupo] of porNombre) {
        if (grupo.length < 2) continue;
        for (const p of grupo) p.nombre = `${nombre} (hacia el ${p.alNorte ? 'norte' : 'sur'})`;
      }
      const vistos = new Map();
      for (const p of lista) {
        const n = (vistos.get(p.nombre) ?? 0) + 1;
        vistos.set(p.nombre, n);
        if (n > 1) p.nombre = `${p.nombre} ${n}`;
      }
    },
  };
}

/** Recorta un nombre largo a 60 caracteres (límite del paradero). */
const recortar = (texto) => (texto.length <= 60 ? texto : `${texto.slice(0, 57).trimEnd()}…`);

/**
 * Genera el catálogo.
 * @param {object} datos
 * @param {{ nombre: string, puntos: number[][] }[]} datos.vias calles con nombre de OpenStreetMap
 * @param {{ nombre: string | null, lat: number, lng: number }[]} datos.paradas paraderos de OpenStreetMap
 * @param {typeof import('./lineas')} datos.definicion
 * @param {(puntos: {latitud: number, longitud: number}[]) => Promise<{ coordenadas: number[][], ajustes: number[] }>} datos.rutear
 * @param {(texto: string) => void} [datos.informar]
 */
async function generarCatalogo({ vias, paradas, definicion, rutear, informar = () => {} }) {
  const { CALLES, LINEAS, SERVICIO, ZONA } = definicion;
  const proyeccion = crearProyeccion([(ZONA[0] + ZONA[2]) / 2, (ZONA[1] + ZONA[3]) / 2]);
  const viasXY = vias.map((v) => ({
    nombre: v.nombre,
    norm: normalizar(v.nombre),
    puntos: v.puntos.map((p) => proyeccion.aXY(p)),
  }));
  const indice = crearIndiceCalles(viasXY);

  const segsPorCalle = new Map();
  for (const [calle, patron] of Object.entries(CALLES)) {
    segsPorCalle.set(
      calle,
      segmentos(viasXY.filter((v) => patron.test(v.norm)).map((v) => v.puntos)),
    );
  }
  const paradasXY = paradas.map((p) => ({
    nombre: p.nombre,
    punto: proyeccion.aXY([p.lat, p.lng]),
  }));

  const registro = crearRegistroParaderos();
  const lineas = [];
  const avisos = [];
  const vista = [];

  for (const def of LINEAS) {
    const [extremoA, extremoB] = def.nombre.split(' – ');
    const recorridos = {};
    for (const sentido of ['ida', 'vuelta']) {
      const itinerario = def[sentido];
      const etiqueta = `Línea ${def.codigo} ${sentido}`;
      const plan = puntosDelItinerario(itinerario, segsPorCalle, proyeccion);
      for (const a of plan.avisos) avisos.push(`${etiqueta}: ${a}`);

      const waypoints = [plan.inicio, ...plan.giros.map((g) => g.punto), plan.fin];
      const latlng = waypoints.map((p) => proyeccion.aLatLng(p));
      const respuesta = await rutear(latlng.map(([latitud, longitud]) => ({ latitud, longitud })));
      respuesta.ajustes.forEach((m, i) => {
        if (m > 30)
          avisos.push(`${etiqueta}: el punto ${i + 1} quedó a ${Math.round(m)} m de una calle.`);
      });
      const trazadoXY = respuesta.coordenadas.map((p) => proyeccion.aXY(p));
      const linea = crearLinea(trazadoXY);

      // Rodeos: tramos de la ruta mucho más largos que la distancia entre sus puntos.
      const posiciones = waypoints.map((w) => linea.proyectar(w).s);
      for (let i = 1; i < waypoints.length; i++) {
        const porCalle = posiciones[i] - posiciones[i - 1];
        const recto = dist(waypoints[i - 1], waypoints[i]);
        if (porCalle > recto * 2.5 && porCalle - recto > 600) {
          const tramo = i === 1 ? 'al salir del terminal' : `después de ${plan.giros[i - 2].hacia}`;
          avisos.push(
            `${etiqueta}: posible rodeo ${tramo} (${Math.round(porCalle)} m por calle, ${Math.round(recto)} m en línea recta).`,
          );
        }
      }

      const [nombreInicio, nombreFin] =
        sentido === 'ida' ? [extremoA, extremoB] : [extremoB, extremoA];
      const candidatos = {
        inicio: { punto: linea.puntoEn(0), nombre: `Terminal ${nombreInicio}`, tipo: 'terminal' },
        fin: {
          punto: linea.puntoEn(linea.largo),
          nombre: `Terminal ${nombreFin}`,
          tipo: 'terminal',
        },
        osm: paradasXY
          .map((p) => ({ ...p, proy: linea.proyectar(p.punto) }))
          .filter((p) => p.proy.d <= 20 && p.proy.s > 150 && p.proy.s < linea.largo - 150)
          .map((p) => ({ s: p.proy.s, punto: p.proy.punto, nombre: p.nombre, tipo: 'osm' })),
        giros: plan.giros.map((g) => {
          const proy = linea.proyectar(g.punto);
          return { s: proy.s, punto: proy.punto, nombre: null, tipo: 'giro', calle: g.hacia };
        }),
      };
      const elegidos = elegirParaderos(linea, candidatos);
      const codigos = [];
      for (const e of elegidos) {
        const punto = linea.puntoEn(e.s);
        const nombre = recortar(
          e.nombre || nombrarParadero(indice, punto, e.calle) || `${etiqueta}, paradero`,
        );
        const paradero = registro.agregar({ x: punto.x, y: punto.y }, nombre, punto.alNorte);
        if (!codigos.includes(paradero.codigo)) codigos.push(paradero.codigo);
      }
      const trazado = simplificar(
        trazadoXY.map((p) => proyeccion.aLatLng(p)),
        2,
      );
      recorridos[sentido] = { ...SERVICIO, paraderos: codigos, trazado };
      informar(`${etiqueta}: ${(linea.largo / 1000).toFixed(1)} km, ${codigos.length} paraderos`);
      vista.push({
        type: 'Feature',
        properties: { linea: def.codigo, sentido, stroke: def.color, 'stroke-width': 4 },
        geometry: { type: 'LineString', coordinates: trazado.map(([lat, lng]) => [lng, lat]) },
      });
    }
    lineas.push({
      codigo: def.codigo,
      nombre: def.nombre,
      color: def.color,
      estado_servicio: 'activa',
      recorridos,
    });
  }

  registro.nombresUnicos();
  const paraderos = registro.lista.map((p) => {
    const [lat, lng] = proyeccion.aLatLng(p.punto);
    vista.push({
      type: 'Feature',
      properties: { codigo: p.codigo, nombre: p.nombre, 'marker-size': 'small' },
      geometry: { type: 'Point', coordinates: [lng, lat] },
    });
    return [p.codigo, p.nombre, lat, lng];
  });

  return {
    catalogo: { lineas, paraderos },
    avisos,
    vistaPrevia: { type: 'FeatureCollection', features: vista },
  };
}

module.exports = {
  generarCatalogo,
  normalizar,
  crearProyeccion,
  cruces,
  segmentos,
  elegirCamino,
  entrarEnCalle,
  elegirParaderos,
  crearLinea,
};
