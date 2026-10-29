# Métricas anônimas do blog

Implementação isolada, preparada para revisão e implantação pelo executor principal. `schema.sql` e `verify.sql` não foram executados em produção por este trabalho.

## Integração

- Carregar `/blog-clicks.js` com `defer` somente nas páginas de artigo.
- Renderizar `data-blog-slug="slug-aprovado"` no `body`.
- Marcar os links HTTPS do WhatsApp com `data-blog-cta="article_mid"` ou `data-blog-cta="article_end"`.
- Encaminhar `/api/blog-click` para `createBlogClickRelay({ apiKey, enabled, fetchImpl })`, exportada por `blog-click-handler.mjs`. A chave deve ser a mesma credencial anon legada aprovada para o relay existente, mantida somente no servidor.
- Incluir `blog-click-handler.mjs` e `operations/blog-clicks/handler.mjs` no runtime do servidor, e `blog-clicks.js` nos arquivos públicos.
- Desabilitar o relay em previews/desenvolvimento. O navegador também exige a origem exata `https://sorefrigeracao.com`.

O corpo permitido é exatamente `{ "event_type": "page_view|whatsapp_click", "article_slug": "slug-aprovado", "placement": "page_load|article_mid|article_end" }`. `page_view` aceita apenas `page_load`; `whatsapp_click` aceita apenas as duas posições do CTA. Os 20 slugs são explicitamente permitidos no navegador, no coletor e no banco. Adicionar um artigo requer atualizar as três listas.

## Dados e proteção

O navegador envia eventos para o próprio domínio, com `credentials: omit`, `referrerPolicy: no-referrer`, sem impedir navegação ou tentar novamente. Conta uma visualização quando o documento fica visível; cliques exigem ativação confiável do navegador. DNT e GPC impedem coleta, inclusive quando mudam após o carregamento. Nenhum cookie, armazenamento persistente, IP, identificador de sessão/usuário, referrer, destino do link ou texto de busca faz parte do evento.

O relay e a função Edge aceitam JSON de até 512 bytes, rejeitam campos extras, exigem `Origin` exato e rejeitam `Sec-Fetch-Site` diferente de `same-origin` quando informado. DNT/GPC também são respeitados no servidor. O limite é de 20 envios/minuto por documento e 300 requisições/minuto por instância de cada coletor, sem identificação de visitantes. Não é um limite global distribuído. O limite persistente do banco é de 100.000 eventos por dia/artigo/tipo/posição. Falhas e limites não interferem no link do WhatsApp.

O relay remove todos os cabeçalhos do visitante antes de encaminhar. Só envia o JSON validado, o `Origin` fixo e a credencial do servidor. Timeout de 4 segundos no relay e 3 segundos no acesso ao RPC; redirecionamentos são recusados. A função Edge só confirma o evento quando o RPC retorna `true`; erro ou limite diário retorna resposta vazia 503. O fingerprint em `relay-auth.mjs` identifica a mesma chave anon legada do coletor existente e não é um segredo. Rotação da chave exige revisar ambos os fingerprints.

## Supabase

Aplicar `schema.sql` após revisão. Ela cria somente `public.refri_blog_daily` e `public.refri_record_blog_click(text,text,text)`. Não altera o catálogo, a tabela de métricas anterior ou seu RPC.

`refri_blog_daily` mantém uma linha por dia em `America/Cuiaba`, artigo, tipo de evento e posição. `clicks` guarda a contagem do respectivo tipo, inclusive visualizações. `last_clicked_at` recebe o horário do servidor apenas para cliques do WhatsApp. O UPSERT atualiza contagem e horário atomicamente, sem regredir o horário mais recente, e retorna falso ao atingir o limite diário.

RLS permite leitura somente a usuários autenticados aprovados por `public.acbot_is_admin()`. `anon` não tem acesso. Apenas `service_role` recebe permissões de escrita e execução do RPC, que é `SECURITY INVOKER` com `search_path = ''`. A chave de serviço fica exclusivamente na função Edge.

Implantar `refri-blog-click` com `index.ts`, `edge-handler.mjs`, `handler.mjs` e `relay-auth.mjs` juntos. Mesclar `config.toml` na configuração Supabase de implantação ou definir `verify_jwt: true` na ferramenta de deploy. Nunca usar `--no-verify-jwt`. Além da validação JWT da plataforma, a função exige o fingerprint exato da credencial do relay; outro JWT válido não deve passar. Os segredos usados são os padrões `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do ambiente Edge.

Depois da aplicação, executar `verify.sql`: testa grants, RLS, invoker/search_path, contagem, limites e timestamps em uma transação que termina em `ROLLBACK`. Executar também os advisors de segurança do projeto. A validação local usa `npm test`.

## Consulta para o painel administrativo

Consulta abaixo deve rodar sob o contexto autenticado de um administrador ou no servidor, respeitando RLS. O resultado mede visualizações e cliques, não pessoas únicas nem entradas confirmadas no grupo.

```sql
select article_slug,
  coalesce(sum(clicks) filter (where event_type='page_view'),0) as page_views,
  coalesce(sum(clicks) filter (where event_type='whatsapp_click'),0) as whatsapp_clicks,
  coalesce(sum(clicks) filter (where event_type='whatsapp_click' and placement='article_mid'),0) as article_mid_clicks,
  coalesce(sum(clicks) filter (where event_type='whatsapp_click' and placement='article_end'),0) as article_end_clicks,
  max(last_clicked_at) as last_clicked_at
from public.refri_blog_daily
where day >= (current_timestamp at time zone 'America/Cuiaba')::date - 29
group by article_slug
order by page_views desc, article_slug;
```

Referências verificadas: [autorização Edge](https://supabase.com/docs/guides/functions/auth-headers), [funções do banco](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
