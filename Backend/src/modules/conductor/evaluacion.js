/**
 * Compara una hora planificada con la real usando el margen de tolerancia (en minutos).
 * Devuelve null si todavía no hay hora real.
 *  - a_tiempo: dentro del margen
 *  - atraso: más tarde que el margen
 *  - termino_anticipado: (solo al terminar) más temprano que el margen
 */
function evaluar(planificado, real, margen, esTermino) {
  if (!real) return null;
  const minutos = Math.round((Date.parse(real) - Date.parse(planificado)) / 60000);
  let estado = 'a_tiempo';
  if (minutos > margen) estado = 'atraso';
  else if (esTermino && minutos < -margen) estado = 'termino_anticipado';
  return { minutos, estado };
}

module.exports = { evaluar };
