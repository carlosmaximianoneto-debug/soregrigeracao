# Visualizações e uso do catálogo — 27/10/2026

O usuário entrou pelo link do WhatsApp e esperava que isso fosse contado. Depois pediu identificar uso de filtros e clique em produto após filtrar. Escolha de implementação: ampliar a medição agregada existente, mantendo quatro campos fixos e sem criar visitantes, sessões, cookies, origem livre ou texto de pesquisa. Visualizações são separadas dos cliques; recargas contam novamente. Uso da busca e de categoria é limitado uma vez por tipo por carregamento. Cliques após filtro continuam sendo subconjunto dos cliques em Mercado Livre, vinculados ao produto.

## Implantação

1. Testar novas validações, frontend e painel.
2. Publicar painel v11 compatível com eventos antigos/novos, mantendo rollback v10.
3. Ampliar apenas constraints da tabela agregada; preservar RPC, RLS e histórico.
4. Publicar Edge com JWT e pin da credencial mantidos; depois publicar site por Git/Netlify.
5. Testar uma abertura, filtro e clique real controlado. Conferir agregado/painel e descontar os eventos controlados.
6. Revisar segurança das mudanças, atualizar privacidade e memória.

O link sem identificação não informa de qual grupo a pessoa veio. Não alterar links de grupos, bots ou regras de postagem. Rollback do frontend/painel não exige apagar agregados. Não usar número de visualizações como visitantes únicos ou taxa de conversão individual.

