# Soma no NAS

Esta cópia empacota apenas o web app em uma imagem Docker. O Soma precisa de um
PostgreSQL já existente: o repositório original não contém o schema inicial
completo, apenas migrações incrementais. Para uma instalação pessoal, a opção
mais simples é continuar usando o Neon/PostgreSQL que já contém os seus dados.

## 1. Preparar o ambiente

No NAS, instale Docker Engine e Docker Compose v2. Depois copie os arquivos
`docker-compose.yml` e `.env.nas.example` para uma pasta permanente, renomeie o
segundo para `.env` e preencha:

- `DATABASE_URL` apontando para o PostgreSQL/Neon;
- `AUTH_SECRET`, gerado com `openssl rand -base64 32`;
- `NEXT_PUBLIC_BASE_URL` com a URL real do NAS;
- `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET` de um GitHub OAuth App.

No OAuth App, use como callback exatamente:

```text
http://NAS-IP:3456/api/auth/callback/github
```

Para acesso pela internet, prefira HTTPS atrás de um reverse proxy e use a URL
HTTPS também no OAuth App e em `NEXT_PUBLIC_BASE_URL`.

## 2. Subir a aplicação

```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs -f soma
```

Abra `http://NAS-IP:3456`. Para atualizar depois de uma nova publicação:

```bash
docker compose pull
docker compose up -d
```

O `.env` contém credenciais e não deve ser enviado ao GitHub nem incluído em
backups públicos.

## 3. Publicar no Docker Hub via GitHub Actions

Crie o repositório público `drmspidi/soma` no Docker Hub e um Access Token com
permissão de leitura/escrita. No fork do GitHub, em **Settings → Secrets and
variables → Actions**, crie:

- `DOCKERHUB_USERNAME`: `drmspidi`;
- `DOCKERHUB_TOKEN`: o Access Token do Docker Hub.

Cada push no `main` publica `drmspidi/soma:latest` e uma tag curta do commit.
Também é possível iniciar o workflow manualmente na aba **Actions**.

## Banco de dados

As migrações em `web/lib/db/migrations/` são incrementais e devem ser aplicadas
em ordem ao banco que já contém o schema do Soma. Este fork não inventa um
Postgres vazio no Compose, porque isso iniciaria o container sem as tabelas
principais. Se for necessário abandonar o Neon e migrar para um PostgreSQL no
NAS, primeiro faça um `pg_dump` do banco atual, restaure-o no NAS e só então
aponte `DATABASE_URL` para o novo endereço.
