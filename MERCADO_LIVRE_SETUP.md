# Mercado Livre Setup

## Objetivo

Conectar oficialmente sua conta do Mercado Livre ao projeto para:

- autenticar com OAuth oficial;
- importar favoritos via `GET /users/me/bookmarks`;
- enriquecer itens via API oficial de anúncios;
- criar ou atualizar produtos em `Achadinhos`;
- manter sincronização manual e automática pelo backend.

## Dados para cadastrar no aplicativo do Mercado Livre

Use estes valores no cadastro da aplicação:

- Nome da aplicação: `Purchase Planner - Achadinhos`
- Descrição: `Wishlist pessoal com integração oficial ao Mercado Livre para importar favoritos e monitorar preços em Achadinhos.`
- Categoria/finalidade: escolha a opção mais próxima de `Compras`, `Marketplace`, `E-commerce`, `Ferramenta para consumidores` ou equivalente exibido no portal.
- Frontend público atual: `https://purchase-planner.vercel.app`
- Backend público atual: `https://closet-sonhos-api.onrender.com`
- Redirect URI de produção: `https://closet-sonhos-api.onrender.com/api/integrations/mercadolivre/callback`
- Redirect URI local: `http://localhost:3333/api/integrations/mercadolivre/callback`

## Redirect URIs

Cadastre exatamente estas URLs:

- Produção: `https://closet-sonhos-api.onrender.com/api/integrations/mercadolivre/callback`
- Desenvolvimento local: `http://localhost:3333/api/integrations/mercadolivre/callback`

Importante:

- a URI precisa bater exatamente com a usada pelo backend;
- protocolo, domínio, caminho e ausência/presença de barra final precisam ser idênticos;
- se você mudar a URL do backend, atualize também `MELI_REDIRECT_URI`.

## Permissões e produtos

Com base na documentação oficial usada na implementação:

- usuário autenticado: OAuth oficial com `GET /users/me`
- favoritos: `GET /users/me/bookmarks`
- anúncios públicos: `GET /items/{id}` e `GET /items?ids=...`

No portal do app, selecione os produtos/permissões mais próximos de:

- autenticação de usuário via OAuth;
- leitura de perfil do usuário autenticado;
- leitura de favoritos/bookmarks;
- leitura pública de itens/anúncios.

Se o portal usar nomenclatura diferente, priorize sempre acesso de leitura.

## Variáveis de ambiente

Cadastre no backend:

- `MELI_CLIENT_ID`
- `MELI_CLIENT_SECRET`
- `MELI_REDIRECT_URI`
- `MELI_TOKEN_ENCRYPTION_KEY`

Outras variáveis já existentes continuam válidas:

- `FRONTEND_URL`
- `JWT_SECRET`
- `DATABASE_URL`

## Onde configurar

### Render

No serviço `closet-sonhos-api`, adicione:

- `MELI_CLIENT_ID`
- `MELI_CLIENT_SECRET`
- `MELI_REDIRECT_URI`
- `MELI_TOKEN_ENCRYPTION_KEY`

Valor recomendado para `MELI_REDIRECT_URI` em produção:

`https://closet-sonhos-api.onrender.com/api/integrations/mercadolivre/callback`

### Vercel

Nenhum segredo do Mercado Livre deve ir para o frontend.

Você não precisa cadastrar:

- `MELI_CLIENT_SECRET`
- tokens OAuth
- `MELI_TOKEN_ENCRYPTION_KEY`

O frontend só consome a API já autenticada do seu backend.

## Como encontrar Client ID e Client Secret

Depois de criar o app no portal de developers do Mercado Livre:

1. abra a página do aplicativo;
2. copie `Client ID`;
3. copie `Client Secret`;
4. confirme a Redirect URI cadastrada;
5. configure tudo no backend.

## Como gerar a chave de criptografia

Use uma chave de 32 bytes.

Exemplo em PowerShell:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

Ou em Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Essa chave deve existir somente no backend.

## Como testar a conexão

1. configure as variáveis no backend;
2. reinicie a API;
3. abra a aba `Achadinhos`;
4. clique em `Conectar Mercado Livre`;
5. faça login no Mercado Livre na página oficial;
6. autorize o app;
7. volte ao projeto;
8. clique em `Sincronizar favoritos`.

## Como revogar o acesso

No projeto:

- use o botão `Desconectar`.

No Mercado Livre:

- revogue o aplicativo na área de segurança/autorização da sua conta, se a plataforma exibir essa opção.

## Observações

- o frontend nunca recebe `MELI_CLIENT_SECRET`;
- o frontend nunca recebe access token nem refresh token;
- o callback OAuth é processado exclusivamente pelo backend;
- sem as variáveis configuradas, a UI mostra integração indisponível sem quebrar a home.
