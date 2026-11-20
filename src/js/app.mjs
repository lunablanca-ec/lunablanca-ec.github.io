// Navegador: recorrido del día (un solo rAF), videos, calculadora, sello, UTM y medición.
// Las reglas (total, máximo, sello, mensaje) viven en logica.mjs; aquí solo se conectan a la página.
import {
  totalCentavos, formatearMoneda, contarPersonas, puedeSumar, puedeRestarAdulto, esFechaISO,
  hoyEnZona, hoyEfectivo, selloVigente, esFinDeSemana, leerUtm, construirMensaje, urlWhatsapp, desgloseGrupo,
} from './logica.mjs';

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const config = JSON.parse($('#config-sitio').textContent);

const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ahorroDatos = Boolean(navigator.connection?.saveData);
const sinVideoAuto = quieto || ahorroDatos;
const acotar = (v) => Math.min(1, Math.max(0, v));

// ───────────── Sello y UTM ─────────────

const hoyReal = hoyEnZona(Date.now(), config.apertura.zonaHoraria);
// ?hoy=AAAA-MM-DD solo simula el sello: los precios y la fecha mínima del calendario no se tocan.
const sello = selloVigente(hoyEfectivo(location.search, Date.now(), config.apertura.zonaHoraria), config.apertura);
if (!sello) $$('[data-sello]').forEach((e) => e.remove());

function utmActual() {
  const nuevo = leerUtm(location.search);
  try {
    if (nuevo.source || nuevo.medium || nuevo.campaign) { sessionStorage.setItem('lb-utm', JSON.stringify(nuevo)); return nuevo; }
    return JSON.parse(sessionStorage.getItem('lb-utm')) ?? {};
  } catch { return nuevo; } // sessionStorage bloqueado: se usa lo de esta visita
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

// Sin ID no se carga nada de terceros. Con ID, se espera a la primera interacción o a un momento libre.
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
  const puntos = $$('.grupo-puntos i');
  const enviar = $('#enviar');
  const franjas = $$('input[name="franja"]');
  fecha.min = hoyReal;

  const franjaElegida = () => franjas.find((r) => r.checked)?.value ?? '';
  const fechaValida = () => esFechaISO(fecha.value) && fecha.value >= hoyReal;

  // Re-anuncia el aviso aunque el texto sea el mismo: la región aria-live solo lee cambios.
  function avisar(el, texto) {
    el.textContent = '';
    if (texto) setTimeout(() => { el.textContent = texto; }, 60);
  }

  const numeroTotal = salidaTotal.firstElementChild; // el número real; los clones se insertan antes y no cuentan
  function mostrarTotal(texto, direccion) {
    const actual = numeroTotal;
    if (actual.textContent === texto) return;
    if (quieto || !direccion) { actual.textContent = texto; return; }
    // El número viejo sale y el nuevo entra desde el lado opuesto; los clones son decorativos.
    const viejo = actual.cloneNode(true);
    viejo.setAttribute('aria-hidden', 'true');
    salidaTotal.insertBefore(viejo, actual);
    actual.textContent = texto;
    actual.className = direccion > 0 ? 'entra-abajo' : 'entra-arriba';
    void actual.offsetWidth; // fija el estado inicial antes de animar
    viejo.className = direccion > 0 ? 'sale-arriba' : 'sale-abajo';
    actual.className = '';
    setTimeout(() => viejo.remove(), 480);
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

  function pintar(direccion = 0) {
    for (const t of tipos) {
      const fila = $(`.contador[data-tipo="${t}"]`);
      $(`#cant-${t}`).textContent = grupo[t];
      const resta = $('[data-accion="restar"]', fila);
      const suma = $('[data-accion="sumar"]', fila);
      resta.setAttribute('aria-disabled', String(t === 'adultos' ? !puedeRestarAdulto(precios, grupo) : grupo[t] <= 0));
      suma.setAttribute('aria-disabled', String(!puedeSumar(precios, grupo)));
    }
    let i = 0;
    for (const [t, clase] of [['adultos', 'lleno'], ['ninos', 'lleno nino'], ['menores', 'lleno menor']]) {
      for (let k = 0; k < grupo[t]; k++, i++) if (puntos[i]) puntos[i].className = clase;
    }
    for (; i < puntos.length; i++) puntos[i].className = '';
    mostrarTotal(formatearMoneda(totalCentavos(precios, grupo)), direccion);
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
    pintar(delta);
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
    actualizarMensaje();
  });
  franjas.forEach((r) => r.addEventListener('change', () => { avisar(avisoFranja, ''); actualizarMensaje(); }));

  /** Si falta algo, el foco va al campo con su mensaje; el botón nunca se deshabilita. */
  function validar() {
    if (!fechaValida()) {
      fecha.setAttribute('aria-invalid', 'true');
      avisar(avisoFecha, fecha.value ? c.avisos.fechaPasada : c.avisos.faltaFecha);
      fecha.focus();
      return false;
    }
    if (!franjaElegida()) {
      avisar(avisoFranja, c.avisos.faltaFranja);
      franjas[0].focus();
      return false;
    }
    return true;
  }
  enviar.addEventListener('click', (e) => { if (!validar()) { e.preventDefault(); e.stopImmediatePropagation(); } });
  pintar();
  return { grupo: () => grupo };
})();

