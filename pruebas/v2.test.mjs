import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RAIZ } from './ayudas.mjs';

function construir(env = {}) {
  const dist = mkdtempSync(join(tmpdir(), 'dist-lb-v2-'));
  try {
    const r = spawnSync(process.execPath, [join(RAIZ, 'herramientas', 'build.mjs')], { env: { ...process.env, ...env, DIST_DIR: dist }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    return { raiz: readFileSync(join(dist, 'index.html'), 'utf8'), v2: readFileSync(join(dist, 'v2', 'index.html'), 'utf8'), existe: (f) => existsSync(join(dist, f)) };
  } finally { rmSync(dist, { recursive: true, force: true }); }
}
const { raiz, v2 } = construir({ FECHA_SIMULADA: '2026-11-19' });
const { v2: v2Enero } = construir({ FECHA_SIMULADA: '2027-01-01' });
const cuerpo = (h) => h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');

test('la v2 se publica en /v2/ y no compite con la raíz: noindex y la raíz conserva su galería', () => {
  assert.match(v2, /<meta name="robots" content="noindex">/);
  assert.match(raiz, /Así se vive/); // la raíz no se toca
  assert.doesNotMatch(cuerpo(raiz), /class="escena/);
});

test('la v2 no tiene galería "Así se vive" y tiene como máximo 6 escenas de momento', () => {
  assert.doesNotMatch(cuerpo(v2), /Así se vive|galeria/);
  const escenas = v2.match(/<section class="escena[^"]*" id="m-\d{4}"/g) ?? [];
  assert.ok(escenas.length >= 5 && escenas.length <= 6, `hay ${escenas.length} escenas`);
});

test('cada escena tiene un medio dominante y como máximo un detalle secundario, nunca un collage', () => {
  const secciones = v2.split('<section class="escena').slice(1);
  for (const s of secciones.filter((x) => /id="m-\d{4}"/.test(x) && !x.startsWith(' enmarcada'))) {
    const capas = (s.match(/<figure class="capa /g) ?? []).length;
    assert.ok(capas <= 1, `capas: ${capas}`);
  }
  assert.doesNotMatch(cuerpo(v2), /rejilla|galeria-/);
  assert.doesNotMatch(v2, /adultos-descansan/, 'ninguna persona descansando en primer plano');
});

test('todos los videos llevan poster y son decorativos', () => {
  const videos = cuerpo(v2).match(/<video[^>]*>/g) ?? [];
  assert.ok(videos.length >= 2 && videos.length <= 4);
  for (const v of videos) {
    assert.match(v, /\b(data-)?poster="/, v);
    assert.match(v, /aria-hidden="true"/);
    assert.match(v, /preload="none"/);
  }
});

test('cada imagen trae alt, ancho y alto', () => {
  const imgs = cuerpo(v2).match(/<img [^>]*>/g) ?? [];
  assert.ok(imgs.length > 10);
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
  assert.ok(imgs.filter((i) => i.includes('data-src=')).length >= 10);
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

test('desde el 1 de enero de 2027 la v2 no muestra tachados ni sello', () => {
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
