// La landing "El día gira" es la raíz del sitio; /v2/ solo redirige a ella.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RAIZ } from './ayudas.mjs';

function construir(env = {}) {
  const dist = mkdtempSync(join(tmpdir(), 'dist-lb-v2-'));
  try {
    const r = spawnSync(process.execPath, [join(RAIZ, 'herramientas', 'build.mjs')], { env: { ...process.env, ...env, DIST_DIR: dist }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    return { raiz: readFileSync(join(dist, 'index.html'), 'utf8'), redireccion: readFileSync(join(dist, 'v2', 'index.html'), 'utf8'), existe: ((publicados) => (f) => publicados.has(f))(new Set(readdirSync(dist, { recursive: true }).map((f) => f.replaceAll('\\', '/')))) };
  } finally { rmSync(dist, { recursive: true, force: true }); }
}
const { raiz: v2, redireccion, existe } = construir({ FECHA_SIMULADA: '2026-11-19' });
const { raiz: v2Enero } = construir({ FECHA_SIMULADA: '2027-01-01' });
const cuerpo = (h) => h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');

test('la raíz es la landing nueva, indexable, y /v2/ redirige a ella conservando UTM y ancla', () => {
  assert.doesNotMatch(v2, /name="robots"/);
  assert.match(v2, /<link rel="canonical" href="https:\/\/lunablanca-ec\.github\.io\/">/);
  assert.match(v2, /property="og:image" content="https:\/\/lunablanca-ec\.github\.io\/medios\/og\.jpg"/);
  assert.match(v2, /<script type="application\/ld\+json">/);
  assert.match(v2, /class="escena portada"/);
  assert.match(redireccion, /location\.replace\("\.\.\/"\+location\.search\+location\.hash\)/);
  assert.match(redireccion, /<link rel="canonical" href="https:\/\/lunablanca-ec\.github\.io\/">/);
});

test('la landing anterior no se publica: solo van los medios que la página usa', () => {
  assert.equal(existe('medios/piscina-natural.mp4'), true);
  assert.equal(existe('medios/parque-cerca-720.avif'), true);
  for (const f of ['medios/cascada.mp4', 'medios/cascada.webm', 'medios/luna-video.mp4', 'medios/tobogan-1080.avif', 'medios/piscina-natural.webm']) assert.equal(existe(f), false, f);
  assert.doesNotMatch(cuerpo(v2), /Así se vive|galeria/);
});

test('hay como máximo 6 escenas de momento y cada una tiene un medio dominante y a lo sumo un detalle', () => {
  const escenas = v2.match(/<section class="escena[^"]*" id="m-\d{4}"/g) ?? [];
  assert.ok(escenas.length >= 5 && escenas.length <= 6, `hay ${escenas.length} escenas`);
  const secciones = v2.split('<section class="escena').slice(1);
  for (const s of secciones.filter((x) => /id="m-\d{4}"/.test(x) && !x.startsWith(' enmarcada'))) {
    assert.ok((s.match(/<figure class="capa /g) ?? []).length <= 1);
  }
  assert.doesNotMatch(cuerpo(v2), /rejilla|galeria-/);
  assert.doesNotMatch(v2, /adultos-descansan/, 'ninguna persona descansando en primer plano');
});

test('10:30 domina Luna en el borde y la cascada es el detalle; 14:00 domina el parque acuático y el detalle son las sillas vacías', () => {
  const escena = (id) => v2.split('<section class="escena').slice(1).find((x) => x.includes(`id="${id}"`));
  const a = escena('m-1030');
  assert.match(a.split('<div class="capas">')[0], /luna-borde-/);
  assert.match(a.split('<div class="capas">')[1].split('<div class="texto">')[0], /cascada-\d+\.avif/);
  assert.doesNotMatch(a, /<video/);
  const b = escena('m-1400');
  assert.match(b.split('<div class="capas">')[0], /parque-cerca-/);
  assert.match(b.split('<div class="capas">')[1].split('<div class="texto">')[0], /sillas-piscina-[\s\S]*Y tú, a descansar/);
});

test('el video del hero es 1080x1920, sin audio ni pedido al abrir, con poster; todos los videos son decorativos', () => {
  const videos = cuerpo(v2).match(/<video[^>]*>/g) ?? [];
  assert.ok(videos.length >= 1 && videos.length <= 4);
  for (const v of videos) {
    assert.match(v, /\b(data-)?poster="/, v);
    assert.match(v, /aria-hidden="true"/);
    assert.match(v, /preload="none"/);
    assert.match(v, /\bmuted\b/);
  }
  assert.match(videos[0], /width="1080" height="1920"/);
  assert.match(v2, /<source src="medios\/piscina-natural\.mp4" type="video\/mp4">/);
});

test('cada imagen trae alt, ancho y alto', () => {
  const imgs = cuerpo(v2).match(/<img [^>]*>/g) ?? [];
  assert.ok(imgs.length > 6);
  for (const i of imgs) {
    assert.match(i, /\balt="/, i);
    assert.match(i, /\bwidth="\d+"/, i);
    assert.match(i, /\bheight="\d+"/, i);
  }
});

test('las imágenes de escenas lejanas no se piden al abrir (data-src), el hero sí y es prioritario', () => {
  const imgs = cuerpo(v2).match(/<img [^>]*>/g);
  const prioritarias = imgs.filter((i) => i.includes('fetchpriority="high"'));
  assert.equal(prioritarias.length, 1);
  assert.match(prioritarias[0], /piscina-natural-poster/);
  assert.ok(imgs.filter((i) => i.includes('data-src=')).length >= 5);
});

test('apertura "La misma mirada": solo la primera visita, sin movimiento reducido, se salta, dura ≤ 1,8 s y pesa ≤ 10 KB', () => {
  assert.match(v2, /<div class="apertura" aria-hidden="true">/);
  const script = /<script>(var d=document[\s\S]*?)<\/script>/.exec(v2)[1];
  assert.match(script, /try\{[^}]*prefers-reduced-motion:reduce[^}]*sessionStorage\.getItem\("lb-ap"\)[^}]*sessionStorage\.setItem\("lb-ap","1"\)\}catch\(e\)\{\}/);
  assert.match(script, /pointerdown/);
  assert.match(script, /keydown/);
  const limite = Number(/setTimeout\(r,(\d+)\)/.exec(script)[1]);
  assert.ok(limite <= 1800, `la apertura debe quitarse a 1,8 s o antes (${limite} ms)`);
  const css = readFileSync(join(RAIZ, 'src', 'v2', 'estilos', 'v2.css'), 'utf8');
  const bloqueCss = css.slice(css.indexOf('/* ───────── Apertura'), css.indexOf('/* ───────── Qué incluye'));
  assert.match(bloqueCss, /prefers-reduced-motion: reduce\) \{ \.apertura \{ display: none !important/);
  // Duración del último movimiento de la animación: retraso + duración ≤ 1,8 s
  for (const m of bloqueCss.matchAll(/animation: [^;]*?(\d+)ms [^;]*?(\d+)ms[,;]/g)) assert.ok(Number(m[1]) + Number(m[2]) <= 1800, m[0]);
  const html = /<div class="apertura"[\s\S]*?<\/svg><\/div>/.exec(v2)[0];
  assert.ok(Buffer.byteLength(script) + Buffer.byteLength(html) + Buffer.byteLength(bloqueCss) <= 10 * 1024);
});

test('Qué incluye y el precio salen antes de la primera escena (segunda pantalla), con el regular tachado y el sello', () => {
  const posIncluye = v2.indexOf('id="incluye"');
  const posPrimera = v2.indexOf('id="m-0900"');
  assert.ok(posIncluye > 0 && posIncluye < posPrimera);
  const bloque = v2.slice(posIncluye, posPrimera);
  assert.match(bloque, /<s class="regular" data-sello><span class="sr">antes <\/span>\$20<\/s> <span class="monto">\$15<\/span>/);
  assert.match(bloque, /\$10<\/s> \$7,50/);
  assert.match(bloque, /Precio de apertura · hasta el 31 de diciembre/);
  assert.match(bloque, /Piscina natural, cascada/);
});

test('desde el 1 de enero de 2027 la página no muestra tachados ni sello', () => {
  assert.doesNotMatch(v2Enero, /class="regular"|class="sello"/);
  assert.match(v2Enero, /\$15/);
});

test('las franjas llevan su hora de fin y la hora del sol; nada de "salvavidas"', () => {
  const franjas = v2.match(/<input type="radio" name="franja"[^>]*>/g);
  assert.equal(franjas.length, 3);
  for (const f of franjas) { assert.match(f, /data-fin="\d+"/); assert.match(f, /data-sol="[\d.]+"/); }
  assert.doesNotMatch(cuerpo(v2), /salvavidas|entrada|glamping/i);
});

test('el botón flotante y el arco existen; no quedan marcadores sin llenar', () => {
  assert.match(v2, /class="flotante"/);
  assert.match(v2, /class="arco"/);
  assert.doesNotMatch(cuerpo(v2), /\{[a-zA-Z]+\}/);
});

test('el logo del hero va centrado bajo la curva y la esquina del botón flotante se vigila', () => {
  const css = readFileSync(join(RAIZ, 'src', 'v2', 'estilos', 'v2.css'), 'utf8');
  assert.match(css, /\.logo-hero \{[^}]*left: 50%; translate: -50% 0;/);
  assert.match(css, /\.flotante\.visible\.calla \{ visibility: hidden/);
});
