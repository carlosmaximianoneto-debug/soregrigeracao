# Contagem agregada de cliques

## Decisão aprovada
O usuário escolheu contagem própria sem cookies de rastreamento e sem banner, substituindo a opção inicial de GA4. Mostrar resultados por produto no painel ADM acbot.tech, com acesso atual protegido por MFA.

## Arquitetura
- JavaScript leve e independente, delegado nos links existentes, sem bloquear navegação, sem storage, cookies, IDs de visitantes, campos de pesquisa ou URLs completas no evento.
- Eventos: affiliate_click, product_view_click e whatsapp_click; ID do catálogo, posição do botão e tipo de página. Contagem diária em America/Cuiaba, agregada atomicamente.
- POST same-origin /api/site-click na Netlify; relay autenticado para função Supabase. Apenas chave anon em variável de ambiente do servidor. service_role permanece no Supabase. Nenhuma chave no navegador ou repositório.
- Tabela separada refri_site_click_daily; escrita via RPC de serviço, leitura somente admin autorizado com AAL2. Nenhuma alteração nos produtos, filas, bots ou destinos dos links.
- Painel com dia/semana/mês, ranking por produto e separação entre detalhes, anúncio e WhatsApp. São cliques, não visitantes únicos, vendas ou entradas confirmadas.
- Política pública explica a contagem, limitações e logs técnicos dos provedores; não alegar anonimato total da infraestrutura. Sem GA4, pixels ou identificadores de publicidade.

## Etapas
- [ ] Testar cliente antes da implementação: origem de produção, eventos reais, ID, double-click, preferência DNT/GPC e erros sem impacto na navegação.
- [ ] Criar coletor/SQL e testar validação, limites, RLS e incremento concorrente. Configurar variável apenas na função Netlify.
- [ ] Integrar home, produtos, categorias e política, preservando contrato dos três convites.
- [ ] Integrar painel: paginação completa, timezone e métricas sem resultados parciais silenciosos.
- [ ] Testes completos, revisão independente, preview mobile/desktop, publicação e um teste controlado removido da contagem real.
- [ ] Documentar no Obsidian e indicar onde consultar.

## Limites e rollback
Sem cookies não significa dispensa geral da LGPD. A aplicação salva somente agregados, enquanto hospedagem pode manter logs técnicos sob suas políticas. Endpoint público não pode garantir que cada envio corresponde a uma pessoa; há validação, limites globais e exclusão de cliques sintéticos no navegador. Sem reenvio automático que duplique contagem. Retirar script/função por revert desliga novos envios; preservar tabela para histórico. Publicação do painel é troca atômica de arquivos, sem reiniciar bots.
