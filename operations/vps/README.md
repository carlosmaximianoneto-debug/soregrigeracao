# Publicação isolada na VPS

Este diretório prepara o publicador; adicionar arquivos ao Git não o instala nem ativa na VPS.

## Contrato

- Origem fixa: `https://github.com/carlosmaximianoneto-debug/soregrigeracao.git`, somente `refs/heads/main`. Commits automáticos de troca de convite entram no mesmo fluxo.
- Diretório exclusivo: `/srv/sorefrigeracao-site`. Releases imutáveis em `releases/<SHA40>`, referência `current`, cache Git `repository.git` e estado em `shared/deploy-state.json`.
- Projeto Compose `sorefrigeracao-site-prod`, serviço `web`, container `sorefrigeracao-site-web`, imagem `sorefrigeracao-site:<SHA40>` e bind `127.0.0.1:3190:8080`.
- Runtime: `shared/runtime.env`, arquivo regular `root:root 0600`. Cada release recebe `.runtime.env` como symlink **depois do build**. Nenhum segredo precisa entrar no Git ou no build context. Não usar ou montar o `.env` dos bots.
- `REFRI_SITE_IMAGE` e `REFRI_SITE_REVISION` são fornecidos ao Compose pelo publicador. `/healthz` deve responder `{ "ok": true, "revision": "<SHA40>" }`; o publicador também confere a imagem do container.
- `Dockerfile` e `compose.yaml` têm hashes fixados em `/etc/sorefrigeracao-site/deploy-policy.json`. Alterações nesses dois arquivos exigem revisão e atualização manual da policy. Isso impede que um commit comum acrescente mounts/privileged/portas ao comando Docker executado como root.
- O próprio publicador e as unidades systemd são cópias revisadas, root-owned, fora do checkout. Não são substituídos automaticamente por arquivos vindos do Git.
- Buildx dedicado `sorefrigeracao-site-builder`, driver `docker-container`, limitado a 768 MiB de RAM (sem swap extra) e 0,5 CPU. O publicador verifica o driver e os limites reais via Docker inspect antes de cada build; não modifica o builder padrão.

## Segurança e comportamento

Lock `flock` não bloqueante impede publicações simultâneas. O SHA atual não é reconstruído nem recriado. Antes de substituir uma release conhecida, sua saúde é conferida. Um journal grava a tentativa antes da ativação; queda/reboot entre troca de container e gravação de estado força recuperação antes da próxima publicação.

Somente arquivos/diretórios regulares são exportados do Git. Symlinks, hardlinks, devices, traversal, `.git` e `.runtime.env` são rejeitados, com limites de arquivos/tamanho. Nenhum script do repositório roda como root no host; scripts de build rodam dentro do Dockerfile previamente aprovado. O publicador nunca executa `docker compose down`, prune global, comandos PM2, reinício de Docker/Caddy ou alterações DNS.

Falha de build preserva a release corrente. Falha de ativação/saúde volta para a imagem e release anterior e verifica sua saúde. Se a primeira implantação falhar, apenas o serviço `web` deste projeto é parado. Se o rollback falhar, o journal permanece pendente para a próxima tentativa e a execução sai com erro. O SHA que falhou fica retido: o timer não o tenta novamente a cada dois minutos. Um novo SHA é elegível; `--retry-failed` libera tentativa manual do mesmo SHA após diagnóstico.

Estado, runtime e policy ficam fora do Git. Logs não despejam saída de build/Compose nem valores de ambiente. A existência de uma release no disco não prova publicação: `shared/deploy-state.json` registra somente a última confirmação saudável.

## Instalação revisada (não executada por este documento)

