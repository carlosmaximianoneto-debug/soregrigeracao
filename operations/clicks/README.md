# Contagem de cliques do site

Estado inicial: preparado e testado localmente. Aplicação/deploy exigem revisão do executor principal.

## Fluxo

Navegador envia apenas `event_type`, `product_id`, `placement` e `page_type` para `/api/site-click`, no próprio domínio. Netlify valida os campos e encaminha a Supabase `refri-site-click` usando a chave anon legada em variável de ambiente **somente no servidor**. Nenhuma chave é incluída no bundle público.

A função Edge mantém `verify_jwt: true` e confere a credencial exata do relay por seu fingerprint SHA-256 fixado em `relay-auth.mjs`, sem depender da igualdade com o valor padrão de `SUPABASE_ANON_KEY`. O fingerprint não é uma credencial e não autentica por si só. A chave service_role fica no ambiente padrão da Edge Function e executa a RPC `refri_record_site_click`. O contador é agregado por data do calendário `America/Cuiaba`; a data nunca é recebida do cliente.

Não são criados IDs de visitante, sessões, cookies, impressão digital, eventos brutos nem histórico individual. A aplicação não copia IP, User-Agent, Referer ou cookies para o banco ou do Netlify para a Edge. Os provedores de infraestrutura podem manter logs técnicos próprios, conforme suas políticas: não prometer que nenhuma infraestrutura processa IP.

## Visualizações e uso de filtros

O contrato também distingue `page_view` com posição `page_load`: ID de produto positivo somente na página individual; zero nas páginas inicial, categoria e catálogo. Uma visualização não é pessoa única nem clique. `filter_use` registra somente uso da busca ou da seleção de categoria (`search_filter`/`category_filter`), sempre com produto zero e página inicial. Não recebe o texto pesquisado nem a categoria escolhida. Quando existe filtro ativo, um clique no anúncio usa `affiliate_click` com posição `home_card_filtered`; o clique comum continua `home_card`. Isso informa uma ação feita após filtrar, sem associar jornadas entre páginas ou identificar pessoas.

Em banco existente, aplicar **somente** `add-page-views.sql` para ampliar as três constraints. A migração não apaga nem altera contagens anteriores, a chave primária, a RPC ou permissões. A coluna legada `clicks` guarda a contagem de cada `event_type`; relatórios devem separar visualizações, filtros e cliques. Depois, publicar o handler da Edge e o relay Netlify atualizados antes de habilitar os novos eventos no frontend.

## Horário do último clique

`last_clicked_at` é uma coluna opcional por linha agregada. A RPC captura uma única hora do servidor com `clock_timestamp()` e deriva dela tanto a data de Cuiabá quanto o horário. Somente `affiliate_click`, `product_view_click` e `whatsapp_click` atualizam esse campo; visualizações e uso de filtro mantêm `NULL`.

Registros anteriores não recebem horário inventado: a coluna nasce sem valor padrão e sem backfill. Se um desses agregados receber um novo clique, passa a guardar a hora desse novo clique. Incremento e horário são atualizados atomicamente; `greatest` evita que uma requisição cujo horário foi capturado antes, mas obteve o bloqueio da linha depois, faça o último horário retroceder. O limite existente de 100.000 eventos por agregado/dia continua igual: um incremento recusado pelo limite também não muda o horário.

Aplicar `add-last-click.sql` uma vez em banco existente; `schema.sql` já contém o estado completo para instalação nova. A migração mantém assinatura, SECURITY INVOKER e permissões da RPC, com limites de espera de lock e execução. O frontend não envia data nem hora. O painel pode ordenar por `last_clicked_at DESC NULLS LAST`, apresentando registros antigos como horário indisponível. Esse horário é de recebimento pelo servidor, não uma lista individual de todos os eventos ou identificação de quem clicou.

## Arquivos e deploy

- `schema.sql`: cria exclusivamente `public.refri_site_click_daily`, sua policy e RPC. Aplicar via migration Supabase após revisão.
- `index.ts` + `handler.mjs` + `relay-auth.mjs`: enviar como Edge `refri-site-click`, entrypoint `index.ts`, **verify_jwt=true**. Não precisa dependências npm/jsr.
- `../../site-click-handler.mjs` e `../../netlify/functions/site-click.mjs`: relay Netlify.
- Variáveis Netlify de runtime/functions, contexto **production**: `REFRI_CLICK_ANON_KEY` com anon JWT existente; `REFRI_CLICK_ENABLED=true`. Em previews, `REFRI_CLICK_ENABLED` deve ficar ausente/false. Nunca inserir service_role nessas variáveis.
- `verify.sql`: verificações pós-aplicação dentro de transação com ROLLBACK; não deixa cliques de teste no painel.
- Testes Node: `node --test tests/site-click-backend.test.mjs`.

## Rotação da credencial do relay

O fingerprint aceita apenas a chave anon pública ativa configurada no Netlify; não aceita qualquer JWT com papel anon. Se essa chave mudar, obter a nova chave pelos canais autorizados, calcular seu SHA-256 localmente sem imprimir o valor da chave, atualizar `ACTIVE_RELAY_FINGERPRINT` e seu teste, e coordenar o deploy da Edge com a variável de ambiente `REFRI_CLICK_ANON_KEY` no Netlify. Manter `verify_jwt=true` em todos os deploys. Até os dois lados coincidirem, a coleta falha fechada com 401/503, sem interromper links ou catálogo. Não registrar chave, Bearer ou fingerprints recebidos em logs de diagnóstico.

## Acesso e limites

A tabela só tem SELECT para `authenticated` mediante `public.acbot_is_admin()` (allowlist administrativa + MFA AAL2 existente). Escrita via RPC exclusiva de `service_role`; função SECURITY INVOKER, search_path vazio, sem alteração em `produtos`. IDs de produtos devem existir e ter `link_morto=false` no momento do clique.

Validação rejeita campos adicionais, combinações incoerentes e corpos acima de 512 bytes, inclusive bodies em stream. Requisições de origens diferentes são rejeitadas. Origin não comprova autenticidade: pode ser falsificado por clientes fora do navegador. A chave anon também não é segredo de autenticação de pessoas.

Limite de 300 requisições/minuto **por instância** e limite de 100.000 cliques por combinação/dia contêm abusos acidentais; não constituem bloqueio global de um atacante distribuído. Métricas são cliques aproximados, não usuários únicos, vendas nem entradas confirmadas nos grupos. Navegadores bloqueadores, indisponibilidade e validações podem reduzir a contagem.

## Rollback

Desabilitar `REFRI_CLICK_ENABLED` em produção e/ou remover o script público desliga a coleta. Preservar a tabela e seus dados para não perder histórico. Não é necessário reiniciar bots ou alterar catálogo, n8n, sessões ou regras de postagem.

## Referências verificadas

- https://supabase.com/docs/guides/functions/auth-headers
- https://supabase.com/docs/guides/getting-started/api-keys
- `public.acbot_is_admin()` e políticas existentes consultadas no projeto em 27/10/2026.
- Changelog consultado em 27/10: mudança anunciada de cifras TLS 1.2 antigas em 10/11. O relay Node 22 e Edge usam TLS moderno.
