// Build: valida sitio.json -> renderiza -> lint de palabras -> minifica y hashea -> dist/.
// Si algo falla, termina con código 1 y un mensaje en español: la versión publicada no cambia.
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync, readdirSync, copyFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { basename, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync, buildSync } from 'esbuild';
import { hoyEnZona, esFechaISO } from '../src/js/logica.mjs';
import { renderizarV2, renderizar404, renderizarRedireccion } from '../src/v2/plantilla-v2.mjs';
import { validarSitio, buscarProhibidas, textoLintable } from './validacion.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RAIZ, 'src');

function fallar(titulo, lista) {
  console.error(`\nERROR: ${titulo}`);
  for (const l of lista) console.error(`  - ${l}`);
  console.error('\nNo se generó dist/ nuevo: la versión publicada no cambia.');
  process.exit(1);
}

const hash = (contenido) => createHash('sha256').update(contenido).digest('hex').slice(0, 8);
const kb = (buf) => `${(buf.length / 1024).toFixed(1)} KB`;

function leerJson(ruta, nombre) {
  try { return JSON.parse(readFileSync(ruta, 'utf8')); } catch (err) {
    fallar(`${nombre} no es un JSON válido`, [err.message]);
  }
}

// El destino solo se borra si se llama "dist…": evita vaciar otra carpeta por error de variable.
function carpetaDist() {
  const d = resolve(process.env.DIST_DIR || join(RAIZ, 'dist'));
  if (!basename(d).startsWith('dist')) fallar('DIST_DIR debe ser una carpeta cuyo nombre empiece por "dist"', [d]);
  return d;
}

const leerCss = (...archivos) => archivos.map((f) => readFileSync(f, 'utf8')).join('\n');
const minificar = (fuente) => transformSync(fuente, { loader: 'css', minify: true }).code.trim();

// Estilos de la página: tokens, base, calculadora y los propios de "El día gira".
function css() {
  const estilos = join(SRC, 'estilos');
  return minificar(leerCss(join(estilos, 'tokens.css'), join(estilos, 'base.css'), join(estilos, 'calculadora.css'), join(SRC, 'v2', 'estilos', 'v2.css'))
    .replaceAll('url(../marca/', 'url(marca/'));
}

// La 404 solo necesita tokens y base.
function cssBasico() {
  const estilos = join(SRC, 'estilos');
  return minificar(leerCss(join(estilos, 'tokens.css'), join(estilos, 'base.css')));
}

function js(dist) {
  const entrada = join(SRC, 'v2', 'app-v2.mjs');
  const { outputFiles } = buildSync({
    entryPoints: [entrada], bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, outfile: 'app.js',
  });
  const codigo = outputFiles[0].text;
  const nombre = `app.${hash(codigo)}.js`;
  writeFileSync(join(dist, nombre), codigo);
  return { nombre, codigo };
}

// Solo se publican los medios que el HTML usa: lo demás queda en el repo, no en la web.
function copiarMedios(dist, html) {
  const origen = join(SRC, 'medios');
  if (!existsSync(origen)) return;
  mkdirSync(join(dist, 'medios'), { recursive: true });
  const usados = new Set([...html.matchAll(/medios\/([\w.-]+)/g)].map((m) => m[1]));
  for (const nombre of usados) {
    if (!existsSync(join(origen, nombre))) fallar('El HTML pide un medio que no existe', [nombre]);
    copyFileSync(join(origen, nombre), join(dist, 'medios', nombre));
  }
}

export function construir() {
  const sitio = leerJson(join(RAIZ, 'contenido', 'sitio.json'), 'contenido/sitio.json');
  const errores = validarSitio(sitio);
  if (errores.length) fallar('contenido/sitio.json tiene errores', errores);

  const simulada = process.env.FECHA_SIMULADA;
  if (simulada && !esFechaISO(simulada)) fallar('FECHA_SIMULADA debe ser una fecha real AAAA-MM-DD', [simulada]);
  const hoy = simulada || hoyEnZona(Date.now(), sitio.apertura.zonaHoraria);

  const rutaMedios = join(SRC, 'medios', 'medios.json');
  const medios = existsSync(rutaMedios) ? leerJson(rutaMedios, 'src/medios/medios.json') : null;
  if (!medios) console.warn('Aviso: no hay src/medios/medios.json; la página se genera sin medios.');

  const dist = carpetaDist();
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  // Carpetas estáticas ya optimizadas (fuentes, marca). Los medios se copian según lo que use el HTML.
  for (const carpeta of ['fuentes', 'marca']) {
    const origen = join(SRC, carpeta);
    if (existsSync(origen)) cpSync(origen, join(dist, carpeta), { recursive: true });
  }

  const bundle = js(dist);
  const estilos = css();
  const faviconSvg = existsSync(join(SRC, 'marca', 'icono-perfil-verde.svg')) ? 'marca/icono-perfil-verde.svg' : '';
  const og = existsSync(join(SRC, sitio.sitio.ogImagen));
  if (!og) console.warn(`Aviso: falta src/${sitio.sitio.ogImagen}; se omiten las etiquetas de imagen Open Graph.`);
  const activos = { css: estilos, jsSrc: bundle.nombre, og, favicon: faviconSvg };

  const html = renderizarV2({ sitio, medios, hoy, activos });
  const html404 = renderizar404({ sitio, activos: { css: cssBasico() } });
  const htmlV2 = renderizarRedireccion({ sitio });
  copiarMedios(dist, html); // incluye og.jpg: la etiqueta og:image lo nombra

  // Lint de palabras prohibidas sobre lo que ve el visitante y los buscadores.
  const hallazgos = [];
  for (const [nombre, doc] of [['index.html', html], ['404.html', html404]]) {
    for (const palabra of buscarProhibidas(textoLintable(doc))) hallazgos.push(`${nombre}: "${palabra}"`);
  }
  if (hallazgos.length) fallar('Hay palabras prohibidas en el texto (plan §5)', hallazgos);

  const url = sitio.sitio.url;
  writeFileSync(join(dist, 'index.html'), html);
  writeFileSync(join(dist, '404.html'), html404);
  mkdirSync(join(dist, 'v2'), { recursive: true });
  writeFileSync(join(dist, 'v2', 'index.html'), htmlV2); // /v2/ redirige a la raíz
  writeFileSync(join(dist, 'robots.txt'), `User-agent: *
Allow: /

Sitemap: ${url}/sitemap.xml
`);
  if (existsSync(join(SRC, 'marca', 'icono-192.png'))) copyFileSync(join(SRC, 'marca', 'icono-192.png'), join(dist, 'favicon.ico'));
  writeFileSync(join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${url}/</loc><lastmod>${hoy}</lastmod></url>
</urlset>
`);

  const gz = (s) => gzipSync(s).length;
  console.log(`dist/ listo (fecha de referencia ${hoy}${simulada ? ', simulada' : ''}).`);
  console.log(`  index.html ${kb(Buffer.from(html))}, ${(gz(html) / 1024).toFixed(1)} KB gzip (límite 35)`);
  console.log(`  ${bundle.nombre} ${(gz(bundle.codigo) / 1024).toFixed(1)} KB gzip (límite 15)`);
  if (gz(html) > 35 * 1024) console.warn('Aviso: el HTML supera 35 KB gzip.');
  if (gz(bundle.codigo) > 15 * 1024) console.warn('Aviso: el JS supera 15 KB gzip.');
  return { dist, hoy };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) construir();
