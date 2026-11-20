// Plantilla: sitio.json + medios.json -> HTML. Todo el contenido sale de sitio.json;
// aquí no se escribe ningún precio, fecha ni texto largo (el diseño está en src/estilos).
import {
  aCentavos, formatearMoneda, totalCentavos, selloVigente, urlWhatsapp, construirMensaje, desgloseGrupo,
} from './js/logica.mjs';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Reemplaza {clave} por su valor. El validador ya garantiza que no hay marcadores desconocidos. */
const rellenar = (texto, valores) =>
  texto.replace(/\{(\w+)\}/g, (_, k) => (k in valores ? valores[k] : `{${k}}`));

/** JSON dentro de <script>: "<" escapado para que nada cierre la etiqueta. */
const jsonSeguro = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

/** Cómo se acomoda cada momento. Es diseño, no contenido: por eso vive aquí y no en sitio.json. */
const DISENO = {
  'm-0900': 'sendero', 'm-1200': 'piscina', 'm-1400': 'tobogan', 'm-1700': 'rejilla', 'm-2000': 'noche',
};
// Dónde cambia el cielo (dirección §3.1): el cruce ocurre mientras el medio cubre la pantalla.
const CRUCE = { 'm-1200': 'mediodia', 'm-1530': 'tarde' };

// 96vw (no 100): en un celular de 412 px a 1,75x el ancho de 720 alcanza y no se descarga el de 1080.
const SIZES_SANGRE = '(min-width: 900px) 34vw, 96vw';

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

/**
 * @param {object} p
 * @param {object} p.sitio  contenido/sitio.json
 * @param {object|null} p.medios  src/medios/medios.json o null
 * @param {string} p.hoy  fecha ISO que rige para el sello
 * @param {{css?:string, jsSrc?:string, og?:boolean, favicon?:string}} p.activos
 */
