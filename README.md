# Purchase Planner

Projeto pessoal para organizar uma wishlist visual de produtos, marcas, imagens, filtros e status.
Repositorio dividido entre `frontend` e `backend`.

Deploy: https://purchase-planner.vercel.app

## Tecnologias

- React
- TypeScript
- Vite
- Tailwind CSS
- Node.js
- Express
- Prisma
- PostgreSQL
- Cloudinary
- JWT
- Docker
- Vercel
- Render

## O Que Foi Feito

- Autenticação com sessão JWT.
- Cadastro e edição de registros com imagens.
- Organização por marcas e categorias.
- Galeria com zoom e navegação.
- Favoritos e status.
- Filtros, busca e ordenação.
- Planejador inteligente de próxima compra.
- Combo sugerido com a melhor combinação de peças dentro do orçamento.
- Skeleton loading.
- API com persistência em PostgreSQL.
- Upload de imagens com Cloudinary.
- Deploy do frontend e backend.
- **Meus achados**: salve produtos de outras lojas apenas colando o link.
- **Assistente de compras**: chat que recomenda apenas itens já cadastrados na conta, com modo local quando a IA não estiver configurada.

## Assistente “O que eu compro?”

Na Home, use o **Assistente de compras** para pedir recomendações, combos, favoritos dentro de um orçamento ou itens para adiar. A rota consulta os produtos do usuário autenticado no backend; o frontend nunca envia uma lista de produtos como fonte de verdade.

O modo local reconhece orçamento (por exemplo, `R$ 500`), combo/combinação/looks, academia, trabalho, casa, favoritos e perguntas sobre adiar, pior custo-benefício ou itens caros para a prioridade. Ele também funciona sem configuração externa.

Para habilitar IA, configure somente no backend/Render:

```env
AI_API_KEY=sua-chave
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-4o-mini
```

`AI_API_KEY` nunca deve ser configurada no frontend. Se a chamada falhar ou a resposta não for válida, o assistente usa automaticamente o modo local.

## Adicionar produto por link

Na Home, a seÃ§Ã£o **Meus achados** tem o botÃ£o **Adicionar por link**. Cole a URL de um produto, revise os dados encontrados e salve sem precisar criar um card manualmente.

- A prÃ©via busca nome, loja, descriÃ§Ã£o, preÃ§o, imagens e vÃ­deos quando a loja os disponibiliza.
- A galeria usa apenas mÃ­dias identificadas como sendo do produto; imagens de banners e recomendaÃ§Ãµes sÃ£o descartadas.
- Antes de salvar, todos os campos podem ser corrigidos manualmente.
- Os achados ficam separados do Radar de promoÃ§Ãµes e podem ser editados, compartilhados ou removidos.
- O mesmo link normalizado nÃ£o pode ser salvo duas vezes.

### Limites de dados externos

Cada loja expÃµe informaÃ§Ãµes de um jeito. Quando uma loja bloqueia leitura automÃ¡tica ou exige carrinho, login, CAPTCHA ou CEP para o frete, o app preserva apenas os dados que foram realmente encontrados e deixa os demais campos para preenchimento manual. Nenhum preÃ§o, frete, marca ou imagem Ã© inventado.

## Planejador Inteligente

O Planejador Inteligente é um painel novo na página inicial que ajuda a decidir qual peça comprar primeiro, sem precisar comparar tudo manualmente.

Passo a passo do que ele faz:

1. Você informa um orçamento no campo **Orçamento**.
2. O app salva esse valor no navegador, então ele continua lá quando você voltar.
3. O painel olha para as peças que ainda não foram compradas nem desistidas.
4. Ele calcula quais peças cabem dentro do orçamento informado.
5. Ele dá mais peso para peças com prioridade alta, favoritas e com desconto.
6. Ele escolhe uma peça como recomendação principal em **A compra que mais faz sentido agora**.
7. Se você concordar com a sugestão, pode clicar em **Registrar compra** direto pelo painel.
8. Quando mais de uma peça faz sentido, ele monta um **Combo sugerido** com a melhor combinação dentro do orçamento.
9. O combo mostra o valor total planejado, quanto sobra do orçamento e as principais peças escolhidas.
10. O painel também mostra o valor total da lista atual e uma barra visual para comparar esse total com o orçamento.
11. Ele mostra quantas peças cabem no orçamento.

Em resumo: antes o app mostrava a wishlist; agora ele também ajuda a tomar uma decisão de compra mais organizada, incluindo uma sugestão principal e um combo otimizado para aproveitar melhor o orçamento.
