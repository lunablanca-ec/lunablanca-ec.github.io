import test from 'node:test';
import assert from 'node:assert/strict';
import { sitio, construirEnTemporal } from './ayudas.mjs';
import { selloVigente, hoyEnZona, hoyEfectivo, totalCentavos } from '../src/js/logica.mjs';

const { apertura, precios } = sitio();

test('el sello está vigente el 2026-12-31 y se oculta el 2027-01-01', () => {
  assert.equal(selloVigente('2026-12-31', apertura), true);
  assert.equal(selloVigente('2027-01-01', apertura), false);
  assert.equal(selloVigente('2026-11-19', apertura), true);
});

test('la fecha se calcula en Ecuador (UTC-5): el cambio ocurre a las 05:00 UTC', () => {
  const antes = Date.parse('2027-01-01T04:59:59Z');
  const despues = Date.parse('2027-01-01T05:00:00Z');
  assert.equal(hoyEnZona(antes, apertura.zonaHoraria), '2026-12-31');
  assert.equal(hoyEnZona(despues, apertura.zonaHoraria), '2027-01-01');
});

test('?hoy= simula la fecha solo si es una fecha real', () => {
  const ahora = Date.parse('2026-11-19T12:00:00Z');
  assert.equal(hoyEfectivo('?hoy=2027-01-01', ahora, apertura.zonaHoraria), '2027-01-01');
  assert.equal(hoyEfectivo('?hoy=2027-13-45', ahora, apertura.zonaHoraria), '2026-11-19');
  assert.equal(hoyEfectivo('', ahora, apertura.zonaHoraria), '2026-11-19');
});

test('los precios no dependen de la fecha', () => {
  assert.equal(totalCentavos(precios, { adultos: 4, ninos: 2, menores: 1 }), 7500);
});

test('build con FECHA_SIMULADA: sello el 2026-12-31, sin sello el 2027-01-01, mismos precios', () => {
  const visible = construirEnTemporal({ FECHA_SIMULADA: '2026-12-31' });
  const oculto = construirEnTemporal({ FECHA_SIMULADA: '2027-01-01' });
  assert.equal(visible.estado, 0, visible.salida);
  assert.equal(oculto.estado, 0, oculto.salida);
  assert.match(visible.html, /data-sello/);
  assert.doesNotMatch(oculto.html, /data-sello/);
  assert.ok(!oculto.html.includes(apertura.selloTexto));
  // Texto de las líneas de precio sin el tachado (que lleva data-sello y solo existe con el sello).
  const precio = (h) => [...h.matchAll(/data-precio[^>]*>(.*?)<\/p>/g)]
    .map((m) => m[1].replace(/<s class="regular"[^>]*>.*?<\/s>\s?/g, '').replace(/<[^>]+>/g, '')).join('|');
  assert.equal(precio(visible.html), precio(oculto.html));
  assert.match(visible.html, /\$15/);
  assert.match(oculto.html, /\$7,50/);
});

test('el build rechaza una FECHA_SIMULADA inválida', () => {
  const r = construirEnTemporal({ FECHA_SIMULADA: '2027-02-31' });
  assert.equal(r.estado, 1);
  assert.match(r.salida, /FECHA_SIMULADA/);
});
