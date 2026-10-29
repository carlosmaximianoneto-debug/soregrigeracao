# Pesquisa e validação — artigos A

Data editorial: 29/10/2026. Arquivo: `blog/articles-a.mjs`.

Os textos são guias de compra originais. A orientação prática foi organizada por necessidade, composição do conjunto e critérios de comparação. Os exemplos de produtos são referências técnicas, sem afirmação de teste próprio, estoque, preço ou preferência comercial. As URLs das fontes foram encontradas e conferidas por busca e abertura nas páginas e documentos oficiais dos fabricantes.

| Artigo | Palavras no conteúdo | Referências |
| --- | ---: | ---: |
| ferramentas-para-refrigerista-kit-iniciante | 689 | 2 |
| bomba-de-vacuo-3-cfm-ou-6-cfm | 716 | 3 |
| bomba-de-vacuo-simples-ou-duplo-estagio | 695 | 3 |
| vacuometro-digital-como-escolher | 708 | 2 |
| manifold-analogico-ou-digital | 656 | 2 |
| manifold-r32-r410a-compatibilidade | 667 | 3 |
| mangueiras-para-manifold-como-escolher | 688 | 3 |
| bomba-de-limpeza-ar-condicionado | 679 | 2 |
| bolsa-coletora-limpeza-split | 697 | 3 |
| flangeador-excentrico-como-escolher | 684 | 2 |

A contagem inclui introdução, resposta direta, títulos de seções, parágrafos, listas e tabelas; não inclui metadados, fontes ou navegação. Total: 6.879 palavras.

## Critérios e evidência

- Kits: composição dos kits Mastercool Mini-Split e Heat Pump, usando a diferença entre conjuntos como exemplo de conferência de itens. Não foram transcritas listas integrais dos fabricantes.
- Bombas: fichas Mastercool 3/6 CFM, catálogo de um/dois estágios e manual Fieldpiece. Vazão foi separada de pressão final; não há regra por BTU, tempo garantido nem alvo universal de vácuo.
- Vacuômetro: manuais Fieldpiece MG44 e Mastercool 98061. Foram usados exemplos de montagem e manutenção, sem publicar procedimentos químicos ou limites que possam ser aplicados indevidamente a outro modelo.
- Manifolds: ficha Testo 550s, configurações Yellow Jacket Series 41, guia A2L e manual Testo. Presença de perfil, escala, conexões e aprovação de uso são tratados separadamente.
- Mangueiras: documentação Yellow Jacket, distinguindo pressão de trabalho e ruptura, aplicação e terminais. Nenhum valor foi generalizado entre famílias.
- Limpeza: fichas SpeedClean CJ-125 e CJ-200E. Foram usados exemplos de alimentação e conteúdo; não foram reproduzidas promessas de produtividade ou pressão universalmente segura. Não foi localizada documentação Suryha utilizável na pesquisa, portanto ela não foi citada.
- Coletor: fichas SpeedClean MSB-KIT, MSB-KIT-XL e material oficial de proteção. A escolha foi orientada por dimensões, sem generalizar tamanho a partir de BTU.
- Flangeador: fichas Mastercool 70057-A e NAVAC NEF6LM. Liberação na ferramenta foi diferenciada do torque de aperto da conexão; não há procedimento de instalação.

## Verificações executadas

`node --check blog/articles-a.mjs` passou. Importação ES Module e validação em Node confirmaram 10 artigos únicos, todos os campos obrigatórios, 550–850 palavras por artigo e pelo menos duas fontes por artigo. Links de catálogo usam `/#catalogo`; links relacionados usam exclusivamente slugs existentes neste módulo. Todas as strings de conteúdo são texto simples e as datas são `2026-10-29`.

Não houve alteração em outros arquivos nem deploy por este agente. O template principal é responsável pela apresentação de fontes e CTAs do grupo de WhatsApp.
