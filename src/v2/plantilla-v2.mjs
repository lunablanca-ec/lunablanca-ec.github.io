// Plantilla de la v2 "El día gira" (se publica en /v2/). Todo el contenido sale de sitio.json
// (los mismos textos, precios y reglas de la raíz); aquí solo está el diseño: qué foto va en qué escena.
import {
  aCentavos, formatearMoneda, totalCentavos, selloVigente, urlWhatsapp, construirMensaje, desgloseGrupo,
} from '../js/logica.mjs';
import { frases } from './dia.mjs';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rellenar = (texto, valores) => texto.replace(/\{(\w+)\}/g, (_, k) => (k in valores ? valores[k] : `{${k}}`));
const jsonSeguro = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

export function jsonLd(sitio) {
  const { negocio, redes, sitio: s, reserva, textos } = sitio;
  const [abre, cierra] = negocio.horario.split('-');
  const descripcion = rellenar(textos.meta.descripcion, { maxPersonas: sitio.precios.maxPersonas });
  return {
    '@context': 'https://schema.org',
    '@type': ['TouristAttraction', 'LocalBusiness'],
    name: `${negocio.nombre} · Día LunaBlanca`,
    description: descripcion,
    url: s.url,
    image: `${s.url}/${s.ogImagen}`,
    telephone: `+${reserva.whatsapp}`,
    // Sin dirección exacta ni coordenadas: es una urbanización privada.
    address: {
      '@type': 'PostalAddress',
      addressLocality: negocio.localidad,
      addressRegion: negocio.region,
      addressCountry: negocio.pais,
    },
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: abre,
      closes: cierra,
    }],
    sameAs: [redes.instagram, redes.tiktok, redes.maps],
    // Sin offers, review ni aggregateRating (plan §9).
  };
}


/** Diseño de cada escena: fondo, capas (2 o 3 fotos con profundidad) y a qué hora del arco pertenece. */
export const ESCENAS = [
  { id: 'm-0900', hora: 9, fondo: 'sendero', capas: ['vive-salto'], linea: 'lineaMedio2' },
  { id: 'm-1030', hora: 10.5, fondo: 'luna-borde', capas: ['cascada'] },
  { id: 'm-1200', hora: 12, fondo: 'piscina-reservada', capas: ['bbq'], nota: 'nota' },
  { id: 'm-1400', hora: 14, fondo: 'parque-cerca', capas: [{ id: 'sillas-piscina', rotulo: 2 }] },
  { id: 'm-1830', hora: 18.5, fondo: 'tarde', capas: ['puente'], extra: 'm-1700' },
  { id: 'm-2000', hora: 20, fondo: 'noche', capas: [], enmarcada: true },
];

// Apertura "La misma mirada": se decide antes del primer pintado y se muestra en cada carga.
// Sin movimiento reducido, sin ancla en la URL; se salta con un toque, una tecla o al desplazarse; dura 1,7 s como máximo.
const APERTURA_JS = `var d=document.documentElement;d.className+=" js";(function(){if(matchMedia("(prefers-reduced-motion:reduce)").matches||location.hash)return;var W=innerWidth,H=innerHeight,E=W>899,B=E?84:68,L=E?W*.5:W,A=E?H-B-24:H-B,X=E?W*.94-L:0,D=Math.max(170,Math.min(340,.56*Math.min(W,H)))*.77,S=d.style;S.setProperty("--ap-tx",W/2-X-L/2+"px");S.setProperty("--ap-ty",.46*H-B-A/2+"px");S.setProperty("--ap-sx",D/L);S.setProperty("--ap-sy",D/A);d.classList.add("ap","ap-t");var r=function(){d.classList.remove("ap","ap-fin")},f=function(){d.classList.remove("ap-t");d.classList.add("ap-fin");setTimeout(r,170)};setTimeout(r,1700);["pointerdown","keydown","wheel","touchstart"].forEach(function(e){addEventListener(e,f,{once:true,passive:true})})})()`;
// Geometría tomada de marca/logos/lunablanca-simbolo-fondo-oscuro.svg: círculo de la luna (r 40) menos el círculo del recorte (r 33), punto en (61, 48.5).
const APERTURA_HTML = '<div class="apertura" aria-hidden="true"><i class="ap-hueco"></i><svg class="ap-luna" viewBox="0 0 104 100" shape-rendering="geometricPrecision" focusable="false"><defs><mask id="ap-m" maskUnits="userSpaceOnUse" x="0" y="0" width="104" height="100"><rect width="104" height="100" fill="#fff"/><circle class="ap-corte" cx="60.506" cy="45.495" r="33" fill="#000"/></mask></defs><circle class="ap-fondo" cx="46.001" cy="49.996" r="40.6"/><circle class="ap-llena" cx="46.001" cy="49.996" r="40" mask="url(#ap-m)"/><circle class="ap-ojo" cx="61" cy="48.5" r="11.5"/></svg></div>';

