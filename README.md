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
