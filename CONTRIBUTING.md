# Contribuindo

Leia [AGENTS.md](AGENTS.md) e o requisito da etapa antes de alterar código.
Documentação e testes precedem implementação; execute novamente os testes após
cada incremento. Commits usam inglês (`type(scope): summary`); PRs, português.

## Pré-requisitos

- Node 24 (alvo de CI: `24.21.0`, em `.node-version`), pnpm `11.19.0`.
- Docker com suporte a contêineres Linux para o PostgreSQL local; neste Windows
  ainda não foi instalado. CI usa PostgreSQL 18.6 em contêiner descartável.
- Chromium instalado por `pnpm exec playwright install chromium` para E2E.

## Instalação e execução

```sh
pnpm install --frozen-lockfile
pnpm --filter @congregacaoprega/api start:dev
pnpm --filter @congregacaoprega/web dev
```

Copie os nomes de configuração de [`.env.example`](.env.example) para um
arquivo local ignorado pelo Git e substitua todos os placeholders. A API da
IDN-001C exige configuração Auth0, segredos distintos, `APP_BASE_URL` e
`EMAIL_TRANSPORT=capture`; detalhes e rotação estão no
[guia operacional](docs/operacao/identidade-auth0.md). O transporte `capture`
não envia mensagens pela rede.

A UI-001 pode ser visualizada executando apenas
`pnpm --filter @congregacaoprega/web dev` e abrindo o endereço informado pelo
Vite. Use o seletor de perfil e “Restaurar demonstração” para percorrer os
cenários. Os dados ficam somente na memória da página; recarregar preserva a
tela, mas reinicia os exemplos. A impressão de “Testemunho Público” é uma prévia
fictícia.

A interface de desenvolvimento usa proxy de `/api` para `127.0.0.1:3000`.
Defina `DATABASE_URL` no ambiente da API (nunca no Git), apontando para um banco
sob seu controle. A API exige essa variável para iniciar. A página consulta a
sessão de identidade. `GET /api/health/live` indica processo
ativo; `GET /api/health/ready` verifica `SELECT 1` e devolve 503 sem expor a URL
quando o PostgreSQL está indisponível. Programação, recursos e reservas da
UI-001 continuam demonstrativos; identidade, seleção de congregação e convites
de acesso usam a API.

## Verificações

```sh
pnpm docs:check
pnpm format
pnpm lint
pnpm typecheck
pnpm db:validate
pnpm build
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

`test:integration` requer `TEST_DATABASE_URL` de um PostgreSQL 18 descartável;
o nome do banco deve terminar em `_test`, e o usuário deve poder criar e remover
bancos de teste. Os testes criam nomes únicos, removem seus bancos e recusam
alvos sem esse sufixo. Exemplo fictício local:

```sh
TEST_DATABASE_URL=postgresql://postgres:test_only@127.0.0.1:5432/congregacaoprega_test pnpm test:integration
```

Não use essa credencial de exemplo em redes expostas. `pnpm test` executa toda a
suíte Vitest e também exige o banco de teste. `pnpm test:unit` não exige banco.
`pnpm test:e2e` inicia Vite localmente; Chromium deve estar instalado. A CI
executa documentação, análise, build, unitários, PostgreSQL, navegador e
contêiner em jobs separados, sem segredos de produção.

## Migrations

Prisma 7.10.0 lê `packages/database/prisma.config.ts`. O nome do banco e a URL
devem ser conferidos antes de qualquer operação. Configure `DATABASE_URL` fora
do repositório. Valide o modelo com `pnpm db:validate`. O histórico real começa
em IDN-001A; aplique migrations em banco descartável antes de propor promoção
para outro ambiente.

```sh
pnpm --filter @congregacaoprega/database db:migrate:dev --name descriptive_change
pnpm --filter @congregacaoprega/database db:migrate:status
pnpm --filter @congregacaoprega/database db:migrate:deploy
pnpm --filter @congregacaoprega/database db:migrate:diff
```

`migrate dev` destina-se apenas ao desenvolvimento descartável e precisa de
banco sombra. Revise o SQL gerado antes do PR. `migrate deploy` aplica histórico,
mas não detecta drift; complemente o diff com inspeção de catálogo para objetos
SQL não representados pelo Prisma. A aplicação e as migrations terão contas de
banco distintas em ambientes persistentes. Aplicação em produção terá job
exclusivo, backup recuperável e liberação específica. As fixtures de testes
usam configuração separada com validação obrigatória de `_test`; nunca as
inclua no artefato de produção.
