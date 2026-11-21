#!/usr/bin/env node
// Genera el catálogo "Antofagasta real" de VoyBus desde la terminal: líneas reales con su
// trazado por las calles y sus paraderos. Lo mismo hace el botón "Generar red de Antofagasta"
// del administrador en la app. Necesita internet y usa servicios gratuitos (OpenStreetMap y OSRM).
//
// Uso, desde la carpeta Backend:
//   npm run catalogo:antofagasta                  (descarga las calles una vez y las guarda)
//   npm run catalogo:antofagasta -- --descargar   (vuelve a descargar las calles)
//
// Escribe src/database/seeders/antofagasta.json (lo carga `npm run db:reset`) y
// data/antofagasta-vista-previa.geojson (para revisarlo en https://geojson.io).
const path = require('node:path');
const { generarYGuardar, RUTAS } = require('../../src/modules/red/antofagasta/catalogo');

const RAIZ = path.join(__dirname, '..', '..');

async function main() {
  const { catalogo, avisos } = await generarYGuardar({
    descargar: process.argv.includes('--descargar'),
    informar: (t) => console.log(`  ${t}`),
  });
  console.log(`\n${catalogo.lineas.length} líneas y ${catalogo.paraderos.length} paraderos.`);
  console.log(`Catálogo: ${path.relative(RAIZ, RUTAS.catalogo)}`);
  console.log(`Vista previa: ${path.relative(RAIZ, RUTAS.vista)} (ábrela en https://geojson.io)`);
  if (avisos.length) {
    console.log(`\nRevisar (${avisos.length}):`);
    for (const a of avisos) console.log(`  - ${a}`);
  } else {
    console.log('\nSin avisos.');
  }
  console.log('\nPara cargarlo: npm run db:reset (o desde la app: Red → Red de Antofagasta)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
