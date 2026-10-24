# Revisão SEO — 24/10/2026

## Escopo e método

Landing mobile e catálogo Só Refrigeração, com objetivo de ajudar refrigeristas a encontrar ferramentas e entrar no grupo de ofertas. Aplicada a skill [SEO Audit](https://github.com/coreyhaines31/marketingskills/blob/main/skills/seo-audit/SKILL.md), versão 2.2.2, blob `e0a41d8c46c06d1e33ce5295c0f303a94d8f6c5b`.

Revisão do código, build e HTML renderizado localmente. Isto não é medição de tráfego, rankings ou Core Web Vitals em produção. Sem acesso ao Search Console. A consulta Semrush não retornou dados por falta de unidades de API; volumes e dificuldade de palavras-chave não foram inferidos.

## Conteúdo e intenção de busca

Pesquisa qualitativa por “ferramentas para refrigerista”, “quais ferramentas para instalar ar condicionado split”, “bomba de vácuo 3 CFM 6 CFM” e ferramentas de instalação. As perguntas são redações editoriais baseadas nesses temas e nos produtos do catálogo, não uma lista de consultas comprovadas por volume do Google.

| Tema | Pergunta escolhida | Destino interno |
| --- | --- | --- |
| Ferramentas para refrigerista | Quais ferramentas um refrigerista precisa para instalar ar-condicionado split? | Catálogo completo |
| Bombas de vácuo para refrigeração | Qual a diferença entre bomba de vácuo de 3 CFM e 6 CFM para refrigeração? | Bombas de vácuo |
| Manifold R32/R410A | Como escolher um manifold para ar-condicionado R32 ou R410A? | Manifolds e manômetros |
| Serra-copo para instalação | Qual serra-copo usar na instalação de ar-condicionado? | Serras-copo |
| Ofertas para refrigerista | Onde encontrar ferramentas para refrigerista com ofertas no WhatsApp? | Como funciona |
| Preço de ferramentas | O preço das ferramentas de refrigeração é o mesmo no catálogo e no anúncio? | Resposta sobre condições do anúncio |

Perguntas e respostas estão no HTML inicial em `details/summary`, disponíveis sem JavaScript. Foram usadas grafias naturais e corretas, sem repetir erros de digitação para atrair busca. Não há promessa de posição no Google ou resultado enriquecido de FAQ.

Referências técnicas consultadas: [manual LG de instalação R32](https://www.lg.com/content/dam/subsidiary/latam/brazil/suporte/shared/manuais/RAC_Bi%20Split_R32_Installation%20Manual.pdf), [especificações Friven Smart](https://friven.com.br/uploads/bs23rapst1lmr19mej65.pdf) e [catálogo JRC de acessórios diamantados](https://www.jrcdiamantados.com.br/catalogos/Catalogo-de-Produtos-jrc-diamantados.pdf). As respostas não substituem o manual de cada produto.

## Ajustes concluídos

- H1 único com “Ferramentas para refrigerista” e chamada para as ofertas.
- Title, descrição e Open Graph alinhados ao tema principal; sem lista artificial de palavras-chave.
- FAQ útil com seis perguntas, respostas curtas e links descritivos para categorias.
- Homepage incluída no sitemap junto às rotas canônicas do catálogo.
- “Preço cadastrado” não atribui ao preço a data de geração do snapshot.
- Canonical próprio por página e por página de paginação; produtos removidos retornam 404; slugs antigos de produtos ativos redirecionam.
- HTML renderizado no servidor para categorias e produtos, com paginação por links acessíveis sem JavaScript.
- Prévias permanecem `noindex`; produção usa HTTPS e libera indexação somente no contexto correto.
- Links afiliados sinalizados como `sponsored`; preço, estoque, avaliações e notas não são inventados no JSON-LD.
- Carrossel de produção aguarda o catálogo válido antes de exibir produtos.
- Botão flutuante reaproveita o convite gerenciado, sem pop-up. Formato compacto no celular, com nome acessível e foco de teclado.
- Marca do cabeçalho alinhada aos favicons SVG/ICO e ícones PNG de 180, 192 e 512 px. Imagem de compartilhamento de 1200 × 630 px e metadados Open Graph/Twitter incluídos; a imagem usa a identidade existente e não anuncia preço ou estoque.

Referências SEO: [Google — títulos descritivos e concisos](https://developers.google.com/search/docs/appearance/title-link), [Google — paginação de catálogo](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading).

## Pendências antes da publicação

1. **Alta:** ativar e validar a fonte pública sanitizada do catálogo. Sem ela, rotas de catálogo retornam indisponibilidade; não fazer merge em `main` antes desse passo.
2. **Alta:** validar build e função no ambiente Netlify, incluindo CORS, respostas 200/301/404/503 e atualização do JSON.
3. **Média:** após publicação, configurar Search Console no domínio definitivo e enviar o sitemap. O domínio próprio ainda não foi definido.
4. **Média:** medir desempenho real mobile em produção. Não foi atribuída nota Lighthouse ou aprovação de Core Web Vitals.
5. **Evolução:** enriquecer produtos com especificações verificadas e conteúdo editorial próprio. As páginas atuais usam dados do cadastro e orientação de categoria; não alegam testes práticos dos equipamentos.

A revisão não alterou bots, n8n, banco, cron, VPS ou a página pública atual.
