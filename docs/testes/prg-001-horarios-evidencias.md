# PRG-001 — Configuração dos horários semanais

## Critérios definidos antes da implementação

1. Administrador local ativo e verificado consulta e altera somente sua congregação.
2. Dia sem restrição oferece 24 horas; fechamento explícito é distinto de ausência
   de configuração. Um dia pode ter múltiplos intervalos sem sobreposição.
3. Intervalos são locais ao fuso IANA da congregação e não atravessam meia-noite.
4. Entradas e permissões são validadas no servidor; alteração exige sessão e CSRF.
5. Semana e fuso são salvos atomicamente, com histórico e rejeição de versão antiga.
6. Interface reutiliza temas e disposição responsiva da tela de Recursos.
7. Não incluir programação mensal, reservas ou publicação em staging.

Decisões do mantenedor: designações bloquearão apenas a alteração dos dias
afetados e do fuso. O sistema ainda não possui designações; esse bloqueio será
integrado ao modelo real quando ele existir, conforme PM-05 em
[PRG-001](../requisitos/PRG-001.md).

## Contrato HTTP

`GET /api/congregations/:id/weekly-hours` retorna `timezone`, `version` e `days`
com sete objetos `{ day, mode, intervals }`. `day` varia de 0 (domingo) a 6
(sábado); `mode` é `unrestricted`, `closed` ou `intervals`; cada intervalo possui
`start` e `end` no formato `HH:mm`. Nos dois primeiros modos, `intervals` é `[]`.

`PUT` na mesma rota recebe esse objeto completo e exige `x-csrf-token` da sessão.
Retorna a configuração canônica, ordenada por dia e início, com a nova versão.
O fuso é o identificador IANA, nunca um deslocamento UTC fixo. O limite 24:00 é
aceito exclusivamente como fim do próprio dia. Remover uma restrição é salvar o
dia como `unrestricted`, o que remove seu registro de restrição do banco.

Erros: 400 para identificador/entrada inválidos, 401 sem sessão, 403 para falta
de permissão ou CSRF, 409 para versão antiga. Todos preservam os dados anteriores.
Campos extras são rejeitados. Permissões exigem vínculo `LOCAL_ADMIN` ativo e
conta com e-mail verificado, independentemente da seleção ou visibilidade da UI.

## Teste representativo

Arquivo: `packages/database/src/weekly-hours.integration.spec.ts`.
O teste usa controller Nest real, HTTP local, sessões locais e repositório de
identidade PostgreSQL real. Substitui apenas o serviço de sessão externo por
`MemorySessionStore`, sem chamar Auth0, enviar e-mails ou usar dados reais.
O helper exige nome `_test`, cria banco único, aplica todo o histórico e remove
o banco após finalizar. Não usa mocks para permissões ou persistência.

Comando (ambiente de banco local ignorado pelo Git):

```powershell
pnpm exec node --env-file=.env.database.local node_modules/vitest/vitest.mjs run --project database-integration packages/database/src/weekly-hours.integration.spec.ts
```

Resultado: **aprovado**, um teste representativo com HTTP e PostgreSQL local.
Abrange padrão 24 horas, fechamento, múltiplos intervalos, persistência do fuso,
limite 24:00, rejeição de travessia/sobreposição/entradas inválidas, atomicidade,
isolamento entre congregações, CSRF, ausência de sessão, vínculo revogado,
e-mail não verificado, histórico, salvamento sem alteração e disputa de versões.

Verificações complementares aprovadas:

- Mesmo comando Vitest incluindo `schema-verification.integration.spec.ts` e
  `migrations.integration.spec.ts`: três arquivos, quatro testes aprovados,
  incluindo o representativo. Confirma aplicação/atualização do histórico e
  equivalência entre modelo Prisma e catálogo PostgreSQL.
- `pnpm exec vitest run --project web-unit apps/web/src/App.spec.tsx`: oito testes
  existentes da tela principal aprovados.
- `node node_modules/typescript/bin/tsc -p <projeto>/tsconfig.json --noEmit`
  para `apps/api`, `apps/web` e `packages/database`: aprovado.
