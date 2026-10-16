# EQP-001 — Pontos de pregação

Validação local em 15/10/2026, PostgreSQL 18 descartável em localhost. Nenhuma alteração em staging.

Critérios definidos antes da implementação e confirmados pelo mantenedor: nome único na congregação, endereço separado e descrição opcionais; capacidade total inicial 1 e inteira positiva; ao menos um tipo permitido, compartilhando o enum do inventário, mesmo sem unidades cadastradas. Administrador local ativo com e-mail verificado pode cadastrar, listar e editar todos esses campos. Sem exclusão, inativação, programação ou reservas.

## Verificações

- `node node_modules/vitest/vitest.mjs run --project database-integration packages/database/src/points.integration.spec.ts packages/database/src/schema-verification.integration.spec.ts --maxWorkers=1 --no-file-parallelism`: 2 testes aprovados. Cobrem persistência, edição, duplicação, validações, capacidade padrão, tipos sem inventário, isolamento, perfil publicador, vínculo revogado e e-mail não verificado. Comparação do catálogo com histórico SQL e modelo Prisma aprovada.
- `node node_modules/vitest/vitest.mjs run --project web-unit apps/web/src/PointsPanel.spec.tsx --pool=vmForks --maxWorkers=1 --no-file-parallelism`: 1 teste aprovado, cobrindo cadastro, edição, CSRF e restrição de acesso.
- TypeScript de API e web, ESLint dos arquivos alterados, build Vite, formatação dos arquivos suportados e `node scripts/check-docs.mjs`: aprovados.

A primeira execução identificou que arrays de enum eram retornados como texto pelo driver; o SELECT agora converte para text[], mantendo o contrato JSON de lista. A comparação Prisma identificou diferença de nulidade do array; a migration usa CHECK explícito para impedir NULL, compatível com a representação do Prisma. Ambos os testes passaram após as correções.

O sandbox impediu a inicialização normal do teste web e do PostgreSQL; as execuções aprovadas ocorreram fora dele com autorização da ferramenta. Não foram utilizados dados reais. Não houve homologação visual manual em navegador nem aplicação da migration em banco persistente.

Contrato em [EQP-001](../requisitos/EQP-001.md). Migration nova: `20261015000200_create_preaching_points`.


## Publicação em staging — 15/10/2026

Após autorização do mantenedor, o workflow [Deploy controlled staging #7](https://github.com/AMeloNet/congregacaoprega/actions/runs/38831698689) publicou o commit `4e87d2da18d7d14f344bbc642f86943a6c87692e`.

Antes da publicação, o [PR #36](https://github.com/AMeloNet/congregacaoprega/pull/36) corrigiu o teste antigo de atualização do banco que ainda esperava exatamente duas migrations. O cenário representativo de atualização populada passou em PostgreSQL 18 descartável. Os quatro checks do [Verify da main](https://github.com/AMeloNet/congregacaoprega/actions/runs/38831541758) passaram antes do acionamento do deploy.

- O workflow confirmou o SHA, aplicou `20261015000200_create_preaching_points` e acionou o Render com o mesmo SHA; os três jobs concluíram com sucesso.
- O staging passou a servir `index-CzOodgYT.js` e `index-HZdhuf2F.css`. O bundle contém o formulário Cadastrar ponto, o campo de endereço e a rota de pontos.
- `GET /api/health/live` e `GET /api/health/ready`: 200 com status ok.
- `GET /api/session` sem login: 200.
- `GET /api/congregations/00000000-0000-0000-0000-000000000000/points` sem login: 401, confirmando a rota protegida publicada.

Não foram criados pontos de teste no banco persistente nem manipuladas credenciais. A jornada autenticada de cadastro e edição em staging não foi executada; a validação funcional permanece nos testes com PostgreSQL descartável e na interface. O deploy encerra as sessões anteriores; pode ser necessário entrar novamente.
