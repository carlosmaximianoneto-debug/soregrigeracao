(() => {
  const normal = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  // A compatible tool or an included accessory must not replace the item sold.
  // Strip packaging words and quantities, but keep "para/com/+" inside the title:
  // "óleo para bomba" and "bomba com vacuômetro" still need that context.
  const primaryTitle = title => title.replace(/^[^a-z0-9]+/, '').replace(/^(?:(?:kit|jogo|conjunto|combo|pacote)\s+(?:(?:de|com)\s+)?|\d+\s*(?:(?:pecas?|pcs?|pçs?|unidades?|un)\s+)?)*/, '');
  const primaryRules = [
    ['Maletas, bolsas e organização', /^(?:caixa\s+organizadora|organizador\b|bolsa\s+(?:para|de)\s+ferramentas|maleta\s+(?:em\s+)?couro\b)/],
    ['Acessórios para medição', /^(?:acessorios?\b.*(?:vacuometro|manometro|multimetro)|pontas?\s+de\s+prova\b)/],
    ['Acessórios para perfuração e corte', /^(?:sacos?\s+coletores\b.*(?:brocas?|serra[\s-]*copo)|acabamento\b.*serra[\s-]*copo|gabarito\s+afiador\b.*broca)/],
    ['Flangeadores e alargadores', /^(?:adaptador\b.*\bflangeador\b|brocas?\b.*(?:alargador|expansor|expansora)\b.*(?:tubo|cano|cobre))/],
    ['Pontas, bits e mandris', /^(?:mandril\b|bits?\b|pontas?\s+bits?\b|ponteiras?\b)|^adaptador\b.*\bparafusadeira\b/],
    ['Parafusos e fixadores', /^parafusos?\b/],
    ['Elétrica e peças', /^conector(?:es)?\b.*(?:\bwago\b|\bfios?\b|\bemenda\b.*\bsem solda\b)/],
    ['Mangueiras e conexões', /^(?:mangueiras?\b|(?:porca\s+)?adaptador\b|engate\b|conexao\b)|^(?:reparo|vedacao|borracha|conector)\b.*mangueiras?\b/],
    ['Válvulas e núcleos', /^(?:valvulas?|nucleos?)\b/],
    ['Solda e maçaricos', /^macaricos?\b/],
    ['Bombas de dreno', /^bomba\s+(?:de\s+)?dreno\b/],
    ['Chaves e alicates', /^chaves?\b.*\b(?:inglesa|suporte)\b/],
    ['Serras-copo', /^(?:serras?[\s-]*copo\b|brocas?\b.*serra[\s-]*copo\b)/],
    ['Brocas', /^brocas?\b/],
    ['Discos e lâminas', /^(?:discos?|laminas?)\b/],
    ['Esmerilhadeiras', /^(?:mini\s+)?esmerilhadeiras?\b/],
    ['Serras elétricas', /^(?:mini\s+)?serra\s+(?:sabre|circular|tico|marmore)\b/],
  ];
  const rules = [
    ['Serras-copo',/serra[\s-]*copo/],
    ['Gases e óleos refrigerantes',/gas refrigerante|fluido refrigerante|oleo.*(bomba|vacuo|compressor)/],
    ['Válvulas e núcleos',/^(valvula|nucleo)|valvula.*bomba.*vacuo/],
    ['Mangueiras e conexões',/^(mangueira|adaptador|engate|conexao).*bomba.*vacuo/],
    ['Acessórios para bombas de vácuo',/^(filtro|tampa|vedacao|kit de reparo).*bomba.*vacuo/],
    ['Vacuômetros',/^vacuometro\b/],
    ['Bombas de vácuo',/bomba.*vacuo|vacuo.*bomba/],
    ['Bombas de limpeza',/(bomba|lavadora|pressurizador|pulverizador).*(limpeza|lavagem|ar condicionado|portatil|pressao)|bomba.*limpa/],
    ['Manifolds e manômetros',/manifold|manometro/],
    ['Vacuômetros',/vacuometro/],
    ['Flangeadores e alargadores',/flangeador|alargador|escareador|flangeamento/],
    ['Cortadores e curvadores de tubos',/(cortador|curvador|dobrador).*(tubo|cobre)|corta.*tubo/],
    ['Recolhedoras e recuperadoras',/recolhedora|recuperadora|recolhedor.*gas/],
    ['Gases e óleos refrigerantes',/gas refrigerante|fluido refrigerante|oleo.*(bomba|vacuo|compressor)/],
    ['Mangueiras e conexões',/mangueira|engate|conexao|adaptador|registro.*gas/],
    ['Solda e maçaricos',/solda|macarico|brasagem/],
    ['Detectores de vazamento',/detector.*(vazamento|gas)|caca.*vazamento/],
    ['Multímetros e alicates amperímetros',/multimetro|amperimetro/],
    ['Termômetros e medição',/termometro|anemometro|higrometro|termohigrometro|balanca|trena|nivel.*laser|paquimetro/],
    ['Furadeiras e parafusadeiras',/furadeira|parafusadeira|martelete/],
    ['Brocas',/\bbrocas?\b/],
    ['Discos e lâminas',/\bdiscos?\b.*(corte|diamant)|\blaminas?\b.*\bserra\b/],
    ['Esmerilhadeiras',/\besmerilhadeiras?\b/],
    ['Serras elétricas',/\bserra\b.*(sabre|circular|tico|marmore)/],
    ['Suportes para split',/suporte.*(split|ar condicionado|condensadora)|base.*condensadora/],
    ['Fitas e isolamento',/fita|isolamento|isolante|esponjoso/],
    ['Tubos e drenos',/tubo.*(cobre|aluminio|pvc)|dreno|canaleta/],
    ['Válvulas e núcleos',/valvula|nucleo|schrader/],
    ['Limpeza e higienização',/limpeza|higieniza|detergente|serpentina|coletora|lavagem/],
    ['Chaves e alicates',/chave|alicate|allen|torquimetro|catraca|soquete/],
    ['Maletas, bolsas e organização',/maleta|bolsa|mochila|organizador|caixa.*ferramenta/],
    ['EPIs e segurança',/\bepi\b|oculos.*protecao|luva|botina|bota.*seguranca|respirador|capacete/],
    ['Elétrica e peças',/capacitor|contator|disjuntor|rele|terminal|placa|sensor|controle remoto|motor|compressor/],
    ['Iluminação e apoio',/lanterna|refletor|escada|bancada|extensao/]
  ];
  window.catalogueCategory = title => {
    const text = normal(title), primary = primaryTitle(text);
    return primaryRules.find(([,pattern]) => pattern.test(primary))?.[0]
      || rules.find(([,pattern]) => pattern.test(text))?.[0]
      || 'Outras ferramentas e acessórios';
  };
})();