1. Conferir a branch main e o SHA aprovado. Revisar Dockerfile/Compose, este publicador e as unidades. A chave privada SSH fica local, nunca no servidor ou no Git.
2. Preservar a referência anterior do host (Caddy, PIDs dos bots e containers existentes). Criar/verificar `/srv/sorefrigeracao-site`, `shared` e `releases` como root, sem permissão de escrita para grupo/outros. Runtime já criado deve permanecer `root:root 0600`.
3. Instalar uma **cópia revisada** de `deploy.py` em `/usr/local/lib/sorefrigeracao-deploy/deploy.py`, `root:root 0755`. Instalar os arquivos service/timer em `/etc/systemd/system/`, `root:root 0644`. Criar `/etc/sorefrigeracao-site`, root-owned e sem escrita para terceiros.
4. No checkout revisado, executar `python3 operations/vps/deploy.py --print-policy`; transferir somente esse JSON de hashes para `/etc/sorefrigeracao-site/deploy-policy.json`, `root:root 0644`. Não executar `--print-policy` a partir da cópia instalada, pois sua localização já não é a raiz do checkout.
5. Provisionar uma única vez o builder dedicado com os comandos abaixo, usando exatamente o mesmo `DOCKER_CONFIG` do publicador. Não usar `--use`. Se já existir, inspecionar seus limites; não recriar/remover automaticamente. Depois rodar `/usr/bin/python3 /usr/local/lib/sorefrigeracao-deploy/deploy.py --check-only` como root. Este modo faz fetch, compara definições e valida limites do builder, sem build/troca de container; se houver recuperação pendente, falha sem atuar.
6. Fazer a primeira publicação manual com o mesmo comando sem `--check-only`, conferir `/healthz`, páginas/JSON/assets/analytics e `shared/deploy-state.json`. Conferir que os PIDs dos bots e containers Agenda continuam os mesmos. A migração do Caddy e do DNS é uma etapa separada, de responsabilidade do operador.
7. Depois da validação, `systemctl daemon-reload` e `systemctl enable --now sorefrigeracao-deploy.timer`. Isso ativa somente a nova unidade; não reinicia outros serviços. Confirmar com `systemctl list-timers sorefrigeracao-deploy.timer` e `journalctl -u sorefrigeracao-deploy.service -n 20`.

Provisionamento separado do builder (somente após revisão/autorização):

```sh
sudo install -d -o root -g root -m 700 /srv/sorefrigeracao-site/shared/docker-config
sudo env DOCKER_CONFIG=/srv/sorefrigeracao-site/shared/docker-config docker buildx create \
  --name sorefrigeracao-site-builder --driver docker-container \
  --driver-opt memory=768m,memory-swap=768m,cpu-period=100000,cpu-quota=50000,restart-policy=unless-stopped
sudo env DOCKER_CONFIG=/srv/sorefrigeracao-site/shared/docker-config docker buildx inspect \
  sorefrigeracao-site-builder --bootstrap
```

O timer verifica main cerca de dois minutos após terminar a execução anterior. Os builds usam explicitamente `docker buildx build --builder sorefrigeracao-site-builder --load`, com orçamento validado de 768 MiB e 0,5 CPU. Nenhum outro builder é selecionado ou alterado. O container web conserva limites próprios do Compose aprovado. [Driver docker-container e opções oficiais](https://docs.docker.com/build/builders/drivers/docker-container/).

## Rollback e manutenção

Para suspender somente a publicação automática: `systemctl stop sorefrigeracao-deploy.timer`. O site continua no container já ativo.

Para voltar somente à última release saudável: `/usr/bin/python3 /usr/local/lib/sorefrigeracao-deploy/deploy.py --rollback`. O comando verifica a saúde da imagem anterior e retém o SHA rejeitado para o timer não republicá-lo imediatamente. Não apaga dados nem reinicia bots. Se Dockerfile/Compose tiverem mudado entre releases, a policy também precisa incluir a decisão revisada; a verificação falha fechada em vez de executar uma definição não aprovada.

Releases e imagens anteriores são preservadas; não há limpeza automática/global. Monitorar disco. Limpeza futura deve enumerar explicitamente apenas releases/imagens deste projeto e proteger `current`, `previous` e qualquer tentativa pendente. Não deletar diretórios calculados sem verificar seu caminho resolvido.

Atualização do publicador ou da policy exige revisão manual e troca atômica dos arquivos root-owned. Não copiar cegamente a versão do Git para os caminhos de execução do host.

## Testes locais

`python -m unittest discover -s operations/vps -p 'test_*.py'`

Cobertura: SHA/path inválidos, exportação segura, origem de estado inválida, definições alteradas, publicação sem mudança, build com falha, health com falha, primeira implantação com falha, rollback explícito, interrupção e rollback pendente. Testes usam temporários dentro do workspace para evitar a virtualização de TEMP do sandbox Windows. Não acessam Docker, VPS, credenciais ou rede.
