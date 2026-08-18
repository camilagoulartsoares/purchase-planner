# Purchase Planner

Aplicação pessoal para organizar produtos desejados, comparar prioridades e tomar decisões de compra com mais consciência.

Frontend publicado em: https://purchase-planner.vercel.app

## Tecnologias

- React, TypeScript, Vite e Tailwind CSS
- Node.js, Express e Prisma
- PostgreSQL, JWT, Cloudinary, Vercel e Render

## Funcionalidades

- Cadastro, edição, fotos, favoritos, filtros, marcas e status de produtos.
- Planejador inteligente e combinações dentro do orçamento.
- Radar de promoções e **Meus achados** por link.
- Assistente de compras que usa exclusivamente os produtos da conta.
- **Análise de Compra Consciente** para decidir se um item vale a pena.

## Análise de Compra Consciente

Em cada produto ainda não comprado, use **Vale a pena comprar?**. A análise calcula uma pontuação de 0 a 100 usando dados reais: prioridade, favorito, necessidade ou desejo, desconto, idade na lista, usos estimados, custo por uso, itens semelhantes, adiamentos e impacto no orçamento.

O painel também simula o cenário após a compra sem alterar o produto: saldo restante, itens que ainda cabem, itens que deixam de caber, próxima recomendação e combo atualizado.

Campos novos no produto:

- `purchaseIntent`: `NEED` ou `WANT`;
- `estimatedUses`: quantidade estimada de usos;
- `timesPostponed`: quantas vezes a compra foi adiada;
- `decisionStatus` e `lastAnalyzedAt`: preenchidos pela análise.

Depois de atualizar o código no backend, aplique a migration:

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

## Assistente “O que eu compro?”

Na Home, o Assistente de compras responde sobre orçamento, combos, favoritos, academia, trabalho, casa e itens para adiar. O backend busca os produtos pelo usuário autenticado; o frontend não envia uma lista de produtos como fonte de verdade.

O modo local funciona sem serviço externo. Para habilitar a camada opcional de IA, configure somente no backend/Render:

```env
AI_API_KEY=sua-chave
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-4o-mini
```

A chave nunca deve ser exposta no frontend. Caso a IA falhe, o assistente usa automaticamente o modo local.

## Desenvolvimento

```bash
npm --prefix backend run prisma:generate
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix backend test
```

## Encontre para mim — Personal Shopper IA

A Home agora inclui a área **Encontre para mim**, com conversa contextual e cards de produtos reais retornados pelo Google Shopping via SerpApi. A busca preserva o contexto da conversa (por exemplo, cor, tamanho e orçamento), mantém histórico e permite salvar o resultado em **Meus achados** ou adicioná-lo diretamente ao Planner.

Os dados comerciais exibidos nos cards — preço, loja, imagem, frete, avaliação e link — vêm exclusivamente do provider. Quando um dado não é fornecido pela fonte, ele não é inventado nem exibido.

### Variáveis do backend

Configure estas variáveis no arquivo `backend/.env` para desenvolvimento e no serviço do Render para produção:

```env
# Obrigatória para consultar produtos reais no Google Shopping
SERPAPI_API_KEY=sua_chave_da_serpapi

# Opcional, mas recomendada para interpretar pedidos conversacionais com a Responses API.
# Se ausente, a aplicação usa o interpretador local como fallback.
SHOPPER_AI_API_KEY=sua_chave_da_openai
SHOPPER_AI_API_URL=https://api.openai.com/v1/responses
SHOPPER_AI_MODEL=gpt-4o-mini
```

`SHOPPER_AI_API_KEY` pode reutilizar `AI_API_KEY` caso já esteja configurada. Nenhuma dessas chaves deve ser criada no frontend ou na Vercel. O frontend continua usando apenas `VITE_API_URL` para apontar para a API publicada.

Depois de configurar `DATABASE_URL`, aplique a migration do Personal Shopper no backend:

```bash
npm --prefix backend run prisma:generate
npx --prefix backend prisma migrate deploy
```

Para testar, entre na Home, abra **Encontre para mim** e envie: `Quero um Crocs até R$ 70`. Com uma `SERPAPI_API_KEY` válida, os cards retornam produtos reais; use **Salvar** para Meus achados ou **Planner** para criar uma peça na lista.

## Lojas e orçamento do Personal Shopper

O provider inicial é o Google Shopping via SerpApi. Os resultados podem incluir Mercado Livre, Shopee e outras lojas na mesma busca. Um teto rígido, como `até R$ 80`, é aplicado sobre os preços reais recebidos do provider: itens acima desse valor não são exibidos.

Mercado Livre e Shopee permanecem desacoplados pela interface `ProductSearchProvider`, permitindo adicionar integrações diretas no futuro sem alterar o chat, os cards, Meus achados ou o Planner.