// Un solo registro de clics de WhatsApp (principal, calculadora y pie), cada uno con su nombre.
document.addEventListener('click', (e) => {
  const enlace = e.target.closest('[data-wa]');
  if (enlace) emitirWhatsapp(enlace.dataset.wa, enlace.dataset.wa === 'calculadora' ? calc.grupo() : null);
});

// ───────────── Texto que respira, reloj y botón flotante ─────────────

if (!quieto) {
  const revela = new IntersectionObserver((entradas) => {
    for (const e of entradas) if (e.isIntersecting) { e.target.classList.add('visible'); revela.unobserve(e.target); }
  }, { threshold: 0.2 });
  $$('.revela').forEach((el) => revela.observe(el));

  // El reloj parpadea una vez por momento, nunca en bucle.
  const reloj = new IntersectionObserver((entradas) => {
    for (const e of entradas) if (e.isIntersecting) { e.target.classList.add('parpadea'); reloj.unobserve(e.target); }
  }, { threshold: 0.6 });
  $$('.hora-grande').forEach((el) => reloj.observe(el));
}

(() => {
  const flotante = $('.flotante');
  const resumen = $('#incluye');
  const armar = $('#arma-tu-dia');
  const estado = { resumenVisible: true, resumenPasado: false, armarVisible: false, armarPasado: false };
  const textosAbajo = new Map(); // textos que pasan por detrás del botón: mientras tanto se esconde
  const actualizar = () => {
    const ver = estado.resumenPasado && !estado.resumenVisible && !estado.armarVisible && !estado.armarPasado
      && ![...textosAbajo.values()].some(Boolean);
    flotante.classList.toggle('visible', ver);
  };
  new IntersectionObserver(([e]) => { estado.resumenVisible = e.isIntersecting; estado.resumenPasado = !e.isIntersecting && e.boundingClientRect.bottom < 0; actualizar(); }).observe(resumen);
  new IntersectionObserver(([e]) => { estado.armarVisible = e.isIntersecting; estado.armarPasado = !e.isIntersecting && e.boundingClientRect.bottom < 0; actualizar(); }).observe(armar);
  const franja = new IntersectionObserver((entradas) => {
    for (const e of entradas) textosAbajo.set(e.target, e.isIntersecting);
    actualizar();
  }, { rootMargin: `-${Math.max(0, innerHeight - 84)}px 0px 0px 0px` }); // solo la franja de 84 px donde vive el botón
  $$('.medio .texto').forEach((t) => franja.observe(t));
})();

// ───────────── Videos: máximo 2 decodificando, solo los visibles ─────────────

