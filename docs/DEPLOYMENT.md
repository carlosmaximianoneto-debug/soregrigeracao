# Publicação da página

Domínio principal: **https://sorefrigeracao.com**. A produção usa um contêiner Docker isolado na VPS Hostinger, atrás do Caddy. O domínio continua registrado na Hostinger. A configuração Netlify fica no repositório para compatibilidade e rollback.

## Produção na VPS

- Projeto Compose `sorefrigeracao-site-prod`, contêiner `sorefrigeracao-site-web`, endereço interno `127.0.0.1:3190`.
- Runtime sem root, disco somente leitura, sem capacidades Linux adicionais; limites de 512 MiB, 0,75 CPU e 128 processos.
- O Caddy mantém HTTPS e redireciona `www` para o domínio principal. Os bots e outros serviços têm ciclos de vida separados.
- A publicação acompanha a branch `main` a cada dois minutos. Um commit novo gera uma imagem identificada pelo SHA e só se torna a versão atual após a verificação de saúde.
- A configuração de cliques fica em `/srv/sorefrigeracao-site/shared/runtime.env`, com acesso restrito. Nenhuma chave entra no HTML, build ou Git.
- O procedimento de instalação, atualização e rollback está em [operations/vps/README.md](../operations/vps/README.md).

## Build

- Use Node.js 22, `npm ci` e `npm run build` para desenvolvimento/prévias.
- O Dockerfile executa o build com `CONTEXT=vps-production` e copia somente os arquivos explicitamente permitidos.
- O servidor só expõe a pasta pública `dist/` e as rotas conhecidas de catálogo, imagens e cliques.
- Prévias não devem ser indexadas. O build de produção define o domínio principal nos metadados.
- Não inclua credenciais, relatórios internos ou arquivos locais de auditoria nos arquivos públicos.

## Comportamento do catálogo

O catálogo recebe uma lista pública de produtos ativos. Não é uma consulta em tempo real ao anúncio: preços e disponibilidade devem ser confirmados no destino. A página atualiza a lista enquanto estiver visível e deixa de exibir uma base expirada.

O carrossel acompanha a mesma lista e inclui bombas de vácuo, sem a antiga seleção fixa de quatro produtos. Acessórios e vacuômetros ficam em suas categorias.

## Verificação de uma publicação

Confira o acesso HTTPS, a busca, as categorias, uma página de produto, as imagens, o botão do WhatsApp e o layout no celular. O convite vigente deve permanecer igual nos três botões gerenciados da página inicial.

O domínio principal aparece no canonical. O prefixo `www` redireciona para o domínio principal. O endereço técnico do Netlify pode permanecer em uma versão anterior: ele não confirma a versão em produção na VPS. `/healthz` identifica o SHA servido na VPS.

Se uma atualização falhar na verificação, o publicador restaura a imagem anterior. Também é possível executar o rollback documentado ou reverter o commit no Git. Preserve o convite vigente ao fazer uma reversão. O DNS anterior foi guardado para uma contingência de infraestrutura; voltar ao Netlify exige conferir primeiro a disponibilidade daquela publicação.