## Notas de manutenção

- A URL original é preservada ao salvar produtos importados.
- Parâmetros de rastreamento são normalizados antes da persistência.
- Mídias inválidas usam placeholder na interface sem ocultar o produto.
- A galeria prioriza imagens e vídeos associados ao produto salvo.
- Produtos duplicados são identificados pela URL normalizada.
- O preço só é exibido quando a fonte informa um valor verificável.
- O frete permanece vazio quando a cotação não é confiável.
- A disponibilidade de roupas considera a variação P quando ela é identificável.
- Estados de promoções e Meus achados permanecem independentes.
- A seção Meus achados mantém carregamento, vazio e mensagens de erro.
- A revisão de importação permite corrigir campos antes de salvar.
- O card de produto mantém o link original para abrir a loja.
- A remoção de um achado atualiza a lista sem recarregar a página.
- O compartilhamento usa a API nativa quando disponível.
- A API bloqueia URLs locais e endereços privados.
- Redirecionamentos HTTP são validados antes de serem seguidos.
- Páginas intermediárias não são usadas como mídia de produto.
- Metadados Open Graph são usados apenas como fonte da própria página.
- Dados estruturados em JSON embutido são avaliados antes de campos vazios.
- Diagnósticos de importação são registrados no backend para investigação.
- Filtros mantêm a seleção atual ao navegar entre páginas.
- Ordenações usam critérios estáveis para evitar saltos visuais.
- Cards preservam texto alternativo para imagens de produtos.
- Botões de ação possuem rótulos acessíveis.
- Valores monetários seguem a formatação brasileira.
- Campos numéricos aceitam valor vazio durante a edição.
- Links externos são abertos em uma nova aba segura.
- Mensagens de sucesso desaparecem automaticamente.
- Listas longas possuem rolagem própria quando necessário.
- Modais mantêm o botão de fechar sempre acessível.
- A prévia por link não fecha enquanto o salvamento está ativo.
- Falhas de imagem não removem o item da lista.
- Vídeos usam carregamento de metadados antes da reprodução.
- Resultados vazios mostram uma mensagem orientativa.
- Erros de API permanecem visíveis para nova tentativa.
- O orçamento é tratado como valor independente dos filtros.
- Favoritos não alteram a prioridade de compra automaticamente.
- Produtos comprados não entram em sugestões de novos combos.
- Produtos desistidos permanecem separados dos desejados.
- A categoria escolhida é preservada na edição do produto.
- A origem do produto é mantida no link de compra.
- Cotações de frete não substituem preços de produto.
- Dados de promoção não atualizam Meus achados.
- A sincronização de marcas não altera produtos existentes.
- Logs de diagnóstico evitam incluir segredos do ambiente.
- A paginação informa a quantidade atual de resultados.
- Campos de busca não descartam o texto ao aplicar filtros.
- A ordenação por data usa o registro mais recente como referência.
- As imagens principais são escolhidas antes das miniaturas.
- A galeria reinicia ao abrir outro produto.
- A reprodução de vídeo não inicia automaticamente.
- O modal preserva rolagem interna em telas menores.
- A confirmação de exclusão exige uma ação explícita.
- As mensagens de erro não substituem dados já carregados.
- O carregamento de achados não interfere no Radar de promoções.
- O carregamento do Radar não interfere na lista de produtos.
- O planejamento considera apenas itens com status ativo.
- O cálculo de desconto não é exibido sem preço anterior válido.
- O campo de frete aceita ausência de informação.
- O CEP padrão não é exibido como custo de frete.
- O importador mantém a moeda informada pela fonte.
- A descrição importada pode ser revisada antes do salvamento.
- A marca pode permanecer em branco quando não for identificada.
- O nome da loja é derivado do domínio somente como último recurso.
- Vídeos indisponíveis não bloqueiam o restante da galeria.
- A URL normalizada não contém fragmentos de navegação.
- Respostas de API preservam o formato de sucesso existente.
- Logs de saúde não modificam informações de produtos.
- A autenticação continua obrigatória nos endpoints de achados.
- Dados pessoais não são incluídos nas notas de diagnóstico.
- A interface mantém contraste suficiente em ações principais.
- Títulos longos não impedem a abertura de detalhes.
- Descrições longas permanecem dentro da rolagem do modal.
- A marca não é inferida a partir de produtos relacionados.
- A loja não altera o título original do produto.
- Preços promocionais permanecem separados do preço original.
- O cálculo de total considera frete somente quando informado.
- A lista de compras mantém itens em ordem previsível.
- O botão de compra usa sempre a URL registrada.
- A atualização de um achado não duplica o card.
- A exclusão não afeta registros de outras fontes.
- A busca textual ignora diferenças simples de maiúsculas.
- Filtros vazios representam todas as opções disponíveis.
- A atualização de página mantém os produtos persistidos.
- O carregamento inicial não oculta seções da Home.
- Cards sem imagem usam uma ilustração neutra.
- A galeria não usa banners como foto principal.
- A mídia principal pode ser substituída por uma alternativa válida.
- O importador mantém a URL final após redirecionamentos.
- Redirecionamentos para destinos internos são recusados.
- Consultas externas têm limite de tempo para evitar travamento.
- Falhas externas não criam preços ou fretes fictícios.
- O status unknown é preservado sem evidência de estoque.
- O status out_of_stock depende de evidência da página.
- A disponibilidade não é estimada pelo desconto do produto.
- A quantidade de imagens não altera o preço salvo.
- A categoria não é derivada de mídia do produto.
- A revisão permite trocar a categoria antes do cadastro.
- A edição conserva a galeria já persistida.
- A remoção de mídia não remove o link original.
- O radar mantém suas fontes separadas por marca.
- O planner não usa produtos removidos como sugestão.
- O histórico de conversa não expõe credenciais.
- A busca de compras respeita o orçamento informado.
- Resultados externos sem URL não podem ser salvos.
- A lista de marcas não depende do carregamento de achados.
- O endpoint de saúde não consulta dados de produto.
- A API mantém respostas JSON estruturadas em erros.
- A documentação registra comportamentos de manutenção relevantes.
- A Home mantém o cabeçalho visível durante a navegação.
- Os cartões respeitam a largura disponível em telas compactas.
- A lista de produtos não depende da ordem de chegada das requisições.
- A seleção de favoritos não altera o preço registrado.
- As ações secundárias não recarregam a página inteira.
- A interface apresenta placeholders apenas para mídia ausente.
- Os modais evitam transbordamento horizontal.
- A busca por marca mantém os demais filtros aplicados.
- O limite de preço aceita valores decimais.
- A ordenação padrão privilegia registros recentes.
- As promoções continuam separadas do catálogo pessoal.
- O preço final não é calculado com valores desconhecidos.
- O produto salvo preserva a disponibilidade recebida.
- O importador não cria produto sem confirmação de salvamento.
- O link original continua editável na revisão.
- A galeria registra falhas de mídia sem bloquear a edição.
- O botão de adicionar evita múltiplos envios simultâneos.
- A resposta de duplicidade não remove o formulário em edição.
- O compartilhamento copia apenas o link do produto escolhido.
- A remoção exige confirmação antes de executar a API.
- O estado vazio orienta como adicionar o primeiro achado.
- A seção de achados possui rolagem quando a lista cresce.
- A página mantém mensagens de carregamento durante consultas.
- O backend limita redirects ao acessar URLs externas.
- A validação de URL rejeita protocolos não suportados.
- O coletor não converte página HTML em foto de produto.
- A importação ignora imagens repetidas pela mesma URL.
- A disponibilidade não é inferida sem evidência de variação.
- O frete é registrado somente após uma cotação válida.
- A descrição não é preenchida com texto de recomendação.
- Dados de Open Graph são tratados como fonte complementar.
- JSON-LD do produto é priorizado quando estiver disponível.
- A análise de compra não altera a lista sem ação do usuário.
- O assistente preserva o contexto da conversa atual.
- Produtos fora do orçamento não são sugeridos como cabíveis.
- O histórico de importação não contém tokens de acesso.
- O servidor registra falhas externas sem expor segredos.
- A documentação acompanha comportamentos pequenos do produto.
- Cada manutenção mínima permanece reversível via Git.
- A Home mantém seções independentes durante carregamentos paralelos.
- O estado de busca não altera itens já salvos.
- O catálogo respeita a categoria definida pelo usuário.
- A visualização de produto não exige abrir a loja externa.
- A foto principal tem fallback apenas quando realmente falhar.
- As miniaturas mantêm a ordem fornecida pela fonte.
- Setas de galeria não aparecem para uma única mídia.
- O vídeo pode ser reproduzido dentro do modal.
- O modal de revisão preserva campos preenchidos manualmente.
- A edição não substitui mídia sem ação explícita.
- O botão de cancelar não persiste alterações parciais.
- O salvamento bloqueia cliques repetidos durante a requisição.
- A mensagem de sucesso não depende de recarregamento.
- O botão de remover não participa do clique do card.
- A ação de compartilhar não modifica o produto.
- Links de afiliado são normalizados antes da deduplicação.
- Fragmentos de URL não criam novos registros.
- Redirecionamentos externos passam pela validação de segurança.
- O coletor limita a quantidade de mídias na resposta.
- Mídias de vídeo são distinguíveis de imagens na galeria.
- A API preserva null quando não encontra preço.
- A API preserva null quando não encontra frete.
- A API preserva unknown quando não encontra tamanho.
- A interface não traduz unknown em disponível.
- O filtro de produtos não reativa itens removidos.
- Combos não incluem produtos com status encerrado.
- A recomendação de compra usa os dados persistidos.
- A contagem de desejados acompanha o status atual.
- A análise de orçamento não altera valores salvos.
- O radar pode ser atualizado sem apagar Meus achados.
- A lista de marcas continua disponível sem dados de promoções.
- O assistente não usa produtos de outro usuário.
- Conversas do assistente permanecem vinculadas ao usuário.
- Resultados de busca externa conservam a fonte informada.
- Itens sem preço não são tratados como ofertas.
- O frete grátis condicional não é considerado frete zero.
- Páginas de bloqueio não são exibidas como imagem.
- Páginas intermediárias não são salvas como produto.
- O extrator prioriza sinais do documento do produto.
- Dados de recomendações não têm prioridade sobre o produto.
- A telemetria de importação usa identificador de rastreio.
- Logs de importação informam o tamanho do documento recebido.
- Logs de importação resumem o resultado sem expor dados sensíveis.
- A configuração de diagnóstico permanece opcional.
- As notas de manutenção documentam decisões reversíveis.
- A interface preserva estados independentes entre seções. Registro 194.
- O backend mantém validações antes da persistência. Registro 195.
- A galeria conserva a ordem de mídia recebida. Registro 196.
- A lista evita atualização visual desnecessária. Registro 197.
- Valores ausentes continuam explícitos na interface. Registro 198.
- A segurança de URL é aplicada antes de consultas externas. Registro 199.
- A navegação mantém ações do usuário isoladas. Registro 200.
- A documentação registra pequenas garantias do produto. Registro 201.
- Consultas externas não devem criar dados estimados. Registro 202.
- A interface preserva estados independentes entre seções. Registro 203.
- O backend mantém validações antes da persistência. Registro 204.
- A galeria conserva a ordem de mídia recebida. Registro 205.
- A lista evita atualização visual desnecessária. Registro 206.
- Valores ausentes continuam explícitos na interface. Registro 207.
- A segurança de URL é aplicada antes de consultas externas. Registro 208.
- A navegação mantém ações do usuário isoladas. Registro 209.
- A documentação registra pequenas garantias do produto. Registro 210.
- Consultas externas não devem criar dados estimados. Registro 211.
- A interface preserva estados independentes entre seções. Registro 212.
- O backend mantém validações antes da persistência. Registro 213.
- A galeria conserva a ordem de mídia recebida. Registro 214.
- A lista evita atualização visual desnecessária. Registro 215.
- Valores ausentes continuam explícitos na interface. Registro 216.
- A segurança de URL é aplicada antes de consultas externas. Registro 217.
- A navegação mantém ações do usuário isoladas. Registro 218.
- A documentação registra pequenas garantias do produto. Registro 219.
- Consultas externas não devem criar dados estimados. Registro 220.
- A interface preserva estados independentes entre seções. Registro 221.
- O backend mantém validações antes da persistência. Registro 222.
- A galeria conserva a ordem de mídia recebida. Registro 223.
- A lista evita atualização visual desnecessária. Registro 224.
- Valores ausentes continuam explícitos na interface. Registro 225.
- A segurança de URL é aplicada antes de consultas externas. Registro 226.
- A navegação mantém ações do usuário isoladas. Registro 227.
- A documentação registra pequenas garantias do produto. Registro 228.
- Consultas externas não devem criar dados estimados. Registro 229.
- A interface preserva estados independentes entre seções. Registro 230.
- O backend mantém validações antes da persistência. Registro 231.
- A galeria conserva a ordem de mídia recebida. Registro 232.
- A lista evita atualização visual desnecessária. Registro 233.
- Valores ausentes continuam explícitos na interface. Registro 234.
- A segurança de URL é aplicada antes de consultas externas. Registro 235.
- A navegação mantém ações do usuário isoladas. Registro 236.
- A documentação registra pequenas garantias do produto. Registro 237.
- Consultas externas não devem criar dados estimados. Registro 238.
- O layout mantém legibilidade em diferentes larguras. Registro 239.
- A API separa dados de produto e dados de promoção. Registro 240.
- A revisão preserva mudanças locais antes de salvar. Registro 241.
- Mídias sem URL válida não entram na galeria. Registro 242.
- Consultas de estoque não criam disponibilidade fictícia. Registro 243.
- A lista mantém o produto escolhido após uma edição. Registro 244.
<!-- maintenance-notes -->
