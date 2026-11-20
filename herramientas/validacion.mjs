// Validación de sitio.json y lint de palabras prohibidas (plan §5).
// Lo comparten el build y las pruebas, para que digan lo mismo.
import { esFechaISO } from '../src/js/logica.mjs';

/** Marcadores que la plantilla llena desde precios, apertura y la fecha del build. */
export const MARCADORES = ['adulto', 'nino', 'ninoDesde', 'ninoHasta', 'gratisMenorDe', 'maxPersonas', 'sello', 'anio'];

const esTexto = (v) => typeof v === 'string' && v.trim() !== '';
const esNumPositivo = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const esEntero = (v) => Number.isInteger(v);
const esUrl = (v) => { try { return ['https:', 'http:'].includes(new URL(v).protocol); } catch { return false; } };

export function validarSitio(s) {
  const e = [];
  const exige = (cond, msg) => { if (!cond) e.push(msg); };
  const o = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  const { sitio, negocio, precios, apertura, reserva, redes, medicion, textos } = s || {};
  exige(esUrl(o(sitio).url), 'sitio.url debe ser una dirección https válida');
  exige(esTexto(o(sitio).ogImagen), 'sitio.ogImagen no puede estar vacío');
  for (const k of ['nombre', 'lema', 'lugar', 'localidad', 'region', 'pais']) exige(esTexto(o(negocio)[k]), `negocio.${k} no puede estar vacío`);
  exige(/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(o(negocio).horario || ''), 'negocio.horario debe verse como 08:00-20:00');

  const p = o(precios);
  exige(esNumPositivo(p.adulto), 'precios.adulto debe ser un número mayor que 0');
  exige(esNumPositivo(p.nino), 'precios.nino debe ser un número mayor que 0');
  exige(Array.isArray(p.ninoEdad) && p.ninoEdad.length === 2 && p.ninoEdad.every(esEntero) && p.ninoEdad[0] >= 0 && p.ninoEdad[0] <= p.ninoEdad[1],
    'precios.ninoEdad debe ser [edad mínima, edad máxima], p. ej. [5, 12]');
  exige(esEntero(p.gratisMenorDe) && p.gratisMenorDe > 0, 'precios.gratisMenorDe debe ser un entero mayor que 0');
  if (Array.isArray(p.ninoEdad)) exige(p.gratisMenorDe === p.ninoEdad[0], 'precios.gratisMenorDe debe ser igual a la edad mínima de ninoEdad (si no, hay edades sin precio)');
  exige(esEntero(p.maxPersonas) && p.maxPersonas >= 1, 'precios.maxPersonas debe ser un entero de 1 o más');
  exige(esEntero(p.minAdultos) && p.minAdultos >= 1 && p.minAdultos <= p.maxPersonas, 'precios.minAdultos debe ser un entero de 1 hasta maxPersonas');
  exige(esTexto(p.moneda), 'precios.moneda no puede estar vacío');

  const a = o(apertura);
  exige(esTexto(a.selloTexto), 'apertura.selloTexto no puede estar vacío');
  exige(esTexto(a.selloCorto), 'apertura.selloCorto no puede estar vacío');
  exige(esFechaISO(a.hasta), 'apertura.hasta debe ser una fecha real con formato AAAA-MM-DD');
  exige(/^[+-]\d{2}:\d{2}$/.test(a.zonaHoraria || ''), 'apertura.zonaHoraria debe verse como -05:00');

  const r = o(reserva);
  exige(/^\d{10,15}$/.test(r.whatsapp || ''), 'reserva.whatsapp debe tener solo dígitos con código de país (sin + ni espacios)');
  exige(Array.isArray(r.franjas) && r.franjas.length >= 1 && r.franjas.every(esTexto), 'reserva.franjas debe tener al menos una franja con texto');
  exige(esTexto(r.notaApertura), 'reserva.notaApertura no puede estar vacío');
  const m = o(r.mensajes);
  const claves = ['principal', 'calculadora', 'pie'];
  for (const k of claves) {
    exige(esTexto(m[k]), `reserva.mensajes.${k} no puede estar vacío`);
    exige(!esTexto(m[k]) || /\bhola\b/i.test(m[k]), `reserva.mensajes.${k} debe estar en español y empezar saludando ("Hola, …")`);
  }
  exige(new Set(claves.map((k) => m[k])).size === claves.length, 'Los tres mensajes de WhatsApp (principal, calculadora y pie) deben ser distintos entre sí');

  for (const k of ['instagram', 'tiktok', 'maps']) exige(esUrl(o(redes)[k]), `redes.${k} debe ser una dirección válida`);
  exige(typeof o(medicion).ga4Id === 'string' && (medicion.ga4Id === '' || /^G-[A-Z0-9]+$/.test(medicion.ga4Id)), 'medicion.ga4Id debe estar vacío o verse como G-XXXXXXXXXX');
  exige(esTexto(o(medicion).evento), 'medicion.evento no puede estar vacío');

  const t = o(textos);
  const textosDe = (obj, claves, ruta) => { for (const k of claves) exige(esTexto(o(obj)[k]), `${ruta}.${k} no puede estar vacío`); };
  textosDe(t, ['saltar', 'flotante', 'preguntasTitulo', 'noIncluye'], 'textos');
  textosDe(t.meta, ['titulo', 'descripcion', 'ogTitulo'], 'textos.meta');
  textosDe(t.hero, ['etiqueta', 'titulo', 'linea', 'pista'], 'textos.hero');
  textosDe(t.resumen, ['titulo', 'grupo', 'precio', 'precioNinos', 'boton', 'enlace'], 'textos.resumen');
  textosDe(t.video, ['reproducir', 'pausar'], 'textos.video');
  textosDe(t.noEncontrada, ['titulo', 'enlace'], 'textos.noEncontrada');
  exige(Array.isArray(t.incluye) && t.incluye.length > 0 && t.incluye.every(esTexto), 'textos.incluye debe ser una lista de textos');
  exige(Array.isArray(t.momentos) && t.momentos.length > 0 && t.momentos.every((x) => /^m-\d{4}$/.test(o(x).id || '') && /^\d{1,2}:\d{2}$/.test(x.hora || '')
    && esTexto(x.titulo) && esTexto(x.texto) && typeof x.etiqueta === 'string' && Array.isArray(x.medios) && x.medios.length > 0),
  'cada elemento de textos.momentos necesita id (m-HHMM), hora, etiqueta, titulo, texto y medios');
  exige(Array.isArray(t.preguntas) && t.preguntas.length > 0 && t.preguntas.every((x) => esTexto(o(x).p) && Array.isArray(x.r) && x.r.length > 0 && x.r.every(esTexto)),
    'cada elemento de textos.preguntas necesita p y r (lista de párrafos)');
  const c = o(t.calculadora);
  textosDe(c, ['titulo', 'intro', 'fecha', 'franja', 'franjaNota', 'totalEtiqueta', 'vistaPrevia', 'boton', 'bajoBoton'], 'textos.calculadora');
  for (const k of ['adultos', 'ninos', 'menores']) textosDe(c[k], ['nombre', 'nota', 'quitar', 'sumar'], `textos.calculadora.${k}`);
  textosDe(c.avisos, ['maximo', 'minimoAdulto', 'faltaFecha', 'faltaFranja', 'fechaPasada'], 'textos.calculadora.avisos');
  textosDe(c.notaFecha, ['finDeSemana', 'entreSemana'], 'textos.calculadora.notaFecha');
  textosDe(c.vacio, ['fecha', 'franja'], 'textos.calculadora.vacio');
  for (const k of ['adultos', 'ninos', 'menores']) exige(Array.isArray(o(c.desglose)[k]) && c.desglose[k].length === 2 && c.desglose[k].every(esTexto), `textos.calculadora.desglose.${k} debe ser [singular, plural]`);
  exige(['adultos', 'ninos', 'menores'].every((k) => Number.isInteger(o(c.inicial)[k]) && c.inicial[k] >= 0), 'textos.calculadora.inicial necesita adultos, ninos y menores (enteros)');
  textosDe(t.pie, ['lema', 'lugar', 'horario', 'boton', 'derechos'], 'textos.pie');
  textosDe(o(t.pie).enlaces, ['instagram', 'tiktok', 'maps', 'whatsapp'], 'textos.pie.enlaces');
  // Un marcador mal escrito ({adulot}) saldría tal cual en la página: se detecta aquí.
  for (const [ruta, valor] of cadenas(t)) {
    for (const [, k] of valor.matchAll(/\{(\w+)\}/g)) exige(MARCADORES.includes(k), `textos.${ruta}: el marcador {${k}} no existe`);
  }
  return e;
}

