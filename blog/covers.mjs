// Editorial illustrations. These are not photos of products tested by the site.
const definitions = [
 ['ferramentas-para-refrigerista-kit-iniciante','Kit ilustrativo com ferramentas para refrigeração'],
 ['bomba-de-vacuo-3-cfm-ou-6-cfm','Duas bombas de vácuo de portes diferentes'],
 ['bomba-de-vacuo-simples-ou-duplo-estagio','Bombas de vácuo com diferentes configurações'],
 ['vacuometro-digital-como-escolher','Vacuômetro digital e conexão para mangueira'],
 ['manifold-analogico-ou-digital','Manifold analógico ao lado de um manifold digital'],
 ['manifold-r32-r410a-compatibilidade','Manifold e adaptadores de conexão para refrigeração'],
 ['mangueiras-para-manifold-como-escolher','Mangueiras de manifold e conectores de latão'],
 ['bomba-de-limpeza-ar-condicionado','Bomba portátil de limpeza com mangueira e aplicador'],
 ['bolsa-coletora-limpeza-split','Bolsa coletora instalada sob uma unidade de ar-condicionado'],
 ['flangeador-excentrico-como-escolher','Flangeador excêntrico e tubo de cobre'],
 ['cortador-de-tubo-de-cobre','Cortador manual ao lado de um tubo de cobre'],
 ['curvador-de-tubo-de-cobre','Curvador manual e tubo de cobre curvado'],
 ['torquimetro-para-refrigeracao','Torquímetro e conexões de cobre e latão'],
 ['serra-copo-para-ar-condicionado','Serras-copo e acessórios para perfuração'],
 ['furadeira-ou-martelete-ar-condicionado','Furadeira e martelete com acessórios'],
 ['alicate-amperimetro-para-refrigeracao','Alicate amperímetro com pontas de prova desconectadas'],
 ['termometro-infravermelho-ou-contato','Termômetro infravermelho e instrumento com sensor de contato'],
 ['detector-de-vazamento-refrigerante','Detector de vazamento com sonda flexível'],
 ['balanca-digital-para-refrigeracao','Balança de refrigeração com visor e estojo'],
 ['bomba-de-dreno-ar-condicionado','Bomba de dreno com reservatório e tubos de condensado'],
];
const covers = new Map(definitions.map(([slug,alt]) => [slug,Object.freeze({
 alt, width:1200, height:675,
 small:`/assets/blog/${slug}-v1-640.webp`,
 large:`/assets/blog/${slug}-v1-1200.webp`,
 social:`/assets/blog/${slug}-v1.jpg`,
})]));
export const getBlogCover = slug => covers.get(slug);
export const BLOG_COVER_FILES = Object.freeze([...covers.values()].flatMap(c=>[c.small,c.large,c.social].map(p=>p.slice(1))));
