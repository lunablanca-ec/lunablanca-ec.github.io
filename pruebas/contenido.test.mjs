import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { RAIZ, sitio, construirEnTemporal } from './ayudas.mjs';
import { validarSitio, buscarProhibidas, buscarPendientes, cadenas } from '../herramientas/validacion.mjs';

const s = sitio();

test('sitio.json es válido', () => {
  assert.deepEqual(validarSitio(s), []);
});

test('el validador detecta datos malos', () => {
  const malo = structuredClone(s);
  malo.precios.maxPersonas = 0;
  malo.apertura.hasta = '2026-02-30';
  malo.reserva.mensajes.pie = malo.reserva.mensajes.principal;
  const e = validarSitio(malo).join('\n');
  assert.match(e, /maxPersonas/);
  assert.match(e, /apertura\.hasta/);
  assert.match(e, /distintos/);
});

test('los mensajes de WhatsApp son distintos y están en español', () => {
  const m = Object.values(s.reserva.mensajes);
  assert.equal(new Set(m).size, m.length);
  for (const x of m) assert.match(x, /\bHola\b/);
});

// Código y plantilla que no deben escribir precios ni fechas: todo sale de sitio.json.
function archivosDeCodigo() {
  const lista = [];
  const recorrer = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) {
        if (!['medios', 'fuentes', 'marca'].includes(e)) recorrer(p);
      } else if (['.mjs', '.js', '.css', '.html'].includes(extname(p))) lista.push(p);
    }
  };
  recorrer(join(RAIZ, 'src'));
  lista.push(join(RAIZ, 'herramientas', 'build.mjs'));
  return lista;
}
const MESES = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)';
const PATRONES = [
  [/\$\s?\d/, 'un precio con $'],
  [/\b\d+\s?(USD|dólares)\b/i, 'un precio en USD'],
  [/\b\d{4}-\d{2}-\d{2}\b/, 'una fecha ISO'],
  [new RegExp(`\\b\\d{1,2}\\s+de\\s+${MESES}\\b`, 'i'), 'una fecha escrita'],
];

test('ni el código ni la plantilla escriben precios o fechas', () => {
  const hallazgos = [];
  for (const f of archivosDeCodigo()) {
    // Los comentarios pueden dar ejemplos; solo importa el código.
    const txt = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\s\/\/ .*$/gm, '');
    for (const [re, que] of PATRONES) if (re.test(txt)) hallazgos.push(`${relative(RAIZ, f)}: ${que}`);
  }
  assert.deepEqual(hallazgos, []);
});

test('los textos de sitio.json no repiten precios ni la fecha de apertura', () => {
  const num = (n) => String(n).replace('.', '[.,]');
  const sueltos = new RegExp(`(?<![\\d:.,])(${num(s.precios.adulto)}|${num(s.precios.nino)})(?![\\d:.,]?\\d)`);
  const hallazgos = [];
  for (const [ruta, v] of cadenas(s.textos)) {
    for (const [re, que] of PATRONES) if (re.test(v)) hallazgos.push(`textos.${ruta}: ${que}`);
    if (sueltos.test(v)) hallazgos.push(`textos.${ruta}: un valor de precio`);
  }
  assert.deepEqual(hallazgos, []);
});

test('el lint de palabras prohibidas funciona', () => {
  const malas = ['Con salvavidas', 'Tu entrada', 'Zona exclusiva', 'plan VIP', 'Glamping', 'un paraíso',
    'Reserva ya', 'Últimos cupos', 'Solo hoy', 'Hay cupos', '¡Ven!!'];
  for (const mala of malas) assert.ok(buscarProhibidas(mala).length > 0, mala);
  for (const buena of ['Un día privado para tu grupo', 'Cuando llegues, presenta tu código', 'entraremos juntos']) {
    assert.deepEqual(buscarProhibidas(buena), [], buena);
  }
});

test('sitio.json y la página generada no traen palabras prohibidas', () => {
  const hallazgos = [];
  for (const [ruta, v] of cadenas(s)) for (const p of buscarProhibidas(v)) hallazgos.push(`${ruta}: ${p}`);
  assert.deepEqual(hallazgos, []);
  const r = construirEnTemporal();
  assert.equal(r.estado, 0, r.salida);
  for (const a of ['index.html', '404.html', 'robots.txt', 'sitemap.xml']) assert.ok(r.archivos.includes(a), a);
});

test('el HTML generado: JSON-LD sin dirección exacta, reseñas ni ofertas; SEO básico', () => {
  const { html, sitemap, robots } = construirEnTemporal();
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1]);
  assert.deepEqual(Object.keys(ld.address).sort(), ['@type', 'addressCountry', 'addressLocality', 'addressRegion']);
  for (const prohibida of ['review', 'aggregateRating', 'offers', 'geo', 'priceRange']) assert.equal(prohibida in ld, false, prohibida);
  assert.match(html, /<html lang="es-EC">/);
  assert.match(html, /<link rel="canonical"/);
  assert.match(html, /<h1[ >]/);
  assert.match(sitemap, /<loc>https:\/\/lunablanca-ec\.github\.io\/<\/loc>/);
  assert.match(robots, /Allow: \//);
  for (const m of Object.values(s.reserva.mensajes)) assert.ok(html.includes(encodeURIComponent(m)), 'cada botón usa su mensaje');
});

// Mientras dirección no pase los textos finales quedan marcas TODO-DIRECCION.
// CI_ESTRICTO=1 las convierte en error (se activa al cierre de la fase T4).
test('no quedan textos provisionales TODO-DIRECCION', { skip: process.env.CI_ESTRICTO !== '1' && 'solo con CI_ESTRICTO=1' }, () => {
  assert.deepEqual(buscarPendientes(s), []);
});
