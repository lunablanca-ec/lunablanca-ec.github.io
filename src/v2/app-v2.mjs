// Navegador (v2 "El día gira"): arco del día, cielo continuo, escenas, videos, calculadora, sello, UTM y medición.
// Un solo requestAnimationFrame por desplazamiento; todo lo que se ve cambiar son variables CSS (--h, --g, --u).
// Las reglas de negocio (total, máximo, sello, mensaje) viven en logica.mjs; las del día en dia.mjs.
import {
  totalCentavos, formatearMoneda, contarPersonas, puedeSumar, puedeRestarAdulto, esFechaISO,
  hoyEnZona, hoyEfectivo, selloVigente, esFinDeSemana, leerUtm, construirMensaje, urlWhatsapp, desgloseGrupo,
} from '../js/logica.mjs';
import { franjasPasadas, horaPorScroll, etiquetaHora, acotar } from './dia.mjs';

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const config = JSON.parse($('#config-sitio').textContent);

const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ahorroDatos = Boolean(navigator.connection?.saveData);
const sinVideoAuto = quieto || ahorroDatos;
const raiz = document.documentElement;

// ───────────── Sello y UTM ─────────────

const hoyReal = hoyEnZona(Date.now(), config.apertura.zonaHoraria);
const sello = selloVigente(hoyEfectivo(location.search, Date.now(), config.apertura.zonaHoraria), config.apertura);
if (!sello) $$('[data-sello]').forEach((e) => e.remove());

function utmActual() {
  const nuevo = leerUtm(location.search);
  try {
    if (nuevo.source || nuevo.medium || nuevo.campaign) { sessionStorage.setItem('lb-utm', JSON.stringify(nuevo)); return nuevo; }
    return JSON.parse(sessionStorage.getItem('lb-utm')) ?? {};
  } catch { return nuevo; }
}
const utm = utmActual();

// ───────────── Medición ─────────────

window.dataLayer = window.dataLayer || [];

function cargarGa4(id) {
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id, { anonymize_ip: true });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(s);
}
if (config.medicion.ga4Id) {
  let cargado = false;
  const cargar = () => { if (!cargado) { cargado = true; cargarGa4(config.medicion.ga4Id); } };
  for (const ev of ['pointerdown', 'keydown', 'scroll']) addEventListener(ev, cargar, { once: true, passive: true });
  if ('requestIdleCallback' in window) requestIdleCallback(cargar, { timeout: 5000 }); else setTimeout(cargar, 4000);
}

function emitirWhatsapp(boton, grupo) {
  const detalle = {
    event: config.medicion.evento, boton,
    personas: grupo ? contarPersonas(grupo) : null,
    total: grupo ? totalCentavos(config.precios, grupo) / 100 : null,
    utm_source: utm.source || '',
  };
  window.dataLayer.push(detalle);
  window.dispatchEvent(new CustomEvent('lunablanca:whatsapp', { detail: detalle }));
  if (typeof window.gtag === 'function') {
    window.gtag('event', config.medicion.evento, { boton, personas: detalle.personas, total: detalle.total, utm_source: detalle.utm_source });
  }
}

// ───────────── El día: el sol del arco ─────────────
// La calculadora le habla al arco: al elegir franja, el sol se mueve a esa hora mientras la sección está a la vista.

const dia = { enCalculadora: false, solFranja: null, aplicar: () => {} };

// ───────────── Calculadora "Arma tu día" ─────────────

