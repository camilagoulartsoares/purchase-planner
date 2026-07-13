# Meu Closet dos Sonhos

Caderno digital pessoal para anotar peças que você pensa em comprar com o tempo — e registrar o que já entrou no seu dia a dia.

Não é loja e não processa pagamento. Os dados ficam salvos no seu computador.

## Precisa de Docker?

**Não.** Para uso em casa, o app usa **SQLite**: um arquivo local (`backend/prisma/dev.db`).  
Você só precisa do **Node.js**.

Docker / PostgreSQL são opcionais (para quem quiser outro banco depois).

## Como rodar em casa (sem Docker)

### 1. Instalar dependências (uma vez)

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run db:seed

cd ../frontend
cp .env.example .env
npm install
```

### 2. Subir backend e frontend

Terminal 1 — API:
```bash
cd backend
npm run dev
```

Terminal 2 — site:
```bash
cd frontend
npm run dev
```

- Site: http://localhost:5173  
- API: http://localhost:3334  

Conta de demonstração:
- e-mail: `demo@closet.local`
- senha: `demo1234`

### Onde os dados ficam?

Em `backend/prisma/dev.db`.  
Se você fizer backup desse arquivo, guarda usuários e peças.

## Estrutura

```
/frontend
/backend
README.md
```

## Cloudinary (fotos)

Em casa funciona sem Cloudinary (as imagens entram em modo local).  
Se quiser hospedar fotos na nuvem depois, preencha as chaves no `backend/.env`.

## Testes da API

```bash
cd backend
npm test
```
