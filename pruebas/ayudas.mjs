// Utilidades compartidas por las pruebas (no es una prueba).
import { readFileSync, mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const sitio = () => JSON.parse(readFileSync(join(RAIZ, 'contenido', 'sitio.json'), 'utf8'));

/** Corre el build en una carpeta temporal "dist-…" y devuelve el HTML. */
export function construirEnTemporal(env = {}) {
  const dist = mkdtempSync(join(tmpdir(), 'dist-lb-'));
  try {
    const r = spawnSync(process.execPath, [join(RAIZ, 'herramientas', 'build.mjs')], {
      env: { ...process.env, ...env, DIST_DIR: dist }, encoding: 'utf8',
    });
    const leer = (f) => (existsSync(join(dist, f)) ? readFileSync(join(dist, f), 'utf8') : null);
    return {
      estado: r.status, salida: r.stdout + r.stderr, html: leer('index.html'), html404: leer('404.html'),
      sitemap: leer('sitemap.xml'), robots: leer('robots.txt'), archivos: readdirSync(dist),
    };
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
}
