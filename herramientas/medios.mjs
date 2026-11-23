// Procesa en local el crudo de LunaBlanca y deja en src/ solo lo optimizado.
//   npm run medios                      -> todo
//   npm run medios -- --solo=cascada    -> solo un id (imagenes y videos); --solo=og o --solo=marca
//   npm run medios -- --solo=a,b,c      -> varios ids
// Cada item puede traer "anchos" propios y un "ajuste" suave de color {brillo, saturacion, contraste}.
//   MATERIAL_DIR=../otra/ruta npm run medios
// Requiere ffmpeg/ffprobe del sistema. El crudo nunca se copia al repo: sharp y ffmpeg
// exportan SIN metadatos (ni EXIF ni GPS). Lee herramientas/seleccion.json.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const ejecutar = promisify(execFile);

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Ruta relativa a la raíz del repo (se corre con npm run medios), sin letras de unidad: el repo es público.
const MATERIAL_DIR = process.env.MATERIAL_DIR || '../../../marketing/proyectos/lunablanca/material';
const SALIDA = path.join(RAIZ, 'src', 'medios');
const MARCA = path.join(RAIZ, 'src', 'marca');
const HOJAS = path.join(RAIZ, 'docs', 'medios-revision');
const TMP = path.join(os.tmpdir(), 'lunablanca-medios');
const sel = JSON.parse(await fs.readFile(path.join(RAIZ, 'herramientas', 'seleccion.json'), 'utf8'));
const solo = (process.argv.find((a) => a.startsWith('--solo=')) || '').slice(7) || null;
const soloIds = solo ? solo.split(',') : null;

sharp.cache(false);
sharp.concurrency(2);
await fs.mkdir(SALIDA, { recursive: true });
await fs.mkdir(MARCA, { recursive: true });
await fs.mkdir(HOJAS, { recursive: true });
await fs.mkdir(TMP, { recursive: true });

const kb = (n) => Math.round(n / 102.4) / 10;
const tamano = async (f) => (await fs.stat(f)).size;
const origen = (rel) => path.join(MATERIAL_DIR, ...rel.split('/'));

// ---------- recorte ----------
function calcularRecorte(w, h, r = {}) {
  const [aw, ah] = (r.aspecto || '9:16').split(':').map(Number);
  const ar = aw / ah;
  let cw, ch;
  if (w / h > ar) { ch = h; cw = h * ar; } else { cw = w; ch = w / ar; }
  const s = r.escala ?? 1;
  cw *= s; ch *= s;
  const cx = (r.cx ?? 0.5) * w, cy = (r.cy ?? 0.5) * h;
  const left = Math.round(Math.min(Math.max(cx - cw / 2, 0), w - cw));
  const top = Math.round(Math.min(Math.max(cy - ch / 2, 0), h - ch));
  return { left, top, width: Math.min(Math.round(cw), w - left), height: Math.min(Math.round(ch), h - top) };
}

// ---------- imagen base (una por vez, reducida primero a 2160 px) ----------
async function imagenBase(it) {
  const src = origen(it.origen);
  if (it.tipo === 'foto') {
    // Las fotos de 200 MP se reducen primero a 2160 px; las de 12 MP se dejan a 3200 px para que
    // un recorte vertical todavia llegue a 1080 de ancho.
    const { width: ancho, height: alto } = await sharp(src, { limitInputPixels: false }).metadata();
    const lado = it.reducir ?? (ancho * alto > 50e6 ? 2160 : 3200);
    return sharp(src, { limitInputPixels: false })
      .rotate() // respeta la orientacion EXIF antes de que se pierda
      .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 1 })
      .toBuffer();
  }
  const t = it.tipo === 'cuadro' ? it.cuadro.t : (it.video.posterT ?? it.video.inicio);
  const tmp = path.join(TMP, `${it.id}-cuadro.png`);
  // ffmpeg aplica solo la rotacion del video (displaymatrix): la salida queda vertical.
  await ejecutar('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', src, '-frames:v', '1',
    '-vf', "scale='min(1440,iw)':-2", tmp]);
  const buf = await fs.readFile(tmp);
  await fs.rm(tmp);
  return buf;
}

