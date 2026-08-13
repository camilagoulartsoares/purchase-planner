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
<!-- maintenance-notes -->
