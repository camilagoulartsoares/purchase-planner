# Meu Closet dos Sonhos

Caderno digital pessoal — peças, preços e fotos salvos de forma permanente.

## Filtros na marca Cotih

Na página da marca aparecem só categorias com produtos, por exemplo:

- Todos
- Calças
- Vestidos
- **Tops e corsets**

## Guardar dados FORA do PC da empresa

Use **Docker + PostgreSQL** (banco em volume) e, de preferência, **Cloudinary** (fotos na nuvem).

### 1) Cloudinary (fotos na internet)

1. Crie conta grátis: https://cloudinary.com  
2. Copie Cloud Name, API Key e API Secret  
3. Coloque no arquivo `.env` na raiz (veja `.env.docker.example`)

Sem Cloudinary, as fotos ainda ficam no **volume Docker** `closet_uploads` (sobretudo se o servidor não for o PC da empresa).

### 2) Subir tudo com Docker

Na pasta do projeto:

```bash
cp .env.docker.example .env
# edite .env com JWT_SECRET e Cloudinary

docker compose up -d --build
```

- Site: http://localhost:8080  
- API: http://localhost:3334  

Os dados do banco ficam no volume `closet_pg_data` (não somem ao reiniciar o container).

### 3) Importar o que já existe no seu PC

Se você já cadastrou peças localmente:

```bash
cd backend
# com o Postgres do Docker ligado:
npx prisma generate
npx prisma db push
npm run db:import
```

O arquivo `backend/data/export-sqlite.json` traz usuários, marcas, produtos e fotos (caminhos).

### 4) Acessar de qualquer lugar

Opções:

1. **VPS / nuvem** (DigitalOcean, Oracle Free, Railway, Render): rode o mesmo `docker compose` no servidor e abra a porta 8080 (ou use um domínio + HTTPS).  
2. **Cloudinary preenchido**: fotos abrem de qualquer dispositivo.  
3. **Backup**: `cd backend && npm run backup` e copie `backend/backups` + faça dump do Postgres no servidor.

### Desenvolvimento local (sem build Docker do front)

```bash
docker compose up -d postgres
cd backend && cp .env.example .env && npm i && npx prisma db push && npm run db:import && npm run dev
cd frontend && npm i && npm run dev
```

Login:
- `camilagoulartsoares@yahoo.com` / `demo1234`

## Importante

- Não dependa só do disco do PC da empresa.  
- Postgres no Docker = preços e cadastros persistentes.  
- Cloudinary = fotos acessíveis de casa, celular, etc.  
- O seed **não apaga** produtos existentes.