async function exportarImagen(buf, recorte, base, anchos, opciones = {}) {
  const meta = await sharp(buf).metadata();
  const c = calcularRecorte(meta.width, meta.height, recorte);
  let recortada = await sharp(buf).extract(c).png({ compressionLevel: 1 }).toBuffer();
  if (opciones.ajuste) {
    // Grading suave (toma debil): brillo, saturacion y contraste. Nunca cambia el tono del verde ni del agua.
    const { brillo = 1, saturacion = 1, contraste = 1 } = opciones.ajuste;
    recortada = await sharp(recortada).modulate({ brightness: brillo, saturation: saturacion })
      .linear(contraste, 128 * (1 - contraste)).png({ compressionLevel: 1 }).toBuffer();
  }
  const salidas = { avif: {}, webp: {} };
  let anchoMax = 0, altoMax = 0;
  for (const w of anchos) {
    if (w > c.width) continue; // sin ampliar
    const pipe = () => sharp(recortada).resize({ width: w });
    let q = opciones.calidadAvif ?? 50;
    let rutaA = path.join(SALIDA, `${base}-${w}.avif`);
    let info;
    for (;;) {
      info = await pipe().avif({ quality: q, effort: 5, chromaSubsampling: '4:2:0' }).toFile(rutaA);
      if (!opciones.maxBytes?.[w] || info.size <= opciones.maxBytes[w] || q <= 20) break;
      q -= 4;
    }
    const infoW = await pipe().webp({ quality: opciones.calidadWebp ?? 74, effort: 5 }).toFile(path.join(SALIDA, `${base}-${w}.webp`));
    salidas.avif[w] = { archivo: `${base}-${w}.avif`, bytes: info.size, calidad: q };
    salidas.webp[w] = { archivo: `${base}-${w}.webp`, bytes: infoW.size };
    anchoMax = info.width; altoMax = info.height;
  }
  if (!anchoMax) throw new Error(`${base}: el recorte (${c.width}px) es menor que el ancho minimo`);
  return { salidas, width: anchoMax, height: altoMax, anchos: Object.keys(salidas.avif).map(Number) };
}

// ---------- video ----------
async function ffprobeVideo(f) {
  const { stdout } = await ejecutar('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,codec_name:stream_side_data=rotation:stream_tags:format_tags:format=duration',
    '-of', 'json', f]);
  return JSON.parse(stdout);
}

