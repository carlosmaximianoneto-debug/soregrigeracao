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
