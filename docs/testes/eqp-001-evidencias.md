# EQP-001 — Evidências do inventário

Validação local em 15/10/2026, Windows, Node 24.19.0 e PostgreSQL 18 instalado localmente. Banco descartável com sufixo `_test`, dados fictícios e porta exclusiva em localhost; nenhuma migration aplicada em ambiente persistente.

## Critérios confirmados antes da implementação

- Cadastro com nome de 1–80 caracteres, único por congregação sem diferenciar caixa; tipo carrinho, quiosque ou display e estado inicial ativo.
- Listagem, cadastro e mudanças de estado exclusivos de administrador local ativo, com isolamento no servidor.
- Observação opcional de até 250 caracteres, exclusiva dos administradores locais e preservada no histórico.
- Estado e histórico gravados atomicamente; interface integrada em Recursos, com estados de carregamento, erro e lista vazia, mantendo temas e layout responsivo.
- Fora do escopo: locais, horários, programação, reservas, exclusão e edição de nome/tipo.

## Resultados

| Verificação | Comando | Resultado |
| --- | --- | --- |
| Ciclo de cadastro, validação, listagem, inativação, reativação, histórico e isolamento | `pnpm exec vitest run --project database-integration packages/database/src/equipment.integration.spec.ts packages/database/src/schema-verification.integration.spec.ts --maxWorkers=1 --no-file-parallelism` | 2 testes aprovados em PostgreSQL real |
| Interface: cadastro e mudança de estado via API, CSRF e restrição de leitura | `node node_modules/vitest/vitest.mjs run --project web-unit apps/web/src/EquipmentPanel.spec.tsx --pool=vmForks --maxWorkers=1 --no-file-parallelism` | 1 teste aprovado |
| Tipos | `node node_modules/typescript/bin/tsc -p <pacote>/tsconfig.json --noEmit`, para API, web e database | Aprovado |
| Build web | `node ../../node_modules/vite/bin/vite.js build`, em `apps/web` | Aprovado |
| Modelo Prisma | `pnpm exec prisma validate`, em `packages/database` | Aprovado |
| Lint dos arquivos TypeScript alterados, formatação dos arquivos suportados e links Markdown | ESLint, Prettier e `node scripts/check-docs.mjs` | Aprovados |

A comparação de catálogo valida integralmente o histórico SQL. CHECKs, índices parciais e índices de expressão não representados no Prisma são excluídos somente da comparação com o modelo, permanecendo obrigatórios na comparação com o histórico.

A execução inicial excedeu o timeout padrão do teste; o teste de integração passou após ajuste para 120 segundos. Foram corrigidos o timestamp da fixture de revogação e o default SQL de timestamp para corresponder ao Prisma. Os pools locais `forks` e `threads` não concluíram a inicialização do teste web; `vmForks` executou o cenário com sucesso. O pnpm disponível localmente é 11.25.0; os comandos diretos foram usados porque os scripts de pacote exigem 11.19.0. Não houve alteração das versões exigidas pelo projeto.

Os cenários de reservas/capacidade T-EQP continuam planejados. Não foi feita homologação visual em navegador. A aplicação persistente posterior está registrada abaixo.

## Publicação em staging — 15/10/2026

Após autorização do mantenedor, o workflow [Deploy controlled staging #6](https://github.com/AMeloNet/congregacaoprega/actions/runs/38711773933) publicou o SHA imutável `5943e3d5eac82a7b69aeb7dae8a83b6d2deab8d1`, incorporado pelo PR #33.

- Validação do SHA, aplicação serializada das migrations e acionamento do Render concluídos com sucesso.
- O log de migration confirma `Applying migration 20261015000100_create_equipment` e conclusão de todo o histórico.
- O serviço [congregacaoprega-staging](https://congregacaoprega-staging.onrender.com) passou a servir os assets `index-D_AXbCMi.js` e `index-DNH9CHB4.css`; o bundle contém o inventário funcional e o formulário de cadastro.
- `GET /api/health/live` e `GET /api/health/ready`: 200, status `ok`.
- `GET /api/session` sem login: 200, `authenticated: false`.
- `GET /api/congregations/00000000-0000-0000-0000-000000000000/equipment` sem login: 401, confirmando a rota protegida publicada.

Não foram manipuladas credenciais nem criados equipamentos de teste no banco persistente. A jornada autenticada de cadastro e mudança de estado em staging não foi executada; a prova funcional continua sendo o teste com PostgreSQL descartável. A prévia estática não foi alterada.
