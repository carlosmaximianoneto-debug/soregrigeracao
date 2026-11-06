// Public business details supplied by the owner through the Mercado Livre profile.
export const publisher = Object.freeze({
  name: 'CMN DIGITAL',
  taxID: '69.228.611/0001-98',
  email: 'cmn.digital.ltda@gmail.com',
});

export function publisherSchema(base) {
  return { '@type': 'Organization', '@id': `${base}/#organization`,
    ...publisher, url: `${base}/#sobre` };
}

// Fontes servidas pelo próprio site (Google Fonts, licença OFL), só o subconjunto latino
// e só os pesos usados no CSS. Ficam em assets/blog/ porque essa pasta já entra na
// imagem e recebe cache imutável; o nome carrega o hash do conteúdo.
export const FONT_FILES = Object.freeze([
  'assets/blog/fonts/barlow-condensed-215a93c696.woff2',
  'assets/blog/fonts/barlow-condensed-3787a5a419.woff2',
  'assets/blog/fonts/inter-3100e775e8.woff2',
]);
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const face = (family, weight, file) => `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(/${file}) format('woff2');unicode-range:${LATIN}}`;

export function fontHead() {
  const [barlow600, barlow700, inter] = FONT_FILES;
  return `<link rel="preload" href="/${inter}" as="font" type="font/woff2" crossorigin>`
    + `<link rel="preload" href="/${barlow700}" as="font" type="font/woff2" crossorigin>`
    + `<style>${face('Barlow Condensed', 600, barlow600)}${face('Barlow Condensed', 700, barlow700)}${face('Inter', '400 700', inter)}</style>`;
}