const SIZES_FONDO = '(min-width: 900px) 50vw, 96vw'; // 96vw: a 412 px y 1,75x el ancho de 720 alcanza y no se baja el de 1080
const SIZES_CAPA = '(min-width: 900px) 20vw, 46vw';

export function renderizarV2({ sitio, medios, hoy, activos = {} }) {
  const { sitio: s, negocio, precios, apertura, reserva, redes, medicion, textos: t } = sitio;
  const v = t.v2;
  const c = t.calculadora;
  const sello = selloVigente(hoy, apertura);
  const items = medios?.items ?? {};
  const momentos = Object.fromEntries(t.momentos.map((m) => [m.id, m]));

  if (reserva.franjasFin?.length !== reserva.franjas.length || reserva.franjasSol?.length !== reserva.franjas.length) {
    throw new Error('reserva.franjasFin y reserva.franjasSol deben tener una hora por cada franja');
  }

  const base = {
    adulto: formatearMoneda(aCentavos(precios.adulto)),
    nino: formatearMoneda(aCentavos(precios.nino)),
    ninoDesde: precios.ninoEdad[0],
    ninoHasta: precios.ninoEdad[1],
    gratisMenorDe: precios.gratisMenorDe,
    maxPersonas: precios.maxPersonas,
    anio: hoy.slice(0, 4),
  };
  const regular = (valor) => (sello
    ? `<s class="regular" data-sello><span class="sr">${esc(apertura.regularAntes)} </span>${formatearMoneda(aCentavos(valor))}</s> `
    : '');
  const sinRegular = { regularAdulto: '', regularNino: '' };
  const plano = (texto) => esc(rellenar(texto, { ...base, sello: '', ...sinRegular }));
  const crudo = (texto) => rellenar(texto, { ...base, sello: '', ...sinRegular });
  const selloHtml = (texto) => (sello ? `<span class="sello" data-sello>${esc(texto)}</span>` : '');
  const html = (texto, extra = {}) => rellenar(esc(texto), {
    ...base, sello: selloHtml(apertura.selloTexto), regularAdulto: regular(precios.adultoRegular), regularNino: regular(precios.ninoRegular), ...extra,
  });
  const wa = (clave) => urlWhatsapp(reserva.whatsapp, reserva.mensajes[clave]);

  const desgloseNombres = Object.fromEntries(Object.entries(c.desglose).map(([k, par]) => [k, par.map(crudo)]));
  const config = {
    precios, medicion,
    apertura: { hasta: apertura.hasta, zonaHoraria: apertura.zonaHoraria },
    reserva: { whatsapp: reserva.whatsapp, franjas: reserva.franjas, notaApertura: reserva.notaApertura, mensajes: reserva.mensajes },
    calculadora: {
      inicial: c.inicial, vacio: c.vacio, desglose: desgloseNombres,
      avisos: { ...Object.fromEntries(Object.entries(c.avisos).map(([k, x]) => [k, crudo(x)])), hoyTarde: v.hoyTarde },
      notaFecha: c.notaFecha,
    },
    video: t.video,
  };

  // ---------- Medios ----------
  function imagen(id, { sizes, prioridad = false, alt, diferida = false } = {}) {
    const m = items[id];
    if (!m) throw new Error(`Falta el medio "${id}" en medios.json`);
    const fuente = m.poster ?? m;
    const srcset = (fmt) => m.anchos.map((a) => `medios/${fuente[fmt][a].archivo} ${a}w`).join(', ');
    const src = `medios/${(fuente.webp[720] ?? fuente.webp[m.anchos.at(-1)]).archivo}`;
    const tam = `width="${m.width}" height="${m.height}"`;
    // Las escenas lejanas no piden nada al abrir: el navegador las hidrata (data-srcset, data-src) cuando se acercan, para no robarle red al hero.
    if (diferida) return `<picture><source type="image/avif" data-srcset="${srcset('avif')}" sizes="${sizes}"><source type="image/webp" data-srcset="${srcset('webp')}" sizes="${sizes}"><img data-src="${src}" alt="${esc(alt ?? m.alt)}" ${tam} decoding="async"></picture>`;
    const atributos = prioridad ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
    return `<picture><source type="image/avif" srcset="${srcset('avif')}" sizes="${sizes}"><source type="image/webp" srcset="${srcset('webp')}" sizes="${sizes}"><img src="${src}" alt="${esc(alt ?? m.alt)}" ${tam} ${atributos}></picture>`;
  }

  /** Foto de fondo; si es video lleva poster (siempre) y un botón que solo se muestra con movimiento reducido o ahorro de datos. */
  function fondo(id, { prioridad = false, video = false, diferida = false } = {}) {
    const m = items[id];
    const cuerpo = imagen(id, { sizes: SIZES_FONDO, prioridad, diferida });
    if (!video || m.tipo !== 'video' || !m.video) return `<div class="fondo" data-medio="${id}">${cuerpo}</div>`;
    const vd = m.video;
    const poster = `medios/${m.poster.avif[prioridad ? 720 : 480].archivo}`;
    return `<div class="fondo" data-medio="${id}" data-video>${cuerpo}<video muted loop playsinline preload="none" ${diferida ? `data-poster="${poster}"` : `poster="${poster}"`} aria-hidden="true" tabindex="-1" disablepictureinpicture width="${vd.width}" height="${vd.height}">${vd.webm ? `<source src="medios/${vd.webm.archivo}" type="video/webm">` : ''}<source src="medios/${vd.mp4.archivo}" type="video/mp4"></video><button type="button" class="video-boton" hidden data-reproducir="${esc(t.video.reproducir)}" data-pausar="${esc(t.video.pausar)}" data-alt="${esc(m.alt)}">${esc(t.video.reproducir)}</button></div>`;
  }

  // ---------- Cielo (dos copias: la banda superior y el fondo de pantalla completa) ----------
  const cielo = (clase) => `<div class="cielo ${clase}" aria-hidden="true"><i class="c-amanecer"></i><i class="c-manana"></i><i class="c-mediodia"></i><i class="c-tarde"></i><i class="c-noche"></i><b class="estrellas"></b></div>`;

  // ---------- Escenas ----------
  function lineas(textos) {
    return textos.map((x, i) => `<p class="l${x.nota ? ' nota' : ''}" style="--i:${i}">${html(x.texto)}</p>`).join('');
  }

  function escena(def, i) {
    const indice = i + 2;
    const m = momentos[def.id];
    const rotulo = v.escenas[def.id].hora;
    const cuerpo = frases(m.texto).map((texto) => ({ texto }));
    if (def.linea && m[def.linea]) cuerpo.push({ texto: m[def.linea] });
    if (def.nota && m[def.nota]) cuerpo.push({ texto: m[def.nota], nota: true });
    if (def.extra) cuerpo.push({ texto: momentos[def.extra].texto, nota: true });
    const capas = def.capas.slice(0, 1).map((x) => {
      const { id, rotulo } = typeof x === 'string' ? { id: x } : x;
      const pie = rotulo === undefined ? '' : `<figcaption>${esc(m.rotulos[rotulo])}</figcaption>`;
      return `<figure class="capa c1" style="--k:0">${imagen(id, { sizes: SIZES_CAPA, diferida: true })}${pie}</figure>`;
    }).join('');
    const etiqueta = `<p class="etiqueta l" style="--i:0"><span class="hora-escena">${esc(rotulo)}</span>${m.etiqueta ? ` · ${esc(m.etiqueta)}` : ''}</p>`;
    const fondoMedio = def.enmarcada ? fondo(def.fondo, { diferida: true }) : fondo(def.fondo, { video: true, diferida: true });
    return `
    <i class="ancla" data-ancla></i>
    <section class="escena${def.enmarcada ? ' enmarcada' : ''}" id="${m.id}" data-escena="${indice}" data-hora="${def.hora}" aria-labelledby="t-${m.id}">
      <div class="borde" aria-hidden="true"></div>
      <div class="vidrio">${fondoMedio}<div class="velo"></div></div>
      <div class="capas">${capas}</div>
      <div class="texto">${etiqueta}<h2 id="t-${m.id}" class="l" style="--i:1"><span class="sr">${esc(rotulo)}. </span>${html(m.titulo)}</h2>${
  cuerpo.map((x, i) => `<p class="l${x.nota ? ' nota' : ''}" style="--i:${i + 2}">${html(x.texto)}</p>`).join('')}</div>
    </section>`;
  }

  // ---------- Calculadora ----------
  const contador = (tipo) => `
        <div class="contador" data-tipo="${tipo}">
          <div class="contador-texto"><span class="contador-nombre" id="etq-${tipo}">${html(c[tipo].nombre)}</span><span class="contador-nota">${html(c[tipo].nota)}</span></div>
          <div class="contador-mando" role="group" aria-labelledby="etq-${tipo}">
            <button type="button" data-accion="restar" aria-label="${plano(c[tipo].quitar)}">−</button>
            <output id="cant-${tipo}" aria-labelledby="etq-${tipo}">${c.inicial[tipo]}</output>
            <button type="button" data-accion="sumar" aria-label="${plano(c[tipo].sumar)}">+</button>
          </div>
        </div>`;
  const franjas = reserva.franjas.map((f, i) => `
          <label class="franja"><input type="radio" name="franja" value="${esc(f)}" data-fin="${reserva.franjasFin[i]}" data-sol="${reserva.franjasSol[i]}"><span>${esc(f)}</span><em class="pasada" hidden>${esc(v.franjaPasada)}</em></label>`).join('');
  const totalInicial = formatearMoneda(totalCentavos(precios, c.inicial));
  const mensajeInicial = construirMensaje({
    base: reserva.mensajes.calculadora, fechaISO: '', franja: '', ...c.inicial, precios,
    sello, notaApertura: reserva.notaApertura, faltan: c.vacio,
  });
  const enlaceCalculadora = (parrafo) => html(parrafo).replace(esc(c.titulo), `<a href="#arma-tu-dia">${esc(c.titulo)}</a>`);

  // ---------- Documento ----------
  const hero = items['piscina-natural'];
  const preCarga = `
  <link rel="preload" as="image" type="image/avif" fetchpriority="high" imagesizes="${SIZES_FONDO}" imagesrcset="${hero.anchos.map((a) => `medios/${hero.poster.avif[a].archivo} ${a}w`).join(', ')}">`;
  const descripcion = plano(t.meta.descripcion);
  const ogTags = activos.og ? `
  <meta property="og:image" content="${esc(`${s.url}/${s.ogImagen}`)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">` : '';
  const cierre = momentos['m-2000'];
  const logoHero = 'marca/logo-horizontal-fondo-oscuro.svg';
  const simbolo = '<svg class="luna-logo" viewBox="0 0 104 100" aria-hidden="true" focusable="false"><path d="M78.71 73.02 A40 40 0 1 1 59.93 12.5 A33 33 0 1 0 78.71 73.02 Z"/></svg>';

  return `<!doctype html>
<html lang="es-EC">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(plano(t.meta.titulo))}</title>
  <meta name="description" content="${descripcion}">
  <meta name="theme-color" content="#F4EDE2">
  <link rel="canonical" href="${esc(s.url)}/">
  ${activos.favicon ? `<link rel="icon" href="${esc(activos.favicon)}">` : ''}
  <meta property="og:type" content="website">
  <meta property="og:locale" content="es_EC">
  <meta property="og:site_name" content="${esc(negocio.nombre)}">
  <meta property="og:title" content="${plano(t.meta.ogTitulo)}">
  <meta property="og:description" content="${descripcion}">
  <meta property="og:url" content="${esc(s.url)}/">${ogTags}
  <script type="application/ld+json">${jsonSeguro(jsonLd(sitio))}</script>
  <link rel="preload" href="fuentes/cormorant-garamond-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="fuentes/jost-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>${preCarga}
  <script>${APERTURA_JS}</script>
  ${activos.css ? `<style>${activos.css}</style>` : ''}
</head>
<body>
  ${APERTURA_HTML}
  <a class="saltar" href="#arma-tu-dia">${esc(t.saltar)}</a>
  ${cielo('cielo-pleno')}
  <header class="banda">
    ${cielo('cielo-banda')}
    <div class="arco" role="img" aria-label="${esc(v.arco.etiqueta)}">
      <div class="pista">
        <svg class="arco-linea" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 36 Q50 -36 100 36" vector-effect="non-scaling-stroke"/></svg>
        <i class="sol"><b class="sol-punto"></b><span class="sol-hora" data-hora-sol>8:00</span></i>
        <a class="luna-enlace" href="#inicio" aria-label="${esc(v.arco.logo)}">${simbolo}</a>
      </div>
    </div>
  </header>
  <div class="huella" aria-hidden="true" title="${esc(v.progreso)}"><i></i></div>
  <main>
    <div class="escenas" data-escenas>
      <i class="ancla" data-ancla></i>
      <section class="escena portada" id="inicio" data-escena="0" data-hora="8" aria-labelledby="titulo-hero">
        <div class="vidrio">${fondo('piscina-natural', { prioridad: true, video: true })}<div class="velo"></div><img class="logo-hero" src="${logoHero}" alt="${esc(negocio.nombre)}" width="820" height="220"></div>
        <div class="texto">
          <p class="etiqueta l" style="--i:0">${esc(t.hero.etiqueta)}</p>
          <h1 id="titulo-hero" class="l" style="--i:1">${html(t.hero.titulo)}</h1>
          <p class="l" style="--i:2">${html(t.hero.linea)}</p>
          <p class="pista-bajar l" style="--i:3" aria-hidden="true"><span class="pista-linea"></span><span>${esc(t.hero.pista)}</span></p>
        </div>
      </section>

      <i class="ancla" data-ancla></i>
      <section class="escena incluye" id="incluye" data-escena="1" data-hora="8.4" aria-labelledby="titulo-incluye">
        <div class="incluye-caja"><div class="borde" aria-hidden="true"></div>
          <div class="incluye-lista">
            <h2 id="titulo-incluye">${html(t.resumen.titulo)}</h2>
            <ul class="lista">${t.incluye.map((x) => `<li>${html(x)}</li>`).join('')}</ul>
            <p class="no-incluye">${html(t.noIncluye)}</p>
          </div>
          <div class="precio-bloque">
            <p class="grupo">${html(t.resumen.grupo)}</p>
            <p class="precio" data-precio>${html(t.resumen.precio, { adulto: `<span class="monto">${base.adulto}</span>` })}</p>
            <p class="precio-ninos" data-precio>${html(t.resumen.precioNinos)}</p>
            ${sello ? `<p class="sello-fila" data-sello><span class="sello">${esc(apertura.selloTexto)}</span></p>` : ''}
            <a class="boton" href="${esc(wa('principal'))}" data-wa="principal" target="_blank" rel="noopener">${esc(t.resumen.boton)}</a>
            <a class="enlace" href="#arma-tu-dia">${esc(t.resumen.enlace)}<span aria-hidden="true"> →</span></a>
          </div>
        </div>
      </section>
${ESCENAS.map(escena).join('')}
    </div>

    <section id="arma-tu-dia" class="calculadora tema-noche" aria-labelledby="titulo-calculadora">
      <h2 id="titulo-calculadora">${esc(c.titulo)}</h2>
      <p class="intro">${html(c.intro)}</p>
      <form id="calculadora" novalidate>
        <div class="contadores">${contador('adultos')}${contador('ninos')}${contador('menores')}
          <div class="grupo-puntos" aria-hidden="true">${'<i></i>'.repeat(precios.maxPersonas)}</div>
          <p class="aviso" id="aviso" aria-live="polite"></p>
        </div>
        <div class="campo">
          <label for="fecha">${esc(c.fecha)}</label>
          <input type="date" id="fecha" name="fecha" min="${esc(hoy)}" aria-describedby="nota-fecha aviso-fecha">
          <p class="aviso" id="aviso-fecha" aria-live="polite"></p>
          <p class="nota-fecha" id="nota-fecha" aria-live="polite"></p>
        </div>
        <fieldset class="franjas" aria-describedby="aviso-franja">
          <legend>${esc(c.franja)}</legend>${franjas}
          <p class="nota">${esc(c.franjaNota)}</p>
          <p class="aviso" id="aviso-franja" aria-live="polite"></p>
        </fieldset>
        <div class="total-bloque">
          <p class="etiqueta" id="etq-total">${esc(c.totalEtiqueta)}</p>
          <output id="total" class="total" aria-labelledby="etq-total"><span>${esc(totalInicial)}</span></output><span class="sr" id="total-sr" aria-live="polite"></span>
          <p class="desglose" id="desglose">${esc(desgloseGrupo(c.inicial, precios, desgloseNombres))}</p>
          ${sello ? `<p class="sello-fila" data-sello><span class="sello">${esc(apertura.selloCorto)}</span></p>` : ''}
        </div>
        <div class="vista">
          <h3 class="etiqueta">${esc(c.vistaPrevia)}</h3>
          <p id="vista-previa" class="vista-texto">${esc(mensajeInicial)}</p>
        </div>
        <a id="enviar" class="boton" href="${esc(wa('calculadora'))}" data-wa="calculadora" target="_blank" rel="noopener">${esc(c.boton)}</a>
        <p class="bajo-boton">${esc(c.bajoBoton)}</p>
      </form>
    </section>

    <section id="antes-de-venir" class="antes tema-noche" aria-labelledby="titulo-antes">
      <h2 id="titulo-antes">${esc(t.preguntasTitulo)}</h2>${t.preguntas.map((q) => `
      <details><summary>${esc(q.p)}</summary><div class="respuesta">${q.r.map((p) => `<p>${enlaceCalculadora(p)}</p>`).join('')}</div></details>`).join('')}
    </section>

    <section class="cierre tema-noche" id="cierre" aria-labelledby="titulo-cierre">
      <div class="luna-llena" aria-hidden="true"><i></i></div>
      <h2 id="titulo-cierre">${html(cierre.cierre)}</h2>
      <a class="boton" href="${esc(wa('pie'))}" data-wa="pie" target="_blank" rel="noopener">${esc(v.cierre.boton)}</a>
      <p class="cierre-datos">${esc(t.pie.lugar)}<br>${esc(t.pie.horario)}</p>
      <ul class="enlaces">
        <li><a href="${esc(redes.instagram)}" rel="noopener">${esc(t.pie.enlaces.instagram)}</a></li>
        <li><a href="${esc(redes.tiktok)}" rel="noopener">${esc(t.pie.enlaces.tiktok)}</a></li>
        <li><a href="${esc(redes.maps)}" rel="noopener">${esc(t.pie.enlaces.maps)}</a></li>
        <li><a href="${esc(wa('pie'))}" data-wa="pie" target="_blank" rel="noopener">${esc(t.pie.enlaces.whatsapp)}</a></li>
      </ul>
      <p class="derechos"><small>${plano(t.pie.derechos)} · ${esc(t.pie.lema)}</small></p>
    </section>
  </main>
  <a class="flotante" href="#arma-tu-dia">${esc(t.flotante)}</a>
  <script type="application/json" id="config-sitio">${jsonSeguro(config)}</script>
  ${activos.jsSrc ? `<script type="module" src="${esc(activos.jsSrc)}"></script>` : ''}
</body>
</html>
`;
}