const calc = (() => {
  const { precios, reserva } = config;
  const c = config.calculadora;
  const form = $('#calculadora');
  const tipos = ['adultos', 'ninos', 'menores'];
  let grupo = { ...c.inicial };
  const fecha = $('#fecha');
  const avisoGrupo = $('#aviso');
  const avisoFecha = $('#aviso-fecha');
  const avisoFranja = $('#aviso-franja');
  const notaFecha = $('#nota-fecha');
  const salidaTotal = $('#total');
  const numeroTotal = salidaTotal.firstElementChild;
  const totalSr = $('#total-sr');
  const puntos = $$('.grupo-puntos i');
  const enviar = $('#enviar');
  const franjas = $$('input[name="franja"]');
  const fines = franjas.map((r) => Number(r.dataset.fin));
  fecha.min = hoyReal;

  const franjaElegida = () => franjas.find((r) => r.checked)?.value ?? '';
  const fechaValida = () => esFechaISO(fecha.value) && fecha.value >= hoyReal;

  function avisar(el, texto) {
    el.textContent = '';
    if (texto) setTimeout(() => { el.textContent = texto; }, 60);
  }

  // Si la fecha elegida es hoy (hora de Ecuador), las franjas que ya pasaron se deshabilitan.
  function actualizarFranjas() {
    const pasadas = franjasPasadas(fechaValida() ? fecha.value : '', fines);
    franjas.forEach((r, i) => {
      r.disabled = pasadas[i];
      $('.pasada', r.closest('.franja')).hidden = !pasadas[i];
      if (pasadas[i] && r.checked) { r.checked = false; avisar(avisoFranja, c.avisos.faltaFranja); sol(); }
    });
    if (pasadas.length && pasadas.every(Boolean)) avisar(avisoFecha, c.avisos.hoyTarde);
    return pasadas;
  }

  function sol() {
    const r = franjas.find((x) => x.checked);
    dia.solFranja = r ? Number(r.dataset.sol) : null;
    dia.aplicar(true);
  }

  // El total cuenta hasta su valor (instantáneo con movimiento reducido).
  let mostrado = totalCentavos(precios, grupo);
  let cuentaId = 0;
  function mostrarTotal(destino) {
    const origen = mostrado;
    mostrado = destino;
    const id = ++cuentaId;
    if (quieto || origen === destino) { numeroTotal.textContent = formatearMoneda(destino); totalSr.textContent = formatearMoneda(destino); return; }
    salidaTotal.classList.remove('cuenta');
    void salidaTotal.offsetWidth;
    salidaTotal.classList.add('cuenta');
    const t0 = performance.now();
    const dur = 520;
    const paso = (t) => {
      if (id !== cuentaId) return;
      const k = acotar((t - t0) / dur);
      const e = 1 - (1 - k) ** 3;
      numeroTotal.textContent = formatearMoneda(Math.round(origen + (destino - origen) * e));
      if (k < 1) requestAnimationFrame(paso); else totalSr.textContent = formatearMoneda(destino);
    };
    requestAnimationFrame(paso);
  }

  function actualizarMensaje() {
    const mensaje = construirMensaje({
      base: reserva.mensajes.calculadora,
      fechaISO: fechaValida() ? fecha.value : '',
      franja: franjaElegida(),
      ...grupo, precios, sello, notaApertura: reserva.notaApertura, utm, faltan: c.vacio,
    });
    $('#vista-previa').textContent = mensaje;
    enviar.href = urlWhatsapp(reserva.whatsapp, mensaje);
  }

  function pintar(tipoCambiado) {
    for (const t of tipos) {
      const fila = $(`.contador[data-tipo="${t}"]`);
      const salida = $(`#cant-${t}`);
      salida.textContent = grupo[t];
      if (t === tipoCambiado && !quieto) { salida.classList.remove('pop'); void salida.offsetWidth; salida.classList.add('pop'); }
      $('[data-accion="restar"]', fila).setAttribute('aria-disabled', String(t === 'adultos' ? !puedeRestarAdulto(precios, grupo) : grupo[t] <= 0));
      $('[data-accion="sumar"]', fila).setAttribute('aria-disabled', String(!puedeSumar(precios, grupo)));
    }
    let i = 0;
    for (const [t, clase] of [['adultos', 'lleno'], ['ninos', 'lleno nino'], ['menores', 'lleno menor']]) {
      for (let k = 0; k < grupo[t]; k++, i++) if (puntos[i]) puntos[i].className = clase;
    }
    for (; i < puntos.length; i++) puntos[i].className = '';
    mostrarTotal(totalCentavos(precios, grupo));
    $('#desglose').textContent = desgloseGrupo(grupo, precios, c.desglose);
    actualizarMensaje();
  }

  function cambiar(tipo, delta) {
    const siguiente = { ...grupo };
    if (delta > 0) {
      if (!puedeSumar(precios, grupo)) return avisar(avisoGrupo, c.avisos.maximo);
      siguiente[tipo] += 1;
    } else {
      if (tipo === 'adultos' && !puedeRestarAdulto(precios, grupo)) return avisar(avisoGrupo, c.avisos.minimoAdulto);
      if (grupo[tipo] <= 0) return undefined;
      siguiente[tipo] -= 1;
    }
    grupo = siguiente;
    avisar(avisoGrupo, contarPersonas(grupo) >= precios.maxPersonas ? c.avisos.maximo : '');
    pintar(tipo);
    return undefined;
  }

  form.addEventListener('click', (e) => {
    const boton = e.target.closest('.contador button');
    if (boton) cambiar(boton.closest('.contador').dataset.tipo, boton.dataset.accion === 'sumar' ? 1 : -1);
  });

  fecha.addEventListener('input', () => {
    fecha.removeAttribute('aria-invalid');
    notaFecha.classList.remove('visible');
    notaFecha.textContent = '';
    if (!fecha.value) avisar(avisoFecha, '');
    else if (!fechaValida()) avisar(avisoFecha, c.avisos.fechaPasada);
    else {
      avisar(avisoFecha, '');
      notaFecha.textContent = esFinDeSemana(fecha.value) ? c.notaFecha.finDeSemana : c.notaFecha.entreSemana;
      void notaFecha.offsetWidth;
      notaFecha.classList.add('visible');
    }
    actualizarFranjas();
    actualizarMensaje();
  });
  franjas.forEach((r) => r.addEventListener('change', () => { avisar(avisoFranja, ''); sol(); actualizarMensaje(); }));
  // El tiempo pasa: al volver a la pestaña y cada minuto se revisa qué franjas quedaron atrás.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { actualizarFranjas(); actualizarMensaje(); } });
  setInterval(() => { if (!document.hidden && fechaValida()) { actualizarFranjas(); actualizarMensaje(); } }, 60000);

  function validar() {
    const pasadas = actualizarFranjas();
    if (!fechaValida()) {
      fecha.setAttribute('aria-invalid', 'true');
      avisar(avisoFecha, fecha.value ? c.avisos.fechaPasada : c.avisos.faltaFecha);
      fecha.focus();
      return false;
    }
    if (!franjaElegida()) {
      if (!pasadas.every(Boolean)) { avisar(avisoFranja, c.avisos.faltaFranja); franjas.find((r) => !r.disabled)?.focus(); } else fecha.focus();
      return false;
    }
    return true;
  }
  enviar.addEventListener('click', (e) => { if (!validar()) { e.preventDefault(); e.stopImmediatePropagation(); } });
  pintar();
  return { grupo: () => grupo };
})();

