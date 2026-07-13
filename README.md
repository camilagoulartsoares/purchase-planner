# Meu Closet dos Sonhos

Aplicação pessoal para registrar peças que você pensa em comprar ao longo do tempo — e também as que já entrou na sua rotina.

Não é uma loja. Não processa pagamento. Serve apenas como um caderno digital do seu próprio closet: anotar o que deseja, acompanhar preços com calma e lembrar o que já foi escolhido.

## Estrutura

```
/frontend   React + Vite + TypeScript + Tailwind
/backend    Node.js + Express + Prisma + PostgreSQL
docker-compose.yml
```

## Pré-requisitos

- Node.js 20+
- Docker (para o PostgreSQL)
- Conta Cloudinary (opcional em desenvolvimento; sem ela, o upload usa fallback local)

## Configuração

### 1. Banco de dados

```bash
docker compose up -d
```

PostgreSQL fica em `localhost:5433` (usuário/senha/db: `closet`).

### 2. Backend

```bash
cd backend
cp .env.example .env
# ajuste JWT_SECRET e, se quiser, as chaves do Cloudinary
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

API em `http://localhost:3334`.

Conta de demonstração do seed:

- e-mail: `demo@closet.local`
- senha: `demo1234`

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

App em `http://localhost:5173`.

## Variáveis de ambiente

Veja:

- `backend/.env.example`
- `frontend/.env.example`

Nunca versione senhas, tokens ou chaves reais.

## Funcionalidades

- Cadastro e login com JWT
- Cada pessoa vê apenas as próprias peças
- CRUD de produtos com foto (Multer + Cloudinary)
- Filtros, busca, ordenação e paginação na API
- Link externo “Comprar na loja” (abre a página da marca; sem checkout interno)
- Status: quero comprar, esperando promoção, já comprei, desisti

## Testes

```bash
cd backend
npm test
```

## Produção

```bash
cd backend && npm run build && npm start
cd frontend && npm run build
```

Sirva o `frontend/dist` com o servidor estático de sua preferência e aponte `VITE_API_URL` para a API.