export function renderizar({ sitio, medios, hoy, activos = {} }) {
  const { sitio: s, negocio, precios, apertura, reserva, redes, medicion, textos: t } = sitio;
  const c = t.calculadora;
  const sello = selloVigente(hoy, apertura);
  const items = medios?.items ?? {};

  const base = {
    adulto: formatearMoneda(aCentavos(precios.adulto)),
    nino: formatearMoneda(aCentavos(precios.nino)),
    ninoDesde: precios.ninoEdad[0],
    ninoHasta: precios.ninoEdad[1],
    gratisMenorDe: precios.gratisMenorDe,
    maxPersonas: precios.maxPersonas,
    anio: hoy.slice(0, 4),
  };
  // Texto plano (atributos, JSON) y texto con HTML (el sello es un <span data-sello>).
  const plano = (texto) => esc(rellenar(texto, { ...base, sello: '' }));
  const crudo = (texto) => rellenar(texto, { ...base, sello: '' });
  const selloHtml = (texto) => (sello ? `<span class="sello" data-sello>${esc(texto)}</span>` : '');
  const html = (texto, extra = {}) =>
    rellenar(esc(texto), { ...base, sello: selloHtml(apertura.selloTexto), ...extra });

  const wa = (clave) => urlWhatsapp(reserva.whatsapp, reserva.mensajes[clave]);
  const inicial = c.inicial;
  const desgloseNombres = Object.fromEntries(
    Object.entries(c.desglose).map(([k, par]) => [k, par.map(crudo)]),
  );

  // Config mínima para el navegador (los textos largos ya están en el HTML).
  const config = {
    precios, medicion,
    apertura: { hasta: apertura.hasta, zonaHoraria: apertura.zonaHoraria }, // sin el texto: oculto no debe quedar en el HTML
    reserva: { whatsapp: reserva.whatsapp, franjas: reserva.franjas, notaApertura: reserva.notaApertura, mensajes: reserva.mensajes },
    calculadora: {
      inicial,
      vacio: c.vacio,
      desglose: desgloseNombres,
      avisos: Object.fromEntries(Object.entries(c.avisos).map(([k, v]) => [k, crudo(v)])),
      notaFecha: c.notaFecha,
    },
    video: t.video,
  };

  // ---------- Medios ----------

  /** <picture> AVIF + WebP con srcset por ancho; los videos usan su poster. */
  function imagen(id, { sizes, prioridad = false } = {}) {
    const m = items[id];
    if (!m) return '';
    const fuente = m.poster ?? m;
    const srcset = (fmt) => m.anchos.map((a) => `medios/${fuente[fmt][a].archivo} ${a}w`).join(', ');
    const atributos = prioridad ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
    return `<picture><source type="image/avif" srcset="${srcset('avif')}" sizes="${sizes}"><source type="image/webp" srcset="${srcset('webp')}" sizes="${sizes}"><img src="medios/${fuente.webp[720].archivo}" alt="${esc(m.alt)}" width="${m.width}" height="${m.height}" ${atributos}></picture>`;
  }

  /** Marco con foto, o con poster + video (decorativo) y botón que solo se muestra con reduced-motion o Save-Data. */
  function marco(id, { clase = '', sizes = SIZES_SANGRE, prioridad = false, fijo = false } = {}) {
    const m = items[id];
    if (!m) return '';
    const cuerpo = imagen(id, { sizes, prioridad });
    if (fijo || m.tipo !== 'video' || !m.video) return `<div class="marco ${clase}" data-medio="${id}">${cuerpo}</div>`;
    const v = m.video;
    // MP4 primero: pesa menos y lo entienden todos; preload="none": nada baja hasta que el JS lo pide.
    return `<div class="marco ${clase}" data-medio="${id}" data-video>${cuerpo}<video muted loop playsinline preload="none" aria-hidden="true" tabindex="-1" disablepictureinpicture width="${v.width}" height="${v.height}"><source src="medios/${v.mp4.archivo}" type="video/mp4"><source src="medios/${v.webm.archivo}" type="video/webm"></video><button type="button" class="video-boton" hidden data-reproducir="${esc(t.video.reproducir)}" data-pausar="${esc(t.video.pausar)}" data-alt="${esc(m.alt)}">${esc(t.video.reproducir)}</button></div>`;
  }

  // ---------- Piezas de un momento ----------

  const reloj = (hora) => { const [h, m] = hora.split(':'); return `${h}<span class="dos-puntos">:</span>${m}`; };
  const respiro = (hora) => `<div class="respiro" aria-hidden="true"><span class="hora-grande">${reloj(hora)}</span></div>`;

  const bloqueTexto = (m, { sobre = false } = {}) => `<div class="texto${sobre ? ' sobre-medio' : ''} revela">${
    m.etiqueta ? `<p class="etiqueta">${esc(m.etiqueta)}</p>` : ''}<h2 id="t-${m.id}"><span class="sr">${esc(m.hora)}. </span>${html(m.titulo)}</h2><p>${html(m.texto)}</p>${
    m.nota ? `<p class="nota">${html(m.nota)}</p>` : ''}${
    m.cierre ? `<p class="cierre">${html(m.cierre)}</p>` : ''}${
    m.lema ? `<p class="etiqueta lema">${esc(m.lema)}</p>` : ''}</div>`;

  function momento(m) {
    const diseno = DISENO[m.id] ?? 'sangre';
    const [uno, dos, tres, cuatro] = m.medios;
    const cruce = CRUCE[m.id] ? ` data-cruza="${CRUCE[m.id]}"` : '';
    const seccion = (cuerpo) => `
    <section class="momento m-${diseno}" id="${m.id}" data-cielo="${esc(m.cielo)}"${cruce} aria-labelledby="t-${m.id}">${cuerpo}
    </section>`;

    if (diseno === 'sendero') {
      // Sendero en un marco 4:5 sobre el cielo; después la cascada a sangre con una sola línea.
      return seccion(`
      <figure class="medio medio--cielo">
        ${respiro(m.hora)}
        <div class="lienzo"><div class="marcos">${marco(uno, { clase: 'r-4-5', sizes: '(min-width: 900px) 34vw, 72vw' })}</div>${bloqueTexto(m)}</div>
      </figure>
      <figure class="medio medio--sangre" data-cruza="manana">
        <div class="lienzo"><div class="marcos">${marco(dos)}</div>
          <div class="texto sobre-medio revela"><p class="linea">${html(m.lineaMedio2)}</p></div></div>
      </figure>`);
    }
    if (diseno === 'piscina') {
      return seccion(`
      <figure class="medio medio--cielo">
        ${respiro(m.hora)}
        <div class="lienzo">${bloqueTexto(m)}<div class="marcos">${marco(uno, { clase: 'r-3-2', sizes: '(min-width: 900px) 40vw, 100vw' })}${marco(dos, { clase: 'r-4-5', sizes: '(min-width: 900px) 24vw, 62vw' })}</div></div>
      </figure>`);
    }
    if (diseno === 'tobogan') {
      // Decisión de dirección: cuadro fijo y pequeño, sin video (menos balneario).
      return seccion(`
      <figure class="medio medio--cielo">
        ${respiro(m.hora)}
        <div class="lienzo"><div class="marcos">${marco(uno, { clase: 'r-3-2 chico', sizes: '(min-width: 900px) 40vw, 66vw', fijo: true })}</div>${bloqueTexto(m)}</div>
      </figure>`);
    }
    if (diseno === 'rejilla') {
      const celdas = [uno, dos, tres, cuatro].map((id, i) => `<figure class="celda">${marco(id, { clase: 'r-celda', sizes: '(min-width: 900px) 16vw, 44vw' })}<figcaption>${esc(m.rotulos[i])}</figcaption></figure>`).join('');
      return seccion(`
      <figure class="medio medio--cielo">
        ${respiro(m.hora)}
        <div class="lienzo">${bloqueTexto(m)}<div class="marcos"><div class="rejilla">${celdas}</div></div></div>
      </figure>`);
    }
    if (diseno === 'noche') {
      return seccion(`
      <figure class="medio medio--cielo">
        ${respiro(m.hora)}
        <div class="lienzo"><div class="marcos">${marco(uno, { clase: 'r-4-5', sizes: '(min-width: 900px) 34vw, 78vw' })}</div>${bloqueTexto(m)}</div>
      </figure>`);
    }
    // A sangre: el texto va sobre el medio, con el velo bajo él.
    return seccion(`
      <figure class="medio medio--sangre">
        ${respiro(m.hora)}
        <div class="lienzo"><div class="marcos">${marco(uno)}</div>${bloqueTexto(m, { sobre: true })}</div>
      </figure>`);
  }

  // Pausa de cielo antes de la noche: sin texto, solo el cielo y el astro.
  const crepusculo = `
    <div class="crepusculo" id="crepusculo" data-cielo="noche" data-cruza="noche" aria-hidden="true"></div>`;

  // ---------- Calculadora ----------

  const contador = (tipo) => `
        <div class="contador" data-tipo="${tipo}">
          <div class="contador-texto"><span class="contador-nombre" id="etq-${tipo}">${html(c[tipo].nombre)}</span><span class="contador-nota">${html(c[tipo].nota)}</span></div>
          <div class="contador-mando" role="group" aria-labelledby="etq-${tipo}">
            <button type="button" data-accion="restar" aria-label="${plano(c[tipo].quitar)}">−</button>
            <output id="cant-${tipo}" aria-labelledby="etq-${tipo}">${inicial[tipo]}</output>
            <button type="button" data-accion="sumar" aria-label="${plano(c[tipo].sumar)}">+</button>
          </div>
        </div>`;

  const franjas = reserva.franjas.map((f) => `
          <label class="franja"><input type="radio" name="franja" value="${esc(f)}"><span>${esc(f)}</span></label>`).join('');

  const totalInicial = formatearMoneda(totalCentavos(precios, inicial));
  const mensajeInicial = construirMensaje({
    base: reserva.mensajes.calculadora, fechaISO: '', franja: '', ...inicial, precios,
    sello, notaApertura: reserva.notaApertura, faltan: c.vacio,
  });

  // ---------- Documento ----------

  const poster = items['piscina-natural'];
  const preCarga = poster ? `
  <link rel="preload" as="image" type="image/avif" fetchpriority="high" imagesizes="${SIZES_SANGRE}" imagesrcset="${poster.poster.avif ? poster.anchos.map((a) => `medios/${poster.poster.avif[a].archivo} ${a}w`).join(', ') : ''}">` : '';

  const ogTags = activos.og ? `
  <meta property="og:image" content="${esc(`${s.url}/${s.ogImagen}`)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">` : '';

  const descripcion = plano(t.meta.descripcion);
  const enlaceCalculadora = (parrafo) => html(parrafo).replace(
    esc(c.titulo), `<a href="#arma-tu-dia">${esc(c.titulo)}</a>`,
  );

  const logo = (variante) => `marca/logo-horizontal-fondo-${variante}.svg`;

  return `<!doctype html>
<html lang="es-EC">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(plano(t.meta.titulo))}</title>
  <meta name="description" content="${descripcion}">
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
  <script>document.documentElement.className+=" js"</script>
  ${activos.css ? `<style>${activos.css}</style>` : ''}
</head>
<body data-momento="amanecer">
  <a class="saltar" href="#arma-tu-dia">${esc(t.saltar)}</a>
  <div class="cielo" aria-hidden="true"><i class="c-amanecer"></i><i class="c-manana"></i><i class="c-mediodia"></i><i class="c-tarde"></i><i class="c-noche"></i></div>
  <svg class="astro" viewBox="0 0 104 100" aria-hidden="true" focusable="false"><path class="creciente" d="M78.7 73 A40 40 0 1 1 59.9 12.5 A33 33 0 1 0 78.7 73 Z"/><circle class="punto-hondo" cx="61" cy="48.5" r="11.5"/><circle class="punto-ambar" cx="61" cy="48.5" r="11.5"/></svg>
  <main>
    <div class="portada">
      <header class="cabecera">
        <a class="logo" href="#inicio"><picture><source media="(min-width: 900px)" srcset="${logo('claro')}"><img src="${logo('oscuro')}" alt="${esc(negocio.nombre)}" width="820" height="220"></picture></a>
      </header>
      <div class="portada-medio">${marco('piscina-natural', { prioridad: true })}</div>
      <section id="inicio" class="hero" data-cielo="amanecer" aria-labelledby="titulo-hero">
        <div class="texto sobre-medio entra">
          <p class="etiqueta">${esc(t.hero.etiqueta)}</p>
          <h1 id="titulo-hero">${html(t.hero.titulo)}</h1>
          <p>${html(t.hero.linea)}</p>
          <p class="pista" aria-hidden="true"><span class="pista-linea"></span><span class="pista-texto">${esc(t.hero.pista)}</span></p>
        </div>
      </section>
      <section id="incluye" class="incluye" data-cielo="amanecer" aria-labelledby="titulo-incluye">
        <h2 id="titulo-incluye">${html(t.resumen.titulo)}</h2>
        <ul class="lista">${t.incluye.map((x) => `<li>${html(x)}</li>`).join('')}</ul>
        <p class="no-incluye">${html(t.noIncluye)}</p>
        <p class="grupo">${html(t.resumen.grupo)}</p>
        <div class="precio-bloque">
          <p class="precio" data-precio>${html(t.resumen.precio, { adulto: `<span class="monto">${base.adulto}</span>` })}</p>
          <p class="precio-ninos" data-precio>${html(t.resumen.precioNinos)}</p>
          ${sello ? `<p class="sello-fila" data-sello><span class="sello">${esc(apertura.selloTexto)}</span></p>` : ''}
          <a class="boton" href="${esc(wa('principal'))}" data-wa="principal" target="_blank" rel="noopener">${esc(t.resumen.boton)}</a>
          <a class="enlace" href="#arma-tu-dia">${esc(t.resumen.enlace)}<span aria-hidden="true"> →</span></a>
        </div>
      </section>
    </div>
${t.momentos.map((m) => (DISENO[m.id] === 'noche' ? crepusculo : '') + momento(m)).join('')}

    <section id="arma-tu-dia" class="calculadora" data-cielo="noche" aria-labelledby="titulo-calculadora">
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
          <output id="total" class="total" aria-live="polite" aria-atomic="true" aria-labelledby="etq-total"><span>${esc(totalInicial)}</span></output>
          <p class="desglose" id="desglose">${esc(desgloseGrupo(inicial, precios, desgloseNombres))}</p>
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

    <section id="antes-de-venir" class="antes" data-cielo="noche" aria-labelledby="titulo-antes">
      <h2 id="titulo-antes">${esc(t.preguntasTitulo)}</h2>${t.preguntas.map((q) => `
      <details><summary>${esc(q.p)}</summary><div class="respuesta">${q.r.map((p) => `<p>${enlaceCalculadora(p)}</p>`).join('')}</div></details>`).join('')}
    </section>
  </main>
  <footer class="pie" data-cielo="noche">
    <img class="pie-logo" src="${logo('oscuro')}" alt="${esc(negocio.nombre)}" width="820" height="220" loading="lazy" decoding="async">
    <p class="etiqueta lema">${esc(t.pie.lema)}</p>
    <p>${esc(t.pie.lugar)}</p>
    <p>${esc(t.pie.horario)}</p>
    <a class="boton" href="${esc(wa('pie'))}" data-wa="pie" target="_blank" rel="noopener">${esc(t.pie.boton)}</a>
    <ul class="enlaces">
      <li><a href="${esc(redes.instagram)}" rel="noopener">${esc(t.pie.enlaces.instagram)}</a></li>
      <li><a href="${esc(redes.tiktok)}" rel="noopener">${esc(t.pie.enlaces.tiktok)}</a></li>
      <li><a href="${esc(redes.maps)}" rel="noopener">${esc(t.pie.enlaces.maps)}</a></li>
      <li><a href="${esc(wa('pie'))}" data-wa="pie" target="_blank" rel="noopener">${esc(t.pie.enlaces.whatsapp)}</a></li>
    </ul>
    <p class="derechos"><img src="marca/sello-huella-crema.svg" alt="" width="40" height="40" loading="lazy"> <small>${plano(t.pie.derechos)}</small></p>
  </footer>
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
