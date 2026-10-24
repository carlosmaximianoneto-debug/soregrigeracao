# soregrigeracao

## Catálogo e página para refrigeristas

Versão aprovada visualmente em 24/10/2026, preparada na branch `codex/catalogo-mobile-supabase`. Inclui busca, categorias, carrossel de bombas, layout mobile e páginas de produtos/categorias renderizadas no servidor para SEO. O H1 é “Ferramentas para refrigerista — ofertas no WhatsApp”.

Execute `npm run build`. Somente a lista de arquivos públicos de `scripts/build-site.mjs` vai para `dist/`; banco, snapshots, operações e segredos não são publicados. O índice continua na raiz para preservar o publicador dos três convites WhatsApp.

**Esta branch não ativa a sincronização nem representa publicação em produção.** Antes de integrar em `main`, seguir [a implantação](docs/DEPLOYMENT.md). A origem automática do JSON ainda precisa ser implantada e validada. O relatório de auditoria da infraestrutura permanece local e não faz parte do repositório. Configurações do navegador contêm apenas URLs públicas. Produtos mortos saem após a atualização da base; snapshots expirados são recusados em produção.

O catálogo replica preços cadastrados no Supabase; não consulta os preços do Mercado Livre em tempo real. A validação de links e o atualizador de preços existentes continuam independentes, sem alterações ou reinícios nesta entrega.

## Publicação da entrada dos grupos

O fluxo `.github/workflows/public-route.yml` consulta, a cada cinco minutos ou por
execução manual, o manifesto privado do painel ACBOT usando a identidade OIDC do
GitHub Actions. Somente um pedido aprovado e ainda válido pode alterar os três
links de convite em `index.html`. O fluxo faz um único commit nesse arquivo, espera
os três links aparecerem em `https://sorefrigeracao.netlify.app/` e só então pede
ao backend a confirmação da rota publicada. Um pedido em publicação nunca gera
outro commit; falhas e divergências interrompem a troca.

**Validação operacional antes da primeira troca real:** confirmar que um push
feito com o `GITHUB_TOKEN` desse workflow dispara o deploy do Netlify neste
repositório. Esse comportamento depende da integração GitHub–Netlify e ainda
precisa ser observado em produção. Um push do `GITHUB_TOKEN` não dispara outros
workflows do GitHub. Se o Netlify não atualizar, o pedido fica em publicação para
investigação; o painel não deve indicar que a rota foi confirmada. O agendamento
do GitHub pode atrasar ou falhar, então cinco minutos é a cadência solicitada,
não uma garantia de execução pontual. Em repositórios públicos sem atividade por
60 dias, o GitHub pode desativar workflows agendados; monitore esse estado no
painel do Actions antes de depender da troca automática.

Nunca registre o token OIDC, a chave do GitHub ou links de grupos em espera nos
logs do workflow. O link atualmente publicado permanece no HTML até um pedido
aprovado passar pelas verificações de Git, Netlify e backend.

O workflow serializa todas as execuções e testa as proteções antes de operar.
O backend reserva um pedido por dez minutos; o job termina em até oito minutos.
Cada comando Git tem timeout de trinta segundos. Um erro durante o push mantém a
publicação pendente, pois o GitHub pode ter recebido o commit. A próxima execução
reconcilia Git e Netlify antes de liberar nova tentativa. Git novo com Netlify
antigo nunca gera um segundo commit nem confirma a troca no painel.

Os pedidos expiram em duas horas antes de publicação. O painel mostra tentativas
e diagnóstico seguro. Após conclusão manual, o modo volta a desligado. A rotação
automática continua somente quando ativada explicitamente e exige contagem
recente, destino abaixo dos limites, convite e administrador verificados, envio
operacional e liberação de entrada. Esta implantação mantém o convite do G7.

Verificação local (sem acesso ao banco ou GitHub):

```sh
python3 -B -m unittest discover -s tests -p test_publish_route.py
```

Após implantar o backend e publicar o workflow, execute-o uma vez com o modo
desligado: deve terminar em `route_idle`, sem commit novo nem alteração de convite.
Para parar futuras trocas, desligue o modo no painel e desabilite o workflow;
uma publicação já iniciada precisa ser conferida/reconciliada antes de reverter.

