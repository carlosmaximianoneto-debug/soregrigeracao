# Contagem de cliques do site

Estado inicial: preparado e testado localmente. Aplicação/deploy exigem revisão do executor principal.

## Fluxo

Navegador envia apenas `event_type`, `product_id`, `placement` e `page_type` para `/api/site-click`, no próprio domínio. Netlify valida os campos e encaminha a Supabase `refri-site-click` usando a chave anon legada em variável de ambiente **somente no servidor**. Nenhuma chave é incluída no bundle público.

A função Edge mantém `verify_jwt: true` e confere a credencial do relay. A chave service_role fica no ambiente padrão da Edge Function e executa a RPC `refri_record_site_click`. O contador é agregado por data do calendário `America/Cuiaba`; a data nunca é recebida do cliente.

Não são criados IDs de visitante, sessões, cookies, impressão digital, eventos brutos nem histórico individual. A aplicação não copia IP, User-Agent, Referer ou cookies para o banco ou do Netlify para a Edge. Os provedores de infraestrutura podem manter logs técnicos próprios, conforme suas políticas: não prometer que nenhuma infraestrutura processa IP.

## Arquivos e deploy

- `schema.sql`: cria exclusivamente `public.refri_site_click_daily`, sua policy e RPC. Aplicar via migration Supabase após revisão.
- `index.ts` + `handler.mjs`: enviar como Edge `refri-site-click`, entrypoint `index.ts`, **verify_jwt=true**. Não precisa dependências npm/jsr.
- `../../site-click-handler.mjs` e `../../netlify/functions/site-click.mjs`: relay Netlify.
- Variáveis Netlify de runtime/functions, contexto **production**: `REFRI_CLICK_ANON_KEY` com anon JWT existente; `REFRI_CLICK_ENABLED=true`. Em previews, `REFRI_CLICK_ENABLED` deve ficar ausente/false. Nunca inserir service_role nessas variáveis.
- `verify.sql`: verificações pós-aplicação dentro de transação com ROLLBACK; não deixa cliques de teste no painel.
- Testes Node: `node --test tests/site-click-backend.test.mjs`.

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
