# Horário do último clique por produto

Pedido: mostrar a data/hora do clique na tabela de produtos e ordenar do mais recente ao mais antigo. Escopo definido pela captura e pedido do usuário; preservar contagem agregada e ausência de identificação de visitantes.

1. Acrescentar `last_clicked_at timestamptz` anulável no agregado existente. Histórico sem horário continua nulo. O relógio do banco registra o recebimento de eventos de clique, não visualizações/filtros. Upsert atômico conserva o maior horário e incrementa a contagem.
2. No painel, selecionar a nova coluna, calcular o último clique de cada produto dentro do período consultado, exibir em America/Cuiaba e ordenar por horário decrescente. Registros sem horário ficam por último. Diferenciar ausência de clique de horário não coletado no histórico.
3. Validar migração, permissões e RPC com rollback; testar agregação, ordenação, datas, legado e interface. Revisão independente antes da publicação.
4. Publicar migração compatível antes do painel v12. Preservar v11 para rollback; a nova coluna não interfere na leitura antiga. Publicar explicação de privacidade no site via Git. Sem alteração ou reinício de bots.
5. Conferir painel publicado e registrar evidências e procedimento no Obsidian.

Escolha técnica: manter somente o último horário por agregado, suficiente para a tabela solicitada; não criar histórico individual de eventos. O horário indica recebimento pelo servidor e pode diferir alguns instantes do toque no aparelho.
