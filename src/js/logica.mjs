// Funciones puras: las usan el navegador, el build y las pruebas.
// Sin DOM ni Date.now() implícito, para que sean fáciles de probar.

/** Dinero en centavos: evita errores de redondeo (7,5 x 3 = 22,5). */
export const aCentavos = (valor) => Math.round(Number(valor) * 100);

/** 7500 -> "$75"; 750 -> "$7,50". Coma decimal, como se lee en Ecuador. */
export function formatearMoneda(centavos) {
  const euros = centavos / 100;
  return Number.isInteger(euros)
    ? `$${euros}`
    : `$${euros.toFixed(2).replace('.', ',')}`;
}

export const contarPersonas = (g) => g.adultos + g.ninos + g.menores;

/** Los menores de la edad gratuita pagan 0, por eso no entran en la suma. */
export function totalCentavos(precios, g) {
  return g.adultos * aCentavos(precios.adulto) + g.ninos * aCentavos(precios.nino);
}

/** Devuelve los códigos de error del grupo; lista vacía = grupo válido. */
export function validarGrupo(precios, g) {
  const errores = [];
  const valores = [g.adultos, g.ninos, g.menores];
  if (!valores.every((v) => Number.isInteger(v) && v >= 0)) errores.push('invalido');
  if (g.adultos < precios.minAdultos) errores.push('minAdultos');
  if (contarPersonas(g) > precios.maxPersonas) errores.push('maxPersonas');
  return errores;
}

/** El botón "+" se bloquea cuando el grupo ya está completo. */
export const puedeSumar = (precios, g) => contarPersonas(g) < precios.maxPersonas;

/** El último adulto no se puede quitar: los niños van siempre a cargo de sus padres. */
export const puedeRestarAdulto = (precios, g) => g.adultos > precios.minAdultos;

/**
 * "4 adultos × $15 · 2 niños × $7,50 · 1 menor de 5, gratis". `nombres` trae [singular, plural]
 * por tipo, ya con la edad rellenada, para que aquí no haya texto de la página.
 */
export function desgloseGrupo(g, precios, nombres) {
  const forma = (n, par) => par[n === 1 ? 0 : 1];
  const partes = [];
  if (g.adultos) partes.push(`${g.adultos} ${forma(g.adultos, nombres.adultos)} × ${formatearMoneda(aCentavos(precios.adulto))}`);
  if (g.ninos) partes.push(`${g.ninos} ${forma(g.ninos, nombres.ninos)} × ${formatearMoneda(aCentavos(precios.nino))}`);
  if (g.menores) partes.push(`${g.menores} ${forma(g.menores, nombres.menores)}`);
  return partes.join(' · ');
}

// ---------- Fechas (Ecuador, UTC-5 sin horario de verano) ----------

export function esFechaISO(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

/** Fecha ISO (AAAA-MM-DD) que marca el reloj en la zona indicada, p. ej. "-05:00". */
export function hoyEnZona(ahoraMs, zona) {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(zona);
  if (!m) throw new Error(`Zona horaria inválida: ${zona}`);
  const minutos = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  return new Date(ahoraMs + minutos * 60000).toISOString().slice(0, 10);
}

/** Regla única del sello: vigente hasta el último día, inclusive. */
export const selloVigente = (hoyISO, apertura) => hoyISO <= apertura.hasta;

/**
 * "Hoy" para el sello. Un ?hoy=AAAA-MM-DD válido sirve para simular fechas;
 * solo afecta al sello, nunca a los precios.
 */
export function hoyEfectivo(busqueda, ahoraMs, zona) {
  const simulada = new URLSearchParams(busqueda || '').get('hoy');
  return esFechaISO(simulada) ? simulada : hoyEnZona(ahoraMs, zona);
}

/** Sábado o domingo, a partir de la fecha ISO (UTC para no correr un día). */
export const esFinDeSemana = (iso) => [0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());

/** "2026-12-13" -> "domingo 13 de diciembre de 2026". UTC para no correr un día. */
export function formatearFecha(iso) {
  return new Intl.DateTimeFormat('es-EC', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`)).replace(',', '');
}

// ---------- UTM y mensaje de WhatsApp ----------

/** Lee y limpia los UTM: solo texto corto y sin símbolos raros. */
export function leerUtm(busqueda) {
  const q = new URLSearchParams(busqueda || '');
  const limpio = (v) => (v || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 40);
  return {
    source: limpio(q.get('utm_source')),
    medium: limpio(q.get('utm_medium')),
    campaign: limpio(q.get('utm_campaign')),
  };
}

const minusculaInicial = (t) => t.charAt(0).toLowerCase() + t.slice(1);

/** `faltan` da el texto de relleno para la vista previa cuando aún no hay fecha o franja. */
export function construirMensaje({
  base, fechaISO, franja, adultos, ninos, menores, precios,
  sello = false, notaApertura = '', utm = {}, faltan = {},
}) {
  const [desde, hasta] = precios.ninoEdad;
  const total = formatearMoneda(totalCentavos(precios, { adultos, ninos, menores }));
  const lineas = [
    base,
    `Fecha: ${fechaISO ? formatearFecha(fechaISO) : (faltan.fecha ?? '')}`,
    `Piscina y zona BBQ: ${franja ? minusculaInicial(franja) : (faltan.franja ?? '')}`,
    `Adultos: ${adultos} · Niños de ${desde} a ${hasta}: ${ninos} · Menores de ${precios.gratisMenorDe}: ${menores}`,
    `Total: ${total}${sello && notaApertura ? ` ${notaApertura}` : ''}`,
  ];
  const origen = [utm.source, utm.medium].filter(Boolean).join(' · ');
  if (origen) lineas.push(`Origen: ${origen}`);
  return lineas.join('\n');
}

/** El texto va siempre codificado: saltos de línea, tildes y símbolos incluidos. */
export const urlWhatsapp = (numero, mensaje) =>
  `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