document.addEventListener('click', (e) => {
  const enlace = e.target.closest('[data-wa]');
  if (enlace) emitirWhatsapp(enlace.dataset.wa, enlace.dataset.wa === 'calculadora' ? calc.grupo() : null);
});

// ───────────── Videos: solo el de la escena activa se reproduce ─────────────

const videos = $$('[data-video]').map((marco) => {
  const video = $('video', marco);
  const boton = $('.video-boton', marco);
  const etiquetar = (reproduciendo) => {
    if (!boton) return;
    boton.textContent = reproduciendo ? boton.dataset.pausar : boton.dataset.reproducir;
    boton.setAttribute('aria-label', `${boton.textContent}. ${boton.dataset.alt}`);
  };
  video.addEventListener('playing', () => marco.classList.add('reproduciendo'), { once: true });
  if (boton && sinVideoAuto) {
    boton.hidden = false;
    etiquetar(false);
    boton.addEventListener('click', () => {
      if (video.paused) video.play().then(() => etiquetar(true)).catch(() => {}); else { video.pause(); etiquetar(false); }
    });
  }
  return { escena: marco.closest('[data-escena]'), video, etiquetar };
});
let videosListos = false;
function sincronizarVideos(activa) {
  if (!videosListos || sinVideoAuto) return;
  for (const v of videos) {
    if (v.escena === activa) v.video.play().then(() => v.etiquetar(true)).catch(() => {});
    else if (!v.video.paused) { v.video.pause(); v.etiquetar(false); }
  }
}

