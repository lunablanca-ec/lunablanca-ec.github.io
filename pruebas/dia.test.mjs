import test from 'node:test';
import assert from 'node:assert/strict';
import { ahoraEnEcuador, franjasPasadas, horaPorScroll, etiquetaHora, frases } from '../src/v2/dia.mjs';

const FINES = [12, 15, 20];
// 2026-11-19 14:30 en Ecuador = 19:30 UTC
const ahora = ahoraEnEcuador(Date.UTC(2026, 10, 19, 19, 30));

test('la hora y la fecha se leen en America/Guayaquil', () => {
  assert.deepEqual(ahora, { fecha: '2026-11-19', hora: 14.5 });
  // 02:00 UTC del 20 sigue siendo el 19 a las 21:00 en Ecuador
  assert.deepEqual(ahoraEnEcuador(Date.UTC(2026, 10, 20, 2, 0)), { fecha: '2026-11-19', hora: 21 });
});

test('si la fecha es hoy, las franjas que ya pasaron quedan deshabilitadas', () => {
  assert.deepEqual(franjasPasadas('2026-11-19', FINES, ahora), [true, false, false]);
  assert.deepEqual(franjasPasadas('2026-11-19', FINES, { fecha: '2026-11-19', hora: 21 }), [true, true, true]);
  assert.deepEqual(franjasPasadas('2026-11-19', FINES, { fecha: '2026-11-19', hora: 7.9 }), [false, false, false]);
});

test('otro día, ninguna franja pasó', () => {
  assert.deepEqual(franjasPasadas('2026-11-20', FINES, ahora), [false, false, false]);
  assert.deepEqual(franjasPasadas('', FINES, ahora), [false, false, false]);
});

test('la hora del arco sigue al scroll entre anclas y no se sale de 8 a 20', () => {
  const anclas = [{ y: 0, h: 8 }, { y: 1000, h: 9 }, { y: 3000, h: 12 }, { y: 4000, h: 20 }];
  assert.equal(horaPorScroll(-50, anclas), 8);
  assert.equal(horaPorScroll(500, anclas), 8.5);
  assert.equal(horaPorScroll(2000, anclas), 10.5);
  assert.equal(horaPorScroll(9999, anclas), 20);
});

test('la etiqueta de hora va en pasos de 10 minutos', () => {
  assert.equal(etiquetaHora(8), '8:00');
  assert.equal(etiquetaHora(10.5), '10:30');
  assert.equal(etiquetaHora(19.98), '20:00');
  assert.equal(etiquetaHora(12.26), '12:20');
});

test('el texto se parte en frases', () => {
  assert.deepEqual(frases('Luna es la perrita. Tu perro también puede venir, con correa y a tu cuidado.'),
    ['Luna es la perrita.', 'Tu perro también puede venir, con correa y a tu cuidado.']);
});
