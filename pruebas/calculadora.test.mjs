import test from 'node:test';
import assert from 'node:assert/strict';
import { sitio } from './ayudas.mjs';
import {
  totalCentavos, formatearMoneda, validarGrupo, puedeSumar, puedeRestarAdulto, contarPersonas,
} from '../src/js/logica.mjs';

const { precios } = sitio();

test('4 adultos + 2 niños + 1 menor de 5 = $75 (con los precios de sitio.json)', () => {
  const g = { adultos: 4, ninos: 2, menores: 1 };
  assert.equal(totalCentavos(precios, g), 4 * precios.adulto * 100 + 2 * precios.nino * 100);
  assert.equal(totalCentavos(precios, g), 7500);
  assert.equal(formatearMoneda(7500), '$75');
  assert.deepEqual(validarGrupo(precios, g), []);
});

test('los menores de 5 no suman al total pero sí cuentan como personas', () => {
  const g = { adultos: 1, ninos: 0, menores: 3 };
  assert.equal(totalCentavos(precios, g), precios.adulto * 100);
  assert.equal(contarPersonas(g), 4);
});

test('sin errores de redondeo: 3 niños cuestan $22,50', () => {
  assert.equal(totalCentavos(precios, { adultos: 0, ninos: 3, menores: 0 }), 2250);
  assert.equal(formatearMoneda(2250), '$22,50');
  assert.equal(formatearMoneda(750), '$7,50');
});

test('bloquea más del máximo contando a todos', () => {
  const lleno = { adultos: 5, ninos: 3, menores: 2 };
  assert.equal(contarPersonas(lleno), precios.maxPersonas);
  assert.deepEqual(validarGrupo(precios, lleno), []);
  assert.equal(puedeSumar(precios, lleno), false);
  assert.ok(validarGrupo(precios, { ...lleno, menores: 3 }).includes('maxPersonas'));
  assert.equal(puedeSumar(precios, { adultos: 1, ninos: 0, menores: 0 }), true);
});

test('exige el mínimo de adultos', () => {
  assert.ok(validarGrupo(precios, { adultos: 0, ninos: 2, menores: 0 }).includes('minAdultos'));
  assert.equal(puedeRestarAdulto(precios, { adultos: precios.minAdultos, ninos: 0, menores: 0 }), false);
  assert.equal(puedeRestarAdulto(precios, { adultos: precios.minAdultos + 1, ninos: 0, menores: 0 }), true);
});

test('rechaza cantidades inválidas', () => {
  assert.ok(validarGrupo(precios, { adultos: 1.5, ninos: 0, menores: 0 }).includes('invalido'));
  assert.ok(validarGrupo(precios, { adultos: 1, ninos: -1, menores: 0 }).includes('invalido'));
});
