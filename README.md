# lunablanca-ec.github.io

Landing "Un día en LunaBlanca". Una página estática que se genera con un build pequeño en Node
a partir de **un solo archivo**: `contenido/sitio.json`. Publica GitHub Pages con Actions.

## Cambiar precios, fecha y textos

Todo está en `contenido/sitio.json` (se edita desde github.com con el lápiz).

- Precios y límites: `precios` (`adulto`, `nino`, `ninoEdad`, `gratisMenorDe`, `maxPersonas`, `minAdultos`).
- Fin del precio de apertura: `apertura.hasta` (`AAAA-MM-DD`). El sello se oculta solo al día siguiente,
  hora de Ecuador. Los precios no cambian solos: si cambian, se editan aquí.
- WhatsApp, franjas y los tres mensajes (principal, calculadora, pie): `reserva`.
- Redes y Maps: `redes`. Medición con GA4: `medicion.ga4Id` (vacío = no se carga nada de terceros).
- Si el JSON tiene un error, el build falla con un mensaje en español y la versión publicada no cambia.

## Dónde está cada cosa

- Textos finales (dirección): `contenido/sitio.json` → `textos`. Los precios, edades y el máximo van como
  marcadores (`{adulto}`, `{nino}`, `{ninoDesde}`, `{ninoHasta}`, `{gratisMenorDe}`, `{maxPersonas}`, `{sello}`)
  que el build llena desde `precios` y `apertura`; el título y la descripción están en `textos.meta`.
- Diseño: `src/estilos/` (`tokens.css`, `base.css`, `recorrido.css`, `calculadora.css`); el build los une
  en un solo CSS en línea. Colores y tipografías solo como tokens.
- Comportamiento: `src/js/app.mjs` (recorrido con un solo `requestAnimationFrame`, videos, calculadora,
  sello, UTM y `dataLayer`). Las reglas de negocio están en `src/js/logica.mjs`, que usan también las pruebas.
- Medios: `src/medios/` (los genera `npm run medios`, solo en local). Máximo 4 videos; hoy son 3 (hero,
  cascada y Luna). El tobogán y el puente van como cuadros fijos.

## Versión 2 "El día gira" (/v2/)

Página alternativa en `dist/v2/`, con el mismo contenido (`contenido/sitio.json`) y los mismos medios. La raíz no cambia.
Un arco fijo arriba lleva el sol de 8:00 a 20:00 con el scroll; el cielo cambia con la hora; cada momento es una escena fija
con fotos por capas; la calculadora mueve el sol a la franja elegida y deshabilita las franjas que ya pasaron si la fecha es hoy.
Lleva `noindex` hasta que Alexis la apruebe.

- Diseño y plantilla: `src/v2/plantilla-v2.mjs` (qué foto va en qué escena); estilos: `src/v2/estilos/v2.css`.
- Comportamiento: `src/v2/app-v2.mjs`; lógica pura del día (franjas, hora): `src/v2/dia.mjs`.
- Franjas: `reserva.franjasFin` (hora en que termina cada franja) y `reserva.franjasSol` (hora del sol al elegirla) en `sitio.json`.
- Con `prefers-reduced-motion`: sin sticky ni parallax, todo legible; el sol y el cielo cambian por escena.

## Comandos

```
npm ci            # instala dependencias
npm test          # pruebas + control de privacidad
npm run build     # genera dist/
npm run medios    # procesa fotos y videos (solo en local)
npm run privacidad
```

`CI_ESTRICTO=1 npm test` exige además que no queden textos provisionales `TODO-DIRECCION`.

## Simular una fecha

- Build: `FECHA_SIMULADA=2027-01-01 npm run build` (PowerShell: `$env:FECHA_SIMULADA='2027-01-01'; npm run build`).
- Navegador: `?hoy=2027-01-01` al final de la dirección (solo afecta al sello).

## Enlaces con UTM

- Bio: `https://lunablanca-ec.github.io/?utm_source=instagram&utm_medium=bio`
- Anuncio: `https://lunablanca-ec.github.io/?utm_source=meta&utm_medium=ads&utm_campaign=<pieza>`

## Publicación

Cada push a `main` y un rebuild diario (00:10 de Ecuador) ejecutan `.github/workflows/pages.yml`:
instala, prueba, construye y publica solo `dist/`.

## Privacidad

Este repo es público. No se suben crudos (MOV, HEIC, DNG), fotos con GPS o EXIF, ni documentos
internos. `npm run privacidad` lo revisa antes de cada commit.
