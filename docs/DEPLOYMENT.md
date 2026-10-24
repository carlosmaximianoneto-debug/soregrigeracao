# Publicação do catálogo

Este pacote prepara o site para revisão e merge futuro. O commit de preparação não ativa Supabase, cron, Netlify ou VPS. A branch de trabalho não deve substituir `main` enquanto a origem pública do catálogo não estiver operante.

## Build e diretórios

Use Node.js 22 e `npm run build`; não há dependências npm. O Netlify publica **somente `dist/`**, criado com uma lista explícita de 20 arquivos públicos: HTML, CSS, JavaScript de navegador, quatro fotos do carrossel, ícones e imagem de compartilhamento. Não são copiados snapshots de produtos, `ops/`, código de servidor, notas locais, dumps, manifestos, relatórios ou imagens de revisão.

`index.html` continua na raiz do repositório, onde o publicador existente atualiza exatamente três convites WhatsApp. O build valida três `href="https://chat.whatsapp.com/..."` idênticos e válidos, preserva seus valores e mantém o HTML abaixo de 250.000 bytes. A transformação de metadados acontece somente em `dist/index.html`; não deve criar alterações no checkout usado pelo publicador. `dist/` e `netlify/generated/` devem ficar no `.gitignore`.

O wrapper `netlify/functions/catalogue.mjs` importa a fábrica de handler da raiz com `../../seo-netlify-function.mjs`. O build gera `netlify/generated/catalogue-config.mjs` com as regras de categorias em uma string e a configuração pública. Esses imports estáticos são incluídos por esbuild; nenhum `included_files` amplo e nenhuma leitura por `import.meta.url` são necessários no handler usado em produção. O handler antigo com envs, exportado pela fábrica na raiz, não é o entrypoint publicado.

## Contextos

- Local, deploy preview e branch deploy: `CONTEXT` diferente de `production`, página principal e SSR `noindex`; canonical/sitemap de produção ausentes. O build não faz requisições de rede e funciona antes da ativação do catálogo. O catálogo apresenta seu estado de indisponibilidade enquanto a origem ainda não existir; não há snapshot antigo de fallback.
- Produção: Netlify fornece `CONTEXT=production`. O build retira o modo visual de revisão, usa `preview=false`, libera indexação e define **https://sorefrigeracao.netlify.app** como origem canonical. Não exige `CATALOGUE_JSON_URL`, `SEO_BASE_URL` ou `SEO_INDEXING_ENABLED` externos. O futuro domínio próprio deve substituir `SITE_URL` uma única vez no build, com redirects e Search Console tratados na migração.

As configurações públicas do navegador e do SSR usam a mesma URL:

`https://xlwiwxaghbkdwbtwagwo.supabase.co/storage/v1/object/public/refri-catalogue/catalogue.json`

Essa URL não contém chave. A configuração de segredos pertence exclusivamente à Edge Function/Vault do Supabase. Sua criação e ativação são trabalhos separados e devem preceder o merge de produção.

## Rotas e atualização

A função exporta `path: ['/seo/*', '/robots.txt']` e `preferStatic: false`; não adicionar fallback SPA ou HTML estático para essas rotas. Categorias, produtos e `/seo/sitemap.xml` são renderizados no servidor com o JSON público atual. Conteúdo de produto vem no HTML. A função usa cache em memória de até 30 segundos e `no-store` para HTTP/CDN. Falha de leitura, JSON inválido ou snapshot acima de 15 minutos retorna 503; produto ausente retorna 404; título alterado preservando ID redireciona para o novo slug.

A UI atualiza o catálogo com a aba ativa e verifica validade de 15 minutos em produção. O snapshot é a última leitura do banco, não garantia instantânea de preço ou estoque do Mercado Livre. O JSON-LD não declara Offer, estoque, avaliações ou notas.

## Condições antes do merge em main

1. Confirmar bucket, Edge Function autenticada e cron de cinco minutos no projeto correto; iniciar e validar a primeira publicação sanitizada.
2. Confirmar leitura pública de `catalogue.json`, `generatedAt` recente e CORS do Storage para o navegador.
3. Executar o build de produção e validar a página principal, as três âncoras WhatsApp, CSS/JS/fotos, categoria, produto, paginação, canonical, robots e sitemap em uma prévia Netlify.
4. Confirmar que a função foi empacotada e que as rotas retornam 200, 404 e 503 conforme o contrato; uma execução local de Node não prova a hospedagem Netlify.
5. Confirmar os três convites publicados contra a rota atual e a continuidade do publicador existente. Não alterar seus scripts, bot, n8n ou VPS.

O modo `?direto=1` continua lendo os mesmos três convites do HTML; páginas SEO não possuem convites independentes. O domínio próprio ainda não foi comprado.

Referências: [Netlify: configuração e bundling de funções](https://docs.netlify.com/build/functions/configuration/), [Netlify: diretório de publicação e configuração versionada](https://docs.netlify.com/build/configure-builds/file-based-configuration/), [Google: paginação](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading).