function iniciarVideos() {
  const activos = [];
  const marcos = $$('[data-video]');

  function etiquetar(marco, reproduciendo) {
    const b = $('.video-boton', marco);
    if (!b) return;
    b.textContent = reproduciendo ? b.dataset.pausar : b.dataset.reproducir;
    b.setAttribute('aria-label', `${b.textContent}. ${b.dataset.alt}`);
  }
  function pausar(marco) {
    const i = activos.indexOf(marco);
    if (i > -1) activos.splice(i, 1);
    $('video', marco).pause();
    etiquetar(marco, false);
  }
  function reproducir(marco) {
    const video = $('video', marco);
    const i = activos.indexOf(marco);
    if (i > -1) activos.splice(i, 1);
    activos.push(marco);
    while (activos.length > 2) pausar(activos[0]);
    video.play().then(() => etiquetar(marco, true)).catch(() => { activos.splice(activos.indexOf(marco), 1); });
  }

  for (const marco of marcos) {
    const video = $('video', marco);
    video.addEventListener('playing', () => marco.classList.add('reproduciendo'), { once: true });
    const boton = $('.video-boton', marco);
    if (boton && sinVideoAuto) {
      boton.hidden = false;
      etiquetar(marco, false);
      boton.addEventListener('click', () => (video.paused ? reproducir(marco) : pausar(marco)));
    }
  }

  const io = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (e.isIntersecting) { if (!sinVideoAuto) reproducir(e.target); } else if (activos.includes(e.target)) pausar(e.target);
    }
  }, { threshold: 0.35 });
  marcos.forEach((m) => io.observe(m));
}
// El video del hero empieza después de 'load' y con el navegador en reposo: el poster ya es lo primero
// que se ve, y arrancar el decodificador justo al cargar le quita fluidez al celular de gama media.
const cuandoReposa = () => setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(iniciarVideos, { timeout: 2000 }) : iniciarVideos()), 3000);
if (document.readyState === 'complete') cuandoReposa(); else addEventListener('load', cuandoReposa, { once: true });

// La tipografía 600 (solo el total) se pide cuando la calculadora se acerca: no pesa en la primera carga.
new IntersectionObserver(([e], io) => { if (e.isIntersecting) { document.documentElement.classList.add('ver-total'); io.disconnect(); } }, { rootMargin: '900px 0px' }).observe($('#arma-tu-dia'));

// ───────────── Recorrido: el día pasa al bajar ─────────────

const astro = $('.astro');
const SIMBOLO = { x: 61 / 104, y: 48.5 / 104 }; // el punto (la mirada) dentro del símbolo, en proporción al ancho

