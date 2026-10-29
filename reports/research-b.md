# Pesquisa e validação dos artigos B

Data de consulta: 2026-10-29. Arquivo entregue: `blog/articles-b.mjs`, exportação `articlesB`.

Os dez textos são originais em português, escritos como guias de seleção e comparação. As referências são páginas e documentos dos próprios fabricantes; os URLs finais foram abertos pela ferramenta de pesquisa. Os textos não reproduzem trechos longos, não apresentam experiência de campo, testes próprios, números de vendas, preços ou disponibilidade de estoque.

| Slug | Palavras no corpo | Fontes principais | Decisão editorial |
| --- | ---: | --- | --- |
| cortador-de-tubo-de-cobre | 658 | RIDGID, ROTHENBERGER | Diâmetro externo, espaço de giro e reposição |
| curvador-de-tubo-de-cobre | 656 | RIDGID, Yellow Jacket | Compatibilidade de tubo, raio, matrizes e acesso |
| torquimetro-para-refrigeracao | 638 | ROTHENBERGER, Yellow Jacket | Faixa de instrumento separada do torque do equipamento |
| serra-copo-para-ar-condicionado | 633 | Bosch | Material, camadas, profundidade útil e máquina |
| furadeira-ou-martelete-ar-condicionado | 685 | Bosch | Aplicação e acessórios, sem declarar que toda furadeira é incapaz de concreto |
| alicate-amperimetro-para-refrigeracao | 643 | Fluke, Fieldpiece | Categoria mais tensão, funções AC/DC separadas e limites de True RMS |
| termometro-infravermelho-ou-contato | 648 | Fluke, Testo | Superfície versus contato, área de leitura e emissividade |
| detector-de-vazamento-refrigerante | 633 | Fieldpiece, INFICON | Refrigerante e sensor exatos; localizador não é monitor ambiental |
| balanca-digital-para-refrigeracao | 668 | Fieldpiece, Testo | Massa total, resolução versus exatidão e válvula opcional |
| bomba-de-dreno-ar-condicionado | 662 | Aspen, Sauermann | Vazão no ponto de trabalho, percurso e manutenção |

Contagem: introdução, resposta direta, subtítulos, parágrafos, listas e tabelas, sem título, metadados, rótulos de fontes ou links relacionados. Total: 6.524 palavras.

As páginas estrangeiras servem como referências técnicas dos modelos citados, sem prometer disponibilidade no Brasil. No guia de furadeira/martelete há ressalva explícita sobre códigos e versões locais. O guia de bombas de dreno não transporta especificações entre gerações ou versões regionais; a Mini Orange atual consultada é FP3577. Dois URLs regionais da Testo que não renderizaram foram substituídos pela página finlandesa em inglês e pelo manual oficial.

Todos os links de catálogo usam `/#catalogo`. Os artigos não contêm HTML ou Markdown no conteúdo. A conversão para o grupo de WhatsApp fica a cargo do componente de CTA comum do template do blog, sem inserir URLs de convite ou promessas comerciais nos textos.

Verificações executadas: `node --check blog/articles-b.mjs`, importação do módulo, dez slugs únicos, extensão entre 550 e 850 palavras, pelo menos duas fontes por artigo, datas fixas 2026-10-29 e destinos do catálogo.
