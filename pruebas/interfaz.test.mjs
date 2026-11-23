import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, sitio, construirEnTemporal } from './ayudas.mjs';
import { validarSitio } from '../herramientas/validacion.mjs';
import { esFinDeSemana, desgloseGrupo, construirMensaje } from '../src/js/logica.mjs';

const s = sitio();
const { html: pagina } = construirEnTemporal({ FECHA_SIMULADA: '2026-11-19' });
const { html: paginaEnero } = construirEnTemporal({ FECHA_SIMULADA: '2027-01-01' });
const cuerpo = (h) => h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');

test('no quedan marcadores {…} sin llenar y los precios salen de sitio.json', () => {
  assert.doesNotMatch(cuerpo(pagina), /\{[a-zA-Z]+\}/);
  assert.match(pagina, /desde <s class="regular" data-sello><span class="sr">antes <\/span>\$20<\/s> <span class="monto">\$15<\/span> por persona/);
  assert.match(pagina, /Niños de 5 a 12 años, <s class="regular" data-sello><span class="sr">antes <\/span>\$10<\/s> \$7,50 · menores de 5 no pagan/);
  assert.match(pagina, /Hasta 10 personas por grupo/);
});

test('precio regular tachado junto al de apertura; desde el 1/1/2027 se oculta y los precios no cambian', () => {
  assert.equal((pagina.match(/<s class="regular"/g) ?? []).length >= 4, true); // resumen, niños, calculadora (2) y pregunta
  assert.doesNotMatch(paginaEnero, /<s class="regular"|\$20|\$10(?!\d)/);
  assert.match(paginaEnero, /desde <span class="monto">\$15<\/span> por persona/);
  assert.match(paginaEnero, /Niños de 5 a 12 años, \$7,50 · menores de 5 no pagan/);
  for (const h of [pagina, paginaEnero]) assert.doesNotMatch(cuerpo(h), /organizador/i);
});

test('maps real, distancia nueva y sin la frase anterior', () => {
  assert.equal(s.redes.maps, 'https://maps.app.goo.gl/kMJ9WTQH3uZZ9Ke1A');
  assert.ok(pagina.includes('href="https://maps.app.goo.gl/kMJ9WTQH3uZZ9Ke1A"'));
  assert.ok((pagina.match(/a unas dos horas y media de Quito/g) ?? []).length >= 3);
  assert.doesNotMatch(pagina, /poco más de dos horas/);
});

test('el sello va en el resumen y en la pregunta 2 mientras es vigente, y desaparece en enero', () => {
  assert.ok((pagina.match(/data-sello/g) ?? []).length >= 3);
  assert.doesNotMatch(paginaEnero, /data-sello|Precio de apertura/);
});

test('el CSS no usa filtros, backdrop-filter ni mezclas (plan §5) y no escribe colores sueltos fuera de los tokens', () => {
  for (const dir of [join(RAIZ, 'src', 'estilos'), join(RAIZ, 'src', 'v2', 'estilos')]) for (const f of readdirSync(dir)) {
    const css = readFileSync(join(dir, f), 'utf8');
    // El tratamiento nocturno de la v2 usa mix-blend-mode y la huella un drop-shadow: el plan §5 solo rige para los estilos compartidos.
    if (!dir.includes('v2')) assert.doesNotMatch(css, /(^|[^-])filter\s*:|backdrop-filter|mix-blend-mode/, f);
    if (f !== 'tokens.css') assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-fA-F]{3,8}\b/, `${f} trae un color fuera de los tokens`);
  }
});

test('el enlace de salto, el botón flotante y los botones de WhatsApp existen con su mensaje', () => {
  assert.match(pagina, /<a class="saltar" href="#arma-tu-dia">Saltar a Arma tu día<\/a>/);
  assert.match(pagina, /<a class="flotante" href="#arma-tu-dia">Arma tu día<\/a>/);
  for (const k of ['principal', 'calculadora', 'pie']) assert.match(pagina, new RegExp(`data-wa="${k}"`));
});

test('el validador rechaza un marcador mal escrito', () => {
  const malo = structuredClone(s);
  malo.textos.resumen.precio = 'Desde {adulot} por persona';
  assert.match(validarSitio(malo).join('\n'), /adulot/);
});

test('fin de semana, desglose y vista previa con datos pendientes', () => {
  assert.equal(esFinDeSemana('2026-12-13'), true); // domingo
  assert.equal(esFinDeSemana('2026-12-11'), false); // viernes
  const nombres = { adultos: ['adulto', 'adultos'], ninos: ['niño', 'niños'], menores: ['menor de 5, gratis', 'menores de 5, gratis'] };
  assert.equal(desgloseGrupo({ adultos: 4, ninos: 2, menores: 1 }, s.precios, nombres), '4 adultos × $15 · 2 niños × $7,50 · 1 menor de 5, gratis');
  assert.equal(desgloseGrupo({ adultos: 1, ninos: 0, menores: 0 }, s.precios, nombres), '1 adulto × $15');
  const m = construirMensaje({ base: 'Hola', fechaISO: '', franja: '', adultos: 2, ninos: 0, menores: 0, precios: s.precios, faltan: { fecha: 'por elegir', franja: 'por elegir' } });
  assert.match(m, /Fecha: por elegir\nPiscina y zona BBQ: por elegir\n/);
});
