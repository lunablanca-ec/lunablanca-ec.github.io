import test from 'node:test';
import assert from 'node:assert/strict';
import { sitio } from './ayudas.mjs';
import { construirMensaje, urlWhatsapp, formatearFecha, leerUtm } from '../src/js/logica.mjs';

const { precios, reserva } = sitio();
const datos = {
  base: reserva.mensajes.calculadora, fechaISO: '2026-12-13', franja: reserva.franjas[0],
  adultos: 4, ninos: 2, menores: 1, precios, sello: true, notaApertura: reserva.notaApertura,
  utm: { source: 'instagram', medium: 'bio' },
};

test('la fecha se formatea en es-EC sin correr un día (UTC)', () => {
  assert.equal(formatearFecha('2026-12-13'), 'domingo 13 de diciembre de 2026');
  assert.equal(formatearFecha('2027-01-01'), 'viernes 1 de enero de 2027');
});

test('el mensaje trae saludo, fecha, franja, personas por tipo, total y origen', () => {
  assert.equal(construirMensaje(datos), [
    reserva.mensajes.calculadora,
    'Fecha: domingo 13 de diciembre de 2026',
    'Piscina y zona BBQ: en la mañana',
    'Adultos: 4 · Niños de 5 a 12: 2 · Menores de 5: 1',
    'Total: $75 (precio de apertura)',
    'Origen: instagram · bio',
  ].join('\n'));
});

test('sin sello no hay nota de apertura; sin UTM no hay origen', () => {
  const m = construirMensaje({ ...datos, sello: false, utm: {} });
  assert.match(m, /Total: \$75$/m);
  assert.doesNotMatch(m, /apertura|Origen/);
});

test('el enlace de WhatsApp va codificado y se puede decodificar sin pérdida', () => {
  const m = construirMensaje(datos);
  const url = urlWhatsapp(reserva.whatsapp, m);
  assert.ok(url.startsWith(`https://wa.me/${reserva.whatsapp}?text=`));
  const texto = url.split('?text=')[1];
  assert.match(texto, /^[A-Za-z0-9%\-_.!~*'()]+$/);
  assert.match(texto, /%0A/);
  assert.equal(decodeURIComponent(texto), m);
});

test('leerUtm limpia símbolos y limita el largo', () => {
  const u = leerUtm(`?utm_source=insta<script>&utm_medium=bio&utm_campaign=${'a'.repeat(80)}`);
  assert.equal(u.source, 'instascript');
  assert.equal(u.medium, 'bio');
  assert.equal(u.campaign.length, 40);
});
