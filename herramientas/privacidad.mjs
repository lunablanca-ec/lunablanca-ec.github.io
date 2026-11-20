// Control de privacidad (plan §8). Corre en `npm test` y antes de cada commit.
// El repo es público: nada de crudo, GPS, rutas locales ni documentos internos.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIMITE = 2 * 1024 * 1024;
const PROHIBIDAS_EXT = new Set(['.mov', '.heic', '.dng']);
const IMAGENES = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff']);
const TEXTO = new Set(['.md', '.json', '.mjs', '.js', '.css', '.html', '.yml', '.yaml', '.txt', '.svg', '.xml']);
const INTERNOS = ['docs/', 'marca/', 'bitacora.md', 'backlog-ideas.md'];

const problemas = [];
const falla = (m) => problemas.push(m);
const rel = (p) => relative(RAIZ, p).split(sep).join('/');

function recorrer(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? recorrer(join(dir, e.name)) : [join(dir, e.name)]);
}

/** Archivos que git versionaría (rastreados + nuevos no ignorados). null si no hay git. */
function versionables() {
  try {
    const salida = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return salida.split('\0').filter(Boolean).filter((f) => existsSync(join(RAIZ, f)));
  } catch { return null; }
}

// 1. Tamaño y extensiones en src/ (esté o no ignorado: lo que se ve aquí acaba en dist/).
const enSrc = recorrer(join(RAIZ, 'src'));
for (const f of enSrc) {
  if (statSync(f).size > LIMITE) falla(`${rel(f)} pesa más de 2 MB`);
  if (PROHIBIDAS_EXT.has(extname(f).toLowerCase())) falla(`${rel(f)} es un formato de crudo (.mov, .heic o .dng)`);
}

const lista = versionables();
if (!lista) console.warn('Aviso: no se pudo consultar git; se omiten las revisiones del árbol versionable.');
else {
  for (const f of lista) {
    if (PROHIBIDAS_EXT.has(extname(f).toLowerCase())) falla(`${f} es un formato de crudo y entraría al repo`);
    if (statSync(join(RAIZ, f)).size > LIMITE) falla(`${f} pesa más de 2 MB y entraría al repo`);
    if (INTERNOS.some((i) => (i.endsWith('/') ? f.startsWith(i) : f === i))) {
      falla(`${f} es un documento interno y no está en .gitignore (podría tener nombres o rutas)`);
    }
  }

  // 2. Rastros de rutas locales y términos sensibles en texto versionable.
  const rutaTerminos = join(RAIZ, 'herramientas', 'terminos-sensibles.txt');
  const terminos = existsSync(rutaTerminos)
    ? readFileSync(rutaTerminos, 'utf8').split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#'))
    : [];
  const rutaLocal = /\b[A-Za-z]:[\\/]|[\\/]Users[\\/]|[\\/]home[\\/][a-z]/;
  for (const f of lista) {
    if (f === 'package-lock.json' || f === 'herramientas/terminos-sensibles.txt' || !TEXTO.has(extname(f).toLowerCase())) continue;
    const txt = readFileSync(join(RAIZ, f), 'utf8');
    if (rutaLocal.test(txt)) falla(`${f} contiene una ruta local de la máquina (letra de unidad, carpeta de usuario)`);
    const bajo = txt.toLowerCase();
    for (const t of terminos) if (bajo.includes(t)) falla(`${f} contiene un término de la lista sensible (línea omitida a propósito)`);
  }
}

// 3. EXIF, GPS y ubicación en los medios optimizados.
for (const f of recorrer(join(RAIZ, 'src', 'medios'))) {
  const ext = extname(f).toLowerCase();
  try {
    if (IMAGENES.has(ext)) {
      const m = await sharp(f, { limitInputPixels: false }).metadata();
      if (m.exif || m.xmp || m.iptc) falla(`${rel(f)} trae metadatos EXIF/XMP/IPTC (puede incluir GPS)`);
    } else if (['.mp4', '.webm', '.m4v'].includes(ext)) {
      // El átomo ©xyz de MP4 guarda coordenadas; se busca en bruto porque no hay ffprobe en CI.
      const buf = readFileSync(f);
      if (buf.includes(Buffer.from([0xa9, 0x78, 0x79, 0x7a]))) falla(`${rel(f)} trae ubicación (átomo ©xyz)`);
    }
  } catch (err) {
    falla(`${rel(f)} no se pudo revisar: ${err.message}`);
  }
}

if (problemas.length) {
  console.error('Privacidad: HAY PROBLEMAS, no hagas commit.');
  for (const p of problemas) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('Privacidad: sin hallazgos.');
