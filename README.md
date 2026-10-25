# Só Refrigeração

Catálogo de ferramentas para refrigeristas, com busca por produto, categorias e entrada no grupo de ofertas do WhatsApp.

Endereço principal: **https://sorefrigeracao.com**.

O carrossel mostra as bombas de vácuo presentes no catálogo atual. Títulos, fotos e links acompanham as atualizações; produtos removidos deixam de aparecer. Os preços exibidos são os preços cadastrados e devem ser confirmados no anúncio.

## Desenvolvimento

Requer Node.js 22. Execute `npm run build` para gerar a pasta pública `dist/`.

Testes do carrossel: `node --test tests/carousel.test.mjs`.

O layout é adaptado para celular, com navegação por teclado, opção de pausar o carrossel, respeito à preferência de movimento reduzido e botão flutuante do WhatsApp.

Veja as [orientações de publicação](docs/DEPLOYMENT.md) e a [revisão editorial de SEO](docs/SEO-AUDIT.md).