// ───────────── Botón flotante (opaco) ─────────────

(() => {
  const flotante = $('.flotante');
  const resumen = $('#incluye');
  const armar = $('#arma-tu-dia');
  // Se lee la geometría en cada aviso: el botón aparece pasado el resumen y antes de llegar a la calculadora, vengas de arriba o de abajo
  const actualizar = () => flotante.classList.toggle('visible', resumen.getBoundingClientRect().bottom < 0 && armar.getBoundingClientRect().top >= innerHeight);
  new IntersectionObserver(actualizar).observe(resumen);
  new IntersectionObserver(actualizar).observe(armar);
})();

// La tipografía 600 (solo el total) se pide cuando la calculadora se acerca.
new IntersectionObserver(([x], io) => { if (x.isIntersecting) { raiz.classList.add('ver-total'); io.disconnect(); } }, { rootMargin: '900px 0px' }).observe($('#arma-tu-dia'));

// ───────────── Imágenes de las escenas: se piden cuando la escena se acerca ─────────────

function hidratar(escena) {
  $$('[data-srcset]', escena).forEach((s) => { s.srcset = s.dataset.srcset; s.removeAttribute('data-srcset'); });
  $$('img[data-src]', escena).forEach((i) => { i.src = i.dataset.src; i.removeAttribute('data-src'); });
  $$('video[data-poster]', escena).forEach((v) => { v.poster = v.dataset.poster; v.removeAttribute('data-poster'); });
}
let hidratacionLista = false;
const alcance = new IntersectionObserver((entradas) => {
  for (const e of entradas) if (e.isIntersecting) { hidratar(e.target); alcance.unobserve(e.target); }
}, { rootMargin: '150% 0px' });
// Primero se espera a que termine la carga del hero; después se observan las escenas.
const empezarHidratar = () => { hidratacionLista = true; $$('[data-escena]').forEach((e) => alcance.observe(e)); };
if (document.readyState === 'complete') setTimeout(empezarHidratar, 400); else addEventListener('load', () => setTimeout(empezarHidratar, 400), { once: true });

// ───────────── El día gira ─────────────

const escenas = $$('[data-escena]');
const horas = escenas.map((e) => Number(e.dataset.hora));
const arco = $('.arco');
const etiquetaSol = $('[data-hora-sol]');
const huella = $('.huella');
const cierre = $('#cierre');
const bandaCielo = $('.banda');
const cieloPleno = $('.cielo-pleno');
let estaNoche = false;
const asientoCalculadora = $('#arma-tu-dia');

let pins = [];
let anclas = [];
let vh = innerHeight;
let cierreTop = 0;
let maxScroll = 1;
let activa = -1;
let ultimaH = -1;
let ultimoG = -1;
let ultimoPs = -1;
let ultimaEtiqueta = '';
let ultimoLl = -1;
const ultimaU = new Array(escenas.length).fill(-1);
let pendiente = false;
let salto;

const fijar = (el, nombre, valor) => el.style.setProperty(nombre, valor);

function medir() {
  vh = innerHeight;
  const banda = $('.banda').offsetHeight;
  pins = escenas.map((e) => e.previousElementSibling.getBoundingClientRect().top + scrollY - banda);
  anclas = pins.map((y, i) => ({ y, h: horas[i] }));
  cierreTop = cierre.getBoundingClientRect().top + scrollY;
  maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
}

function activarEscena(i) {
  activa = i;
  escenas.forEach((e, k) => { e.classList.toggle('activa', k === i); e.classList.toggle('cerca', k >= i - 1 && k <= i + 1); });
  sincronizarVideos(escenas[i]);
}

/** Sol y luna del arco: siguen al scroll, salvo mientras la calculadora tiene una franja elegida. */
function pintarSol(hScroll, conSalto) {
  const mandaFranja = dia.enCalculadora && dia.solFranja !== null;
  const hs = mandaFranja ? dia.solFranja : hScroll;
  const ps = acotar((hs - 8) / 12);
  if (conSalto) {
    arco.classList.add('salta');
    clearTimeout(salto);
    salto = setTimeout(() => arco.classList.remove('salta'), 1000);
  }
  if (Math.abs(ps - ultimoPs) > 0.0004) { ultimoPs = ps; fijar(arco, '--ps', ps.toFixed(4)); fijar(arco, '--hs', hs.toFixed(3)); }
  const texto = etiquetaHora(hs);
  if (texto !== ultimaEtiqueta) { ultimaEtiqueta = texto; etiquetaSol.textContent = texto; }
}

