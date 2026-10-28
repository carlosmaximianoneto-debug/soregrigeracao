# URLs públicas sem /seo/

Autorização: o usuário pediu aplicar o ajuste proposto de URLs limpas e atualizar no Google. Mesmo domínio, catálogo e operação; não alterar conteúdo, grupo de destino, métricas, banco ou bots.

1. Publicar `/produtos/…`, `/categorias/…`, `/catalogo/…` e `/sitemap.xml` como rotas canônicas.
2. Redirecionar URLs antigas válidas com 301 diretamente para a rota final; preservar normalização de barra/index, redirecionamento de título pelo ID, 404 de itens removidos e 503 quando não for possível confirmar dados atuais.
3. Atualizar navegação, canonical, dados estruturados, paginação, robots e sitemap. O arquivo estático `seo-pages.css` é um recurso visual e pode manter o nome.
4. Testar rotas novas, antigas, paginação, GET/HEAD, preview noindex, segurança de redirecionamento, filtros e contagem. Publicar via PR/Netlify após revisão.
5. Verificar HTTP200 nas novas rotas e 301 nas antigas em produção. Enviar `/sitemap.xml` à propriedade existente `sc-domain:sorefrigeracao.com` pela API Google já autorizada. Não usar Change of Address: o domínio permanece igual. Submissão não é confirmação de indexação.
6. Registrar commit, implantação, respostas Google e rollback no Obsidian. Manter redirecionamentos antigos por pelo menos um ano e, preferencialmente, enquanto houver links compartilhados.

Fonte: https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes
