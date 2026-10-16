# PRG-001 — Horários semanais por ponto

## Critérios de aceitação definidos antes da implementação

1. Cada ponto possui horários semanais independentes; editar um não altera os
   intervalos de outro. Seleção explícita do local na tela de Recursos.
2. Decisão do mantenedor: pontos existentes e novos começam sem restrição,
   disponíveis 24 horas por dia. Não copiar horários anteriores da congregação.
3. Manter fechado/24 horas/intervalos personalizados por dia, sem sobreposição
   ou travessia de meia-noite. Não inferir horários pelo nome do ponto.
4. Preservar o fuso único da congregação, permissões e isolamento no servidor,
   sessão, CSRF, transação, histórico e proteção contra sobrescrita concorrente.
5. Usar migration versionada aditiva e preservar os dados históricos existentes.
6. Preservar temas e responsividade. Sem reservas ou programação mensal.

Exemplo: Feira de Sábado com domingo a sexta fechados e sábado 06:00–14:00;
outro ponto continua com seus próprios dias e horários.

## Contrato atual

`GET /api/congregations/:id/points/:pointId/weekly-hours` retorna
`{ timezone, timezoneVersion, version, days }`. `version` pertence ao ponto;
`timezoneVersion` pertence ao fuso compartilhado da congregação.
`days` contém sete objetos `{ day, mode, intervals }`, de domingo (0) a sábado
(6). Modos: `unrestricted`, `closed`, `intervals`. Nos dois primeiros,
`intervals` é vazio. Cada intervalo possui `start`/`end` em `HH:mm`; aceita-se
24:00 somente como fim do dia. Início inclusivo, fim exclusivo.

`PUT` na mesma rota recebe o objeto completo e exige `x-csrf-token`. Salva
apenas os intervalos do ponto selecionado e, se alterado, o fuso da congregação.
Trocar fuso preserva horas locais de todos os pontos; o formulário explica esse
efeito. Alterar somente intervalos não muda o fuso ou a versão de outro ponto.
Mudança de fuso invalida telas antigas de todos os locais. Salvar sem mudanças
não cria versão ou histórico.

400 para entrada/identificador inválidos, 401 sem sessão, 403 para ausência de
vínculo ativo de administrador local verificado ou CSRF, 404 para ponto
inexistente ou pertencente a outra congregação autorizada, 409 para versão
desatualizada do ponto ou fuso. Master sozinho não concede acesso.

A rota global anterior `/api/congregations/:id/weekly-hours` foi substituída;
não há herança nem restrição global ativa. As tabelas e histórico antigos são
preservados. Migration: `20261016000200_create_point_weekly_hours`.

## Validação

Teste representativo ajustado:
`packages/database/src/weekly-hours.integration.spec.ts`, com HTTP/Nest e
PostgreSQL real descartável. Verifica pontos independentes, padrão 24 horas
mesmo com configuração global antiga, fuso compartilhado com versão própria,
isolamento, ponto inexistente/estrangeiro, validações, CSRF, concorrência,
histórico e permissões. Sessão local, sem chamadas Auth0 ou e-mails reais.

Teste de interface: `apps/web/src/WeeklyHoursPanel.spec.tsx`, com transporte
controlado, verifica seleção de local, configuração somente sábado 06:00–14:00,
envio à rota específica com CSRF e troca para outro ponto sem carregar suas
restrições. Não substitui a validação da persistência em PostgreSQL real.

Resultados locais aprovados em 16/10/2026:

- `pnpm exec node --env-file=.env.database.local node_modules/vitest/vitest.mjs run --project database-integration packages/database/src/weekly-hours.integration.spec.ts --maxWorkers=1 --no-file-parallelism`:
  um teste HTTP/PostgreSQL aprovado na versão final.
- Verificações afetadas de `schema-verification.integration.spec.ts` e cenário
  `upgrades populated` de `invitations.integration.spec.ts`: aprovadas. Confirmam
  catálogo equivalente ao modelo/histórico e preservação dos dados anteriores.
- `node node_modules/vitest/vitest.mjs run --project web-unit apps/web/src/WeeklyHoursPanel.spec.tsx apps/web/src/PointsPanel.spec.tsx --pool=vmForks --maxWorkers=1 --no-file-parallelism`:
  dois testes aprovados. O sandbox impediu arquivos temporários do runner;
  a execução aprovada ocorreu fora dele. `App.spec.tsx`: oito testes aprovados.
- TypeScript API/web/database, ESLint e Prettier dos arquivos alterados: aprovados.
- Modelo Prisma válido, links locais válidos e `git diff --check` aprovado.
- Builds Nest API e Vite web aprovados. Asset web: `index-Cl1n1DL7.js`.

A mudança não integra o
bloqueio por designações, cujo modelo ainda não existe; a regra passa a valer
para dias afetados do próprio ponto e para o fuso da congregação. Não há
homologação autenticada em staging nesta validação local. A publicação da
atualização segue a autorização já dada pelo mantenedor e depende dos quatro
checks do commit da main aprovados, conforme o procedimento de staging.

## Publicação em staging — 16/10/2026

Implementação integrada pelo [PR #41](https://github.com/AMeloNet/congregacaoprega/pull/41).
Os quatro checks do [Verify da main](https://github.com/AMeloNet/congregacaoprega/actions/runs/38847246411)
passaram antes da publicação do SHA `346a29a3bf89893bb257b5f80d7d3754da4ec78d`.
O workflow [Deploy controlled staging](https://github.com/AMeloNet/congregacaoprega/actions/runs/38847389968)
validou o SHA, aplicou `20261016000200_create_point_weekly_hours` e acionou o
Render para o mesmo commit; os três jobs concluíram com sucesso.

Verificação pública no [staging](https://congregacaoprega-staging.onrender.com):

- Página inicial 200, assets `index-Cl1n1DL7.js` e `index-DcKzzxvr.css`.
- Bundle 200 com seletor “Local dos horários semanais” e “CONFIGURAÇÃO POR LOCAL”.
- `GET /api/health/live` e `GET /api/health/ready`: 200, status `ok`.
- `GET /api/congregations/00000000-0000-0000-0000-000000000000/points/00000000-0000-0000-0000-000000000000/weekly-hours`
  sem login: 401, confirmando a nova rota protegida.

Nenhum horário de ponto foi preenchido nem dado de teste criado no banco
persistente. Pontos existentes e novos permanecem sem restrição até configuração
explícita. O fuso foi preservado. A jornada autenticada não foi executada em
staging; API/PostgreSQL e interface foram validados pelos testes locais descritos
acima. Pode ser necessário entrar novamente após o deploy.
