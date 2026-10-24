(() => {
  const normal = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const rules = [
    ['Serras-copo',/serra[\s-]*copo/],
    ['Gases e óleos refrigerantes',/gas refrigerante|fluido refrigerante|oleo.*(bomba|vacuo|compressor)/],
    ['Válvulas e núcleos',/^(valvula|nucleo)|valvula.*bomba.*vacuo/],
    ['Mangueiras e conexões',/^(mangueira|adaptador|engate|conexao).*bomba.*vacuo/],
    ['Acessórios para bombas de vácuo',/^(filtro|tampa|vedacao|kit de reparo).*bomba.*vacuo/],
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
    ['Brocas e acessórios de corte',/broca|disco.*(corte|diamant)|esmerilhadeira|serra.*(sabre|circular|tico)/],
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
  window.catalogueCategory = title => rules.find(([,pattern]) => pattern.test(normal(title)))?.[0] || 'Outras ferramentas e acessórios';
})();