function recorridoAnimado() {
  const capas = Object.fromEntries(['manana', 'mediodia', 'tarde', 'noche'].map((n) => [n, $(`.c-${n}`)]));
  const secciones = $$('[data-cielo]').filter((s) => s.dataset.cielo !== 'noche');
  let cruces = [];
  let momentos = [];
  let m = {};
  let pendiente = false;
  let estaNoche = false;
  let estaLuna = false;
  let ultimaPosicion = '';
  let nombreMomento = '';

  // Todas las lecturas de layout van aquí (carga y resize), nunca dentro del cuadro.
  function medir() {
    const y = scrollY;
    const vh = innerHeight;
    const W = innerWidth;
    const caja = (el) => { const r = el.getBoundingClientRect(); return { arriba: r.top + y, alto: r.height, derecha: r.right }; };
    cruces = $$('[data-cruza]').map((el) => {
      const r = caja(el);
      return { capa: capas[el.dataset.cruza], inicio: r.arriba - vh * 0.6, largo: r.alto + vh * 0.2, valor: -1 };
    });
    momentos = secciones.map((s) => ({ arriba: caja(s).arriba, nombre: s.dataset.cielo }));
    const reloj = caja($('#m-2000 .respiro'));
    const escritorio = W >= 900;
    const ancho = astro.getBoundingClientRect().width || 56;
    m = {
      vh, W, ancho,
      finX: reloj.derecha - ancho * 0.7, // a la derecha del numeral, para no taparlo
      finY: Math.max(1, reloj.arriba + reloj.alto / 2 - vh / 2),
      // De día el punto viaja por el margen (a la derecha en móvil, a la izquierda en escritorio): así nunca pasa detrás del texto.
      xDia: escritorio ? W * 0.03 : W - 10,
      base: vh * (escritorio ? 0.14 : 0.3),
      arco: vh * (escritorio ? 0.07 : 0.18),
    };
  }

  function cuadro() {
    pendiente = false;
    const y = scrollY; // una lectura por cuadro; abajo solo se escribe
    let noche = 0;
    for (const c of cruces) {
      const t = acotar((y - c.inicio) / c.largo);
      const v = Math.round(t * 1000) / 1000;
      if (v !== c.valor) { c.valor = v; c.capa.style.opacity = v; }
      if (c.capa === capas.noche) noche = v;
    }

    // Tokens por momento: la noche llega a la mitad del crepúsculo, donde no hay texto.
    let nombre = 'amanecer';
    for (const s of momentos) if (s.arriba <= y + m.vh * 0.5) nombre = s.nombre; else break;
    if (noche >= 0.5) nombre = 'noche';
    if (nombre !== nombreMomento) { nombreMomento = nombre; document.body.dataset.momento = nombre; }
    if ((noche >= 0.5) !== estaNoche) { estaNoche = noche >= 0.5; astro.classList.toggle('es-noche', estaNoche); }
    if ((noche >= 0.8) !== estaLuna) { estaLuna = noche >= 0.8; astro.classList.toggle('es-luna', estaLuna); }

    // Astro: arco de día, llega al centro y en 20:00 sube con la página.
    let x; let alto;
    if (y >= m.finY) { x = m.finX; alto = m.vh / 2 - (y - m.finY); } else {
      const p = y / m.finY;
      const a = Math.min(1, p / 0.75);
      x = m.xDia;
      alto = m.base - Math.sin(Math.PI * a) * m.arco;
      if (p > 0.75) {
        const u = (p - 0.75) / 0.25;
        const e = u * u * (3 - 2 * u);
        x += (m.finX - x) * e;
        alto += (m.vh / 2 - alto) * e;
      }
    }
    const posicion = `translate3d(${(x - SIMBOLO.x * m.ancho).toFixed(1)}px,${(alto - SIMBOLO.y * m.ancho).toFixed(1)}px,0)`;
    if (posicion !== ultimaPosicion) { ultimaPosicion = posicion; astro.style.transform = posicion; }
  }

  const pedir = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(cuadro); } };
  let reajuste;
  const reajustar = () => { clearTimeout(reajuste); reajuste = setTimeout(() => { medir(); pedir(); }, 150); };

  medir();
  astro.classList.add('activo');
  cuadro();
  addEventListener('scroll', pedir, { passive: true });
  addEventListener('resize', reajustar);
  addEventListener('load', () => { medir(); pedir(); }, { once: true });
  document.fonts?.ready.then(() => { medir(); pedir(); });
}

// Con movimiento reducido: el cielo cambia por momento (fundido corto), sin ligarse al scroll.
function recorridoQuieto() {
  const orden = ['amanecer', 'manana', 'mediodia', 'tarde', 'noche'];
  const capas = $$('.cielo > i');
  const poner = (nombre) => {
    const n = orden.indexOf(nombre);
    capas.forEach((c, i) => c.classList.toggle('on', i > 0 && i <= n));
    document.body.dataset.momento = nombre;
  };
  const io = new IntersectionObserver((entradas) => {
    for (const e of entradas) if (e.isIntersecting) poner(e.target.dataset.cielo);
  }, { rootMargin: '-50% 0px -50% 0px' });
  $$('[data-cielo]').forEach((s) => io.observe(s));

  // El astro queda quieto, ya como símbolo completo, en el respiro de las 20:00.
  astro.classList.add('activo', 'quieto', 'es-noche', 'es-luna');
  const colocar = () => {
    const r = $('#m-2000 .respiro').getBoundingClientRect();
    const ancho = astro.getBoundingClientRect().width || 56;
    const x = r.right + scrollX - ancho * 0.7 - SIMBOLO.x * ancho;
    const y = r.top + scrollY + r.height / 2 - SIMBOLO.y * ancho;
    astro.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
  };
  colocar();
  addEventListener('resize', colocar);
  addEventListener('load', colocar, { once: true });
  document.fonts?.ready.then(colocar);
}

if (quieto) recorridoQuieto(); else recorridoAnimado();