export function renderizar404({ sitio, activos = {} }) {
  const { negocio, sitio: s, textos: t } = sitio;
  return `<!doctype html>
<html lang="es-EC">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${esc(t.noEncontrada.titulo)} · ${esc(negocio.nombre)}</title>
  ${activos.css ? `<style>${activos.css}</style>` : ''}
</head>
<body data-momento="amanecer" class="pagina-simple">
  <main>
    <h1>${esc(t.noEncontrada.titulo)}</h1>
    <p><a class="boton" href="${esc(s.url)}/">${esc(t.noEncontrada.enlace)}</a></p>
  </main>
</body>
</html>
`;
}

/** /v2/ ya no existe como página: lleva a la raíz y conserva los UTM y el ancla. */
export function renderizarRedireccion({ sitio }) {
  const { negocio, sitio: s } = sitio;
  const destino = `${s.url}/`;
  return `<!doctype html>
<html lang="es-EC">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${esc(negocio.nombre)}</title>
  <link rel="canonical" href="${esc(destino)}">
  <script>location.replace("../"+location.search+location.hash)</script>
  <noscript><meta http-equiv="refresh" content="0;url=../"></noscript>
</head>
<body>
  <p><a href="../">${esc(negocio.nombre)}</a></p>
</body>
</html>
`;
}
