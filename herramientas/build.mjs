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
import { renderizar, renderizar404 } from '../src/plantilla.mjs';
import { renderizarV2 } from '../src/v2/plantilla-v2.mjs';
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

function css() {
  const dir = join(SRC, 'estilos');
  if (!existsSync(dir)) return '';
  const orden = ['tokens.css', 'base.css', 'recorrido.css', 'calculadora.css'];
  const todos = readdirSync(dir).filter((f) => f.endsWith('.css'));
  const archivos = [...orden.filter((f) => todos.includes(f)), ...todos.filter((f) => !orden.includes(f)).sort()];
  const fuente = archivos.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  return transformSync(fuente, { loader: 'css', minify: true }).code.trim();
}

function js(dist) {
  const entrada = join(SRC, 'js', 'app.mjs');
  if (!existsSync(entrada)) return null; // T4 lo escribe; sin él la página es HTML puro
  const { outputFiles } = buildSync({
    entryPoints: [entrada], bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, outfile: 'app.js',
  });
  const codigo = outputFiles[0].text;
  const nombre = `app.${hash(codigo)}.js`;
  writeFileSync(join(dist, nombre), codigo);
  return { nombre, codigo };
}

// La v2 ("El día gira") se publica en dist/v2/ con su propio HTML, CSS y JS; comparte medios, fuentes y marca con la raíz.
function construirV2({ sitio, medios, hoy, dist, faviconSvg }) {
  const dir = join(SRC, 'v2');
  if (!existsSync(dir)) return null;
  const salida = join(dist, 'v2');
  mkdirSync(salida, { recursive: true });

  const estilos = join(SRC, 'estilos');
  const fuente = ['tokens.css', 'base.css', 'calculadora.css'].map((f) => readFileSync(join(estilos, f), 'utf8'))
    .concat(readFileSync(join(dir, 'estilos', 'v2.css'), 'utf8')).join('\n')
    .replaceAll('url(fuentes/', 'url(../fuentes/'); // la página vive un nivel más abajo
  const cssV2 = transformSync(fuente, { loader: 'css', minify: true }).code.trim();

  const { outputFiles } = buildSync({
    entryPoints: [join(dir, 'app-v2.mjs')], bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, outfile: 'app-v2.js',
  });
  const codigo = outputFiles[0].text;
  const nombreJs = `app-v2.${hash(codigo)}.js`;
  writeFileSync(join(salida, nombreJs), codigo);

  const html = renderizarV2({ sitio, medios, hoy, activos: { css: cssV2, jsSrc: nombreJs, favicon: faviconSvg ? `../${faviconSvg}` : '' } });
  const hallazgos = buscarProhibidas(textoLintable(html));
  if (hallazgos.length) fallar('Hay palabras prohibidas en el texto de la v2 (plan §5)', hallazgos.map((h) => `v2/index.html: "${h}"`));
  writeFileSync(join(salida, 'index.html'), html);
  const gz = (x) => gzipSync(x).length;
  console.log(`  v2/index.html ${kb(Buffer.from(html))}, ${(gz(html) / 1024).toFixed(1)} KB gzip · ${nombreJs} ${(gz(codigo) / 1024).toFixed(1)} KB gzip`);
  return html;
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

  // Carpetas estáticas ya optimizadas (medios, fuentes, marca). El manifiesto no se publica.
  for (const carpeta of ['medios', 'fuentes', 'marca']) {
    const origen = join(SRC, carpeta);
    if (existsSync(origen)) cpSync(origen, join(dist, carpeta), { recursive: true, filter: (f) => basename(f) !== 'medios.json' });
  }

  const bundle = js(dist);
  const estilos = css();
  const faviconSvg = existsSync(join(SRC, 'marca', 'icono-perfil-verde.svg')) ? 'marca/icono-perfil-verde.svg' : '';
  const og = existsSync(join(SRC, sitio.sitio.ogImagen));
  if (!og) console.warn(`Aviso: falta src/${sitio.sitio.ogImagen}; se omiten las etiquetas de imagen Open Graph.`);
  const activos = { css: estilos, jsSrc: bundle?.nombre, og, favicon: faviconSvg };

  const html = renderizar({ sitio, medios, hoy, activos });
  const html404 = renderizar404({ sitio, activos });

  // Lint de palabras prohibidas sobre lo que ve el visitante y los buscadores.
  const hallazgos = [];
  for (const [nombre, doc] of [['index.html', html], ['404.html', html404]]) {
    for (const palabra of buscarProhibidas(textoLintable(doc))) hallazgos.push(`${nombre}: "${palabra}"`);
  }
  if (hallazgos.length) fallar('Hay palabras prohibidas en el texto (plan §5)', hallazgos);

  const url = sitio.sitio.url;
  writeFileSync(join(dist, 'index.html'), html);
  writeFileSync(join(dist, '404.html'), html404);
  writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${url}/sitemap.xml\n`);
  if (existsSync(join(SRC, 'marca', 'icono-192.png'))) copyFileSync(join(SRC, 'marca', 'icono-192.png'), join(dist, 'favicon.ico'));
  writeFileSync(join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${url}/</loc><lastmod>${hoy}</lastmod></url>\n</urlset>\n`);

  if (medios) construirV2({ sitio, medios, hoy, dist, faviconSvg });

  const gz = (s) => gzipSync(s).length;
  console.log(`dist/ listo (fecha de referencia ${hoy}${simulada ? ', simulada' : ''}).`);
  console.log(`  index.html ${kb(Buffer.from(html))}, ${(gz(html) / 1024).toFixed(1)} KB gzip (límite 35)`);
  if (bundle) console.log(`  ${bundle.nombre} ${(gz(bundle.codigo) / 1024).toFixed(1)} KB gzip (límite 15)`);
  if (gz(html) > 35 * 1024) console.warn('Aviso: el HTML supera 35 KB gzip.');
  if (bundle && gz(bundle.codigo) > 15 * 1024) console.warn('Aviso: el JS supera 15 KB gzip.');
  return { dist, hoy };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) construir();
