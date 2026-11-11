// Las fechas viajan al servidor en ISO 8601 (UTC) y se muestran en la hora local del celular.

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const dos = (n: number) => String(n).padStart(2, '0');

/** "2026-12-10" de hoy, en hora local. */
export function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

export const fechaValida = (texto: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(texto) && !Number.isNaN(new Date(`${texto}T00:00:00`).getTime());

export const horaValida = (texto: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(texto);

/** Une fecha local (AAAA-MM-DD) y hora local (HH:MM) y devuelve el ISO para el servidor. */
export function aIso(fecha: string, hora: string) {
  return new Date(`${fecha}T${hora}:00`).toISOString();
}

export function horaLocal(iso: string) {
  const d = new Date(iso);
  return `${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export function fechaLocal(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** "jue 10-12 · 08:00". */
export function fechaHora(iso: string) {
  const d = new Date(iso);
  return `${DIAS[d.getDay()]} ${dos(d.getDate())}-${dos(d.getMonth() + 1)} · ${horaLocal(iso)}`;
}

/** "08:00 – 16:00". */
export const rangoHoras = (inicio: string, termino: string) =>
  `${horaLocal(inicio)} – ${horaLocal(termino)}`;
