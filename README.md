# Purchase Planner

Projeto pessoal para organizar uma wishlist visual de produtos, marcas, imagens, filtros e status.

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
- Skeleton loading.
- API com persistência em PostgreSQL.
- Upload de imagens com Cloudinary.
- Deploy do frontend e backend.

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
8. O painel também mostra o valor total da lista atual e uma barra visual para comparar esse total com o orçamento.
9. Ele mostra quantas peças cabem no orçamento.
10. Ele aponta qual categoria está concentrando mais dinheiro, por exemplo vestidos, calças ou bolsas.

Em resumo: antes o app mostrava a wishlist; agora ele também ajuda a tomar uma decisão de compra mais organizada.
