// Lógica pura de "El día gira" (v2). Sin DOM: la usan el navegador y las pruebas.

const ZONA = 'America/Guayaquil';

/** Fecha (AAAA-MM-DD) y hora decimal (0-24) de un instante, en hora de Ecuador. */
export function ahoraEnEcuador(ms = Date.now()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
  );
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: Number(partes.hour) + Number(partes.minute) / 60 };
}

/**
 * Qué franjas ya pasaron. Solo si la fecha elegida es hoy (hora de Ecuador): una franja pasó
 * cuando la hora actual alcanzó su fin. Cualquier otro día, ninguna.
 * @param {string} fechaElegida AAAA-MM-DD
 * @param {number[]} fines hora en que termina cada franja
 * @returns {boolean[]}
 */
export function franjasPasadas(fechaElegida, fines, ahora = ahoraEnEcuador()) {
  if (fechaElegida !== ahora.fecha) return fines.map(() => false);
  return fines.map((fin) => ahora.hora >= fin);
}

/**
 * Hora del día (8 a 20) según el scroll, interpolando entre anclas.
 * @param {number} y posición de scroll
 * @param {{y:number,h:number}[]} anclas ordenadas por y
 */
export function horaPorScroll(y, anclas) {
  if (!anclas.length) return 8;
  if (y <= anclas[0].y) return anclas[0].h;
  for (let i = 1; i < anclas.length; i++) {
    const a = anclas[i - 1];
    const b = anclas[i];
    if (y <= b.y) return b.y === a.y ? b.h : a.h + ((y - a.y) / (b.y - a.y)) * (b.h - a.h);
  }
  return anclas.at(-1).h;
}

/** 10.5 -> "10:30". Redondea a pasos de 10 minutos para no reescribir el texto en cada cuadro. */
export function etiquetaHora(h) {
  const pasos = Math.round(h * 6);
  const horas = Math.floor(pasos / 6);
  const minutos = (pasos % 6) * 10;
  return `${horas}:${String(minutos).padStart(2, '0')}`;
}

/** Parte un texto en frases (para que aparezca línea por línea). */
export function frases(texto) {
  return texto.split(/(?<=[.!?])\s+/).map((f) => f.trim()).filter(Boolean);
}

export const acotar = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