// ---------- Recorrido de cadenas ----------

export function* cadenas(obj, ruta = '') {
  if (typeof obj === 'string') yield [ruta, obj];
  else if (Array.isArray(obj)) for (const [i, v] of obj.entries()) yield* cadenas(v, `${ruta}[${i}]`);
  else if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) yield* cadenas(v, ruta ? `${ruta}.${k}` : k);
}

export const buscarPendientes = (sitio) =>
  [...cadenas(sitio)].filter(([, v]) => v.includes('TODO-DIRECCION')).map(([ruta]) => ruta);

// ---------- Palabras prohibidas (plan §5) ----------

const borde = (t) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${t})(?![\\p{L}\\p{N}_])`, 'iu');
const PROHIBIDAS = [
  ['salvavidas', borde('salvavidas?')],
  ['entrada', borde('entradas?')],
  ['exclusivo/a', borde('exclusiv[oa]s?')],
  ['VIP', borde('vip')],
  ['glamping', borde('glamping')],
  ['paraíso', borde('para[ií]so')],
  ['reserva ya', borde('reserva\\s+ya')],
  ['últimos cupos', borde('[úu]ltimos\\s+cupos')],
  ['solo hoy', borde('s[óo]lo\\s+hoy')],
  ['hay cupos', borde('hay\\s+cupos')],
  ['te recibimos', borde('te\\s+recibimos')],
  ['sin multitudes', borde('sin\\s+multitudes')],
  ['!!', /!!/],
];

export function buscarProhibidas(texto) {
  return PROHIBIDAS.filter(([, re]) => re.test(texto)).map(([nombre]) => nombre);
}

/** Texto que ve el visitante o leen los buscadores: cuerpo, alt, meta y JSON-LD. */
export function textoLintable(html) {
  const sinCodigo = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/gi, '');
  const atributos = [...sinCodigo.matchAll(/\b(?:content|alt|title|aria-label)="([^"]*)"/g)].map((m) => m[1]);
  return `${sinCodigo.replace(/<[^>]+>/g, ' ')}\n${atributos.join('\n')}`;
}