async function codificar(it, formato, maxBytes) {
  const src = origen(it.origen);
  const dest = path.join(SALIDA, `${it.id}.${formato}`);
  const filtro = "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=540:960:flags=lanczos,fps=24,format=yuv420p";
  const comunes = ['-v', 'error', '-y', '-ss', String(it.video.inicio), '-t', String(it.video.duracion), '-i', src,
    '-vf', filtro, '-an', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact'];
  // MP4: CRF que sube hasta entrar en el presupuesto. WebM: calidad restringida (CRF + tope de
  // bitrate), porque el agua en movimiento hace que VP9 ignore el CRF solo.
  let crf = formato === 'webm' ? (it.video.crfWebm ?? 34) : (it.video.crfMp4 ?? 28);
  let kbps = Math.floor((maxBytes * 8 * 0.9) / it.video.duracion / 1000);
  for (let vuelta = 0; vuelta < 12; vuelta++) {
    const args = formato === 'webm'
      ? [...comunes, '-c:v', 'libvpx-vp9', '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.4)}k`, '-crf', String(crf), '-row-mt', '1', '-cpu-used', '2', '-g', '96', dest]
      : [...comunes, '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'main', '-level', '3.1', '-crf', String(crf), '-movflags', '+faststart', dest];
    await ejecutar('ffmpeg', args);
    const bytes = await tamano(dest);
    if (bytes <= maxBytes) return { archivo: path.basename(dest), bytes, crf, ...(formato === 'webm' ? { kbps } : {}) };
    if (formato === 'webm') kbps = Math.floor(kbps * 0.88); else crf += 2;
  }
  throw new Error(`${it.id}.${formato}: no entra en ${maxBytes} bytes`);
}

// Video de alta resolución (hero): 1080x1920, H.264 con CRF 20-23 y preset veryfast, a 24 cuadros, sin audio.
// El agua y el follaje hacen que el CRF solo pese 12 MB en 6 s: se le pone un tope de bitrate (maxrate) para que
// el peso sea razonable. El lazo es sin salto: el final se funde con el principio (la cola del clip entra en fundido).
// AV1 en WebM se probó y a calidad equivalente pesa más: no se publica.
async function codificarAlta(it) {
  const v = it.video;
  const src = origen(it.origen);
  const dest = path.join(SALIDA, `${it.id}.mp4`);
  const [w, h] = [v.ancho ?? 1080, v.alto ?? 1920];
  const f = v.lazo ?? 1;
  const vf = `fps=${v.fps ?? 24},scale=${w}:${h}:flags=lanczos,setsar=1,format=yuv420p`;
  const fc = `[0:v]${vf},setpts=PTS-STARTPTS[a];[1:v]${vf},setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=${f}:offset=0,format=yuv420p[v]`;
  const t0 = v.inicio;
  const args = ['-v', 'error', '-y', '-ss', String(t0 + v.duracion), '-t', String(f), '-i', src, '-ss', String(t0), '-t', String(v.duracion), '-i', src,
    '-filter_complex', fc, '-map', '[v]', '-an', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact',
    '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-level', '4.0', '-crf', String(v.crf ?? 22),
    '-maxrate', v.maxrate ?? '5M', '-bufsize', v.bufsize ?? '10M', '-movflags', '+faststart', dest];
  await ejecutar('ffmpeg', args);
  const p = await ffprobeVideo(dest);
  const s = p.streams[0];
  if (s.width !== w || s.height !== h) throw new Error(`${it.id}.mp4: salio ${s.width}x${s.height}, no ${w}x${h}`);
  const { stdout } = await ejecutar('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', dest]);
  if (stdout.trim()) throw new Error(`${it.id}.mp4: tiene audio`);
  await fs.rm(path.join(SALIDA, `${it.id}.webm`), { force: true });
  const bytes = await tamano(dest);
  return { mp4: { archivo: path.basename(dest), bytes, crf: v.crf ?? 22 }, duracion: Math.round(parseFloat(p.format.duration) * 10) / 10, width: w, height: h };
}

async function procesarVideo(it) {
  if (it.video.alta) return codificarAlta(it);
  const maxBytes = (sel.presupuestoVideoKB ?? 700) * 1000;
  const webm = await codificar(it, 'webm', maxBytes);
  const mp4 = await codificar(it, 'mp4', maxBytes);
  // Verificacion: vertical, 540x960, sin audio, sin metadatos ni rotacion pendiente.
  for (const v of [webm, mp4]) {
    const p = await ffprobeVideo(path.join(SALIDA, v.archivo));
    const s = p.streams[0];
    if (s.width !== 540 || s.height !== 960) throw new Error(`${v.archivo}: salio ${s.width}x${s.height}, no 540x960 vertical`);
    if (s.side_data_list?.some((d) => d.rotation)) throw new Error(`${v.archivo}: conserva rotacion`);
    const { stdout } = await ejecutar('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', path.join(SALIDA, v.archivo)]);
    if (stdout.trim()) throw new Error(`${v.archivo}: tiene audio`);
    v.duracion = Math.round(parseFloat(p.format.duration) * 10) / 10;
  }
  return { webm, mp4 };
}

// ---------- manifiesto ----------
const manifiestoRuta = path.join(SALIDA, 'medios.json');
let manifiesto = { items: {} };
try { manifiesto = JSON.parse(await fs.readFile(manifiestoRuta, 'utf8')); } catch { /* primera vez */ }
manifiesto.items ??= {};

const items = sel.items.filter((i) => !soloIds || soloIds.includes(i.id));
let videos = 0;
for (const it of items) {
  console.log(`> ${it.id} (${it.tipo})`);
  const buf = await imagenBase(it);
  const esHero = it.id === 'piscina-natural';
  const entrada = { momento: it.momento, tipo: it.tipo, alt: it.alt };
  if (it.tipo === 'video') {
    videos++;
    const img = await exportarImagen(buf, it.recorte, `${it.id}-poster`, sel.anchos,
      esHero ? { calidadAvif: sel.calidadPosterHero ?? 64, maxBytes: { 720: (sel.presupuestoPosterHeroKB ?? 150) * 1000, 480: 80000, 1080: 280000 } } : {});
    const v = await procesarVideo(it);
    Object.assign(entrada, { width: img.width, height: img.height, anchos: img.anchos,
      poster: { avif: img.salidas.avif, webp: img.salidas.webp },
      video: v.webm ? { width: 540, height: 960, fps: 24, duracion: v.webm.duracion, webm: v.webm, mp4: v.mp4 } : { width: v.width, height: v.height, fps: it.video.fps ?? 24, duracion: v.duracion, mp4: v.mp4 } });
  } else {
    const img = await exportarImagen(buf, it.recorte, it.id, it.anchos ?? sel.anchos, { ajuste: it.ajuste });
    Object.assign(entrada, { width: img.width, height: img.height, anchos: img.anchos, avif: img.salidas.avif, webp: img.salidas.webp });
  }
  manifiesto.items[it.id] = entrada;
}
if (!solo && videos > 4) throw new Error(`Hay ${videos} videos; el maximo en la pagina es 4`);

// ---------- og.jpg ----------
async function generarOg() {
  const o = sel.og;
  const it = sel.items.find((i) => i.id === o.origen);
  const base = await imagenBase(it);
  const meta = await sharp(base).metadata();
  const c = calcularRecorte(meta.width, meta.height, o.recorte);
  const foto = await sharp(base).extract(c).resize(1200, 630).png().toBuffer();
  const velo = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0.38" stop-color="${o.velo}" stop-opacity="0"/><stop offset="0.78" stop-color="${o.velo}" stop-opacity="0.9"/><stop offset="1" stop-color="${o.velo}" stop-opacity="0.96"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/></svg>`);
  const logo = await sharp(o.logo).trim().resize({ height: 178 }).png().toBuffer();
  const lm = await sharp(logo).metadata();
  const dest = path.join(SALIDA, 'og.jpg');
  let q = 82, info;
  for (;;) {
    info = await sharp(foto)
      .composite([{ input: velo }, { input: logo, left: Math.round((1200 - lm.width) / 2), top: 630 - lm.height - 34 }])
      .jpeg({ quality: q, mozjpeg: true }).toFile(dest);
    if (info.size <= (o.maxKB ?? 250) * 1000 || q <= 50) break;
    q -= 4;
  }
  manifiesto.og = { archivo: 'og.jpg', width: 1200, height: 630, bytes: info.size };
  console.log(`> og.jpg ${kb(info.size)} KB`);
}
if (!solo || solo === 'og') await generarOg();

// ---------- marca (SVG optimizados + favicon) ----------
function optimizarSvg(texto) {
  return texto
    .replace(/<metadata>[\s\S]*?<\/metadata>/g, '')
    .replace(/\s+xmlns:c2pa="[^"]*"/g, '')
    .replace(/\s+(width|height)="[\d.]+"/g, '') // el tamaño lo pone el CSS; queda el viewBox
    .replace(/-?\d*\.\d{2,}/g, (n) => String(Math.round(parseFloat(n) * 10) / 10))
    .replace(/>\s+</g, '><')
    .trim();
}
if (!solo || solo === 'marca') {
  manifiesto.marca = {};
  for (const nombre of sel.marca.svg) {
    const original = await fs.readFile(path.join(sel.marca.origenDir, `${nombre}.svg`), 'utf8');
    const limpio = optimizarSvg(original);
    const destino = nombre.replace(/^lunablanca-/, '') + '.svg';
    await fs.writeFile(path.join(MARCA, destino), limpio);
    manifiesto.marca[destino] = (await tamano(path.join(MARCA, destino)));
  }
  const fav = await fs.readFile(path.join(MARCA, sel.marca.favicon.replace(/^lunablanca-/, '') + '.svg'));
  for (const px of [192, 512]) {
    const f = path.join(MARCA, `icono-${px}.png`);
    await sharp(fav, { density: 600 }).resize(px, px).png({ compressionLevel: 9, palette: true }).toFile(f);
    manifiesto.marca[`icono-${px}.png`] = await tamano(f);
  }
}

await fs.writeFile(manifiestoRuta, JSON.stringify(manifiesto, null, 2) + '\n');

// ---------- hojas de revision (locales, docs/ esta en .gitignore) ----------
async function etiqueta(buf, texto) {
  const svg = Buffer.from(`<svg width="260" height="24" xmlns="http://www.w3.org/2000/svg"><rect width="260" height="24" fill="#000" fill-opacity="0.7"/><text x="5" y="17" font-size="15" fill="#fff" font-family="Arial">${texto}</text></svg>`);
  return sharp(buf).composite([{ input: svg, top: 0, left: 0 }]).toBuffer();
}
async function hojaDe(nombre, tiles, ancho, alto, porFila) {
  const filas = Math.ceil(tiles.length / porFila);
  const comps = tiles.map((t, i) => ({ input: t, left: (i % porFila) * (ancho + 2), top: Math.floor(i / porFila) * (alto + 2) }));
  await sharp({ create: { width: porFila * (ancho + 2), height: filas * (alto + 2), channels: 3, background: '#111' } })
    .composite(comps).jpeg({ quality: 82 }).toFile(path.join(HOJAS, nombre));
}
{
  const fotos = [];
  for (const it of sel.items) {
    const e = manifiesto.items[it.id];
    if (!e) continue;
    const w = e.anchos.includes(720) ? 720 : e.anchos.at(-1);
    const archivo = path.join(SALIDA, it.tipo === 'video' ? `${it.id}-poster-${w}.webp` : `${it.id}-${w}.webp`);
    const t = await sharp(archivo).resize(380, 600, { fit: 'contain', background: '#222' }).toBuffer();
    fotos.push(await etiqueta(t, `${it.id} ${e.width}x${e.height}`));
  }
  for (let i = 0; i < fotos.length; i += 4) await hojaDe(`fotos-${i / 4 + 1}.jpg`, fotos.slice(i, i + 4), 380, 600, 4);
  for (const it of items.filter((i) => i.tipo === 'video')) {
    const dir = path.join(TMP, `strip-${it.id}`);
    await fs.mkdir(dir, { recursive: true });
    await ejecutar('ffmpeg', ['-v', 'error', '-y', '-i', path.join(SALIDA, `${it.id}.mp4`), '-vf', 'fps=2,scale=300:-2', '-q:v', '3', path.join(dir, '%03d.jpg')]);
    const arch = (await fs.readdir(dir)).sort();
    const tiles = [];
    for (let i = 0; i < arch.length; i++) tiles.push(await etiqueta(await fs.readFile(path.join(dir, arch[i])), `${it.id} ${(i * 0.5).toFixed(1)}s`));
    await hojaDe(`video-${it.id}.jpg`, tiles, 300, 534, 5);
    await fs.rm(dir, { recursive: true });
  }
}

// ---------- resumen ----------
let total = 0;
for (const f of await fs.readdir(SALIDA)) {
  const b = await tamano(path.join(SALIDA, f));
  total += b;
  if (b > 2_000_000) console.warn(`AVISO: ${f} pesa ${kb(b)} KB (>2 MB)`);
}
console.log(`Listo. src/medios: ${(total / 1e6).toFixed(2)} MB en total.`);