function ponerHora(h) {
  const v = h.toFixed(3);
  fijar(bandaCielo, '--h', v);
  fijar(cieloPleno, '--h', v);
  const noche = h >= 18.8;
  if (noche !== estaNoche) { estaNoche = noche; raiz.classList.toggle('noche', noche); }
}

function cuadro() {
  pendiente = false;
  const y = scrollY;
  const h = horaPorScroll(y, anclas);
  if (Math.abs(h - ultimaH) > 0.003) { ultimaH = h; ponerHora(h); }
  pintarSol(h, false);
  const g = acotar(y / maxScroll);
  if (Math.abs(g - ultimoG) > 0.0008) { ultimoG = g; fijar(huella, '--g', g.toFixed(4)); }

  let idx = 0;
  for (let k = 0; k < pins.length; k++) if (pins[k] - vh * 0.45 <= y) idx = k;
  if (idx !== activa) activarEscena(idx);

  // Avance de cada escena cercana: zoom del fondo y parallax de las capas
  for (let k = Math.max(0, idx - 1); k <= Math.min(escenas.length - 1, idx + 1); k++) {
    const largo = k + 1 < pins.length ? pins[k + 1] - pins[k] : vh * 0.7;
    const u = acotar((y - (pins[k] - vh * 0.9)) / (vh * 0.9 + largo));
    if (Math.abs(u - ultimaU[k]) > 0.002) { ultimaU[k] = u; fijar(escenas[k], '--u', u.toFixed(3)); }
  }

  if (y > cierreTop - vh) {
    const ll = acotar((y - (cierreTop - vh * 0.9)) / (vh * 0.75));
    if (Math.abs(ll - ultimoLl) > 0.004) { ultimoLl = ll; fijar(cierre, '--ll', ll.toFixed(3)); }
  }
}

dia.aplicar = (conSalto) => pintarSol(ultimaH < 0 ? 8 : ultimaH, conSalto);

// Con movimiento reducido no hay nada ligado al scroll: el sol y el cielo cambian por escena.
function cuadroQuieto() {
  pendiente = false;
  const y = scrollY;
  let idx = 0;
  for (let k = 0; k < pins.length; k++) if (pins[k] - vh * 0.5 <= y) idx = k;
  if (idx !== activa) {
    activarEscena(idx);
    ponerHora(horas[idx]);
    ultimaH = horas[idx];
    fijar(huella, '--g', (idx / (escenas.length - 1)).toFixed(3));
    pintarSol(horas[idx], false);
  }
  fijar(cierre, '--ll', y > cierreTop - vh * 0.5 ? 1 : 0);
}

const pedir = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(quieto ? cuadroQuieto : cuadro); } };
let reajuste;
const reajustar = () => { clearTimeout(reajuste); reajuste = setTimeout(() => { medir(); pedir(); }, 150); };

new IntersectionObserver(([x]) => { dia.enCalculadora = x.isIntersecting; dia.aplicar(true); }, { threshold: 0.15 }).observe(asientoCalculadora);

medir();
activarEscena(0);
if (quieto) cuadroQuieto(); else cuadro();
addEventListener('scroll', pedir, { passive: true });
addEventListener('resize', reajustar);
addEventListener('load', () => { medir(); pedir(); }, { once: true });
document.fonts?.ready.then(() => { medir(); pedir(); });

// El video del hero empieza después de 'load' y con el navegador en reposo: el poster ya es lo primero que se ve.
const iniciarVideos = () => { videosListos = true; sincronizarVideos(escenas[Math.max(activa, 0)]); };
const cuandoReposa = () => setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(iniciarVideos, { timeout: 2000 }) : iniciarVideos()), 2500);
if (document.readyState === 'complete') cuandoReposa(); else addEventListener('load', cuandoReposa, { once: true });