- ESLint e Prettier nos arquivos TypeScript/CSS alterados: aprovados.
- `node scripts/check-docs.mjs`: links locais válidos.
- `node packages/database/node_modules/prisma/build/index.js validate --schema packages/database/prisma/schema.prisma`:
  modelo válido.
- `pnpm exec nest build --path tsconfig.build.json` em `apps/api` e
  `pnpm exec vite build` em `apps/web`: builds aprovados.

O runtime local possui Node 24.19.0 e pnpm 11.25.0. O atalho `pnpm typecheck`
recusou a diferença da versão pnpm fixada no projeto (11.19.0); as verificações
foram executadas pelos comandos diretos acima, sem alterar versões/configuração
do projeto. A CI mantém as versões fixadas.

## Preparação da publicação autorizada

A consulta ao CI após o PR #38 identificou uma expectativa antiga no teste de
atualização populada de IDN-001A: a comparação exata de `SELECT *` rejeitava a
nova coluna `weekly_hours_version`, embora os dados anteriores estivessem
preservados. A comparação agora exige todos os valores originais e permite
colunas aditivas; verifica separadamente o valor padrão zero da nova coluna.
O teste representativo dessa correção é o cenário de atualização populada em
`invitations.integration.spec.ts`, executado em PostgreSQL descartável antes da
publicação. Nenhuma migration incorporada foi alterada.

Resultado local da correção: **aprovado**, um cenário executado e dois não
selecionados. Comando: `pnpm exec node --env-file=.env.database.local node_modules/vitest/vitest.mjs run --project database-integration packages/database/src/invitations.integration.spec.ts -t "upgrades populated" --maxWorkers=1 --no-file-parallelism`.
ESLint do teste e revisão de whitespace também aprovados.

Limites: não verifica reservas, bloqueio por designados ou instantes em transições
de fuso, pois dependem de funcionalidades ausentes nesta entrega. Não houve
aplicação de migration nem publicação em staging.

## Publicação em staging — 15/10/2026

Após autorização posterior do mantenedor, o workflow
[Deploy controlled staging](https://github.com/AMeloNet/congregacaoprega/actions/runs/38842842059)
publicou o commit `5c9e133195cd6b7226f5503a82bc6aa7a47c23f4`, incorporado na
`main` após a correção do teste de atualização pelo
[PR #39](https://github.com/AMeloNet/congregacaoprega/pull/39).

Os quatro checks do [Verify da main](https://github.com/AMeloNet/congregacaoprega/actions/runs/38842681258)
passaram antes do acionamento: análise/unitários, PostgreSQL/migrations,
Chromium e contêiner. O workflow de publicação validou o SHA, aplicou
`20261016000100_create_weekly_hours` e acionou o Render para o mesmo commit;
os três jobs concluíram com sucesso.

Verificação pública após a implantação em
[staging](https://congregacaoprega-staging.onrender.com):

- Página inicial: 200, assets `index-C0PRowaY.js` e `index-DcKzzxvr.css`.
- Bundle: 200, contendo o formulário “Salvar horários semanais”, opção “Fechado”
  e rota `/weekly-hours`.
- `GET /api/health/live` e `GET /api/health/ready`: 200 com status `ok`.
- `GET /api/session` sem login: 200.
- `GET /api/congregations/00000000-0000-0000-0000-000000000000/weekly-hours`
  sem login: 401, confirmando a presença e proteção da rota.

Antes da publicação, a prontidão do banco retornou 503; depois da migration e
da implantação, retornou 200. Não foi necessário alterar credenciais ou
configuração. Nenhuma configuração semanal ou dado fictício foi criado no banco
persistente. A jornada autenticada de edição não foi executada em staging;
persistência e permissões permanecem validadas no teste HTTP com PostgreSQL
descartável. O deploy encerra sessões anteriores; pode ser necessário entrar
novamente. A etapa inicial desta entrega permaneceu sem staging até a nova
autorização registrada nesta conversa.
