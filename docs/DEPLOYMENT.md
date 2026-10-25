# Publicação da página

Domínio principal: **https://sorefrigeracao.com**. A página permanece hospedada no Netlify e o domínio foi registrado na Hostinger.

## Build

- Use Node.js 22 e execute `npm run build`.
- Publique somente a pasta `dist/`.
- Prévias não devem ser indexadas. O build de produção define o domínio principal nos metadados.
- Não inclua credenciais, relatórios internos ou arquivos locais de auditoria nos arquivos públicos.

## Comportamento do catálogo

O catálogo recebe uma lista pública de produtos ativos. Não é uma consulta em tempo real ao anúncio: preços e disponibilidade devem ser confirmados no destino. A página atualiza a lista enquanto estiver visível e deixa de exibir uma base expirada.

O carrossel acompanha a mesma lista e inclui bombas de vácuo, sem a antiga seleção fixa de quatro produtos. Acessórios e vacuômetros ficam em suas categorias.

## Verificação de uma publicação

Confira o acesso HTTPS, a busca, as categorias, uma página de produto, as imagens, o botão do WhatsApp e o layout no celular. O convite vigente deve permanecer igual nos três botões gerenciados da página inicial.

O endereço técnico do Netlify continua acessível e serve a mesma versão da página. O domínio principal aparece no canonical. O prefixo `www` redireciona para o domínio principal.

Se houver um problema, restaure a publicação anterior no Netlify ou reverta o commit correspondente no Git. Preserve o convite vigente ao fazer uma reversão.